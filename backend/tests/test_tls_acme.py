# Smart Home Health
# Copyright (C) 2026 John Carty
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""tls_acme unit tests: renewal decision, subdomain normalization, DuckDNS
calls and DoH propagation polling (httpx stubbed), error mapping. The ACME
protocol itself is the `acme` library's responsibility and is exercised by
the optional pebble integration job, not unit-mocked here."""
import datetime as dt

import pytest

import tls_acme
from tls_acme import (
    BadTokenError, DnsTimeoutError, DuckDnsIssuer, NetworkError,
    RateLimitedError, needs_renewal, normalize_subdomain,
)

UTC = dt.timezone.utc


class TestNeedsRenewal:
    def test_no_cert_needs_renewal(self):
        assert needs_renewal(None) is True

    def test_fresh_cert_does_not(self):
        now = dt.datetime(2026, 7, 7, tzinfo=UTC)
        assert needs_renewal(now + dt.timedelta(days=60), now=now) is False

    def test_expiring_cert_does(self):
        now = dt.datetime(2026, 7, 7, tzinfo=UTC)
        assert needs_renewal(now + dt.timedelta(days=10), now=now) is True

    def test_boundary(self):
        now = dt.datetime(2026, 7, 7, tzinfo=UTC)
        assert needs_renewal(now + dt.timedelta(days=30, hours=1), now=now) is False
        assert needs_renewal(now + dt.timedelta(days=29, hours=23), now=now) is True


class TestNormalizeSubdomain:
    def test_bare_name(self):
        assert normalize_subdomain("myhub") == "myhub"

    def test_full_domain_and_case(self):
        assert normalize_subdomain("MyHub.duckdns.org") == "myhub"

    def test_pasted_url(self):
        assert normalize_subdomain("https://myhub.duckdns.org/") == "myhub"

    @pytest.mark.parametrize("bad", ["", "  ", "my hub", "my.hub", "a/b"])
    def test_invalid(self, bad):
        with pytest.raises(ValueError):
            normalize_subdomain(bad)


class _FakeResponse:
    def __init__(self, text="OK", json_data=None, status_code=200):
        self.text = text
        self._json = json_data or {}
        self.status_code = status_code

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx
            raise httpx.HTTPStatusError("boom", request=None, response=None)


def _issuer():
    return DuckDnsIssuer("myhub", "tok-123")


class TestDuckDnsCalls:
    def test_preflight_ok(self, monkeypatch):
        seen = {}

        def fake_get(url, params=None, **kw):
            seen.update(params)
            return _FakeResponse("OK")

        monkeypatch.setattr(tls_acme.httpx, "get", fake_get)
        _issuer().preflight()
        assert seen["domains"] == "myhub"
        assert seen["token"] == "tok-123"
        assert seen["txt"] == "shh-preflight"

    def test_preflight_ko_is_bad_token(self, monkeypatch):
        monkeypatch.setattr(tls_acme.httpx, "get", lambda *a, **k: _FakeResponse("KO"))
        with pytest.raises(BadTokenError):
            _issuer().preflight()

    def test_network_failure(self, monkeypatch):
        import httpx

        def boom(*a, **k):
            raise httpx.ConnectError("no route")

        monkeypatch.setattr(tls_acme.httpx, "get", boom)
        with pytest.raises(NetworkError):
            _issuer().preflight()

    def test_set_txt_ko_raises(self, monkeypatch):
        monkeypatch.setattr(tls_acme.httpx, "get", lambda *a, **k: _FakeResponse("KO"))
        with pytest.raises(BadTokenError):
            _issuer().set_txt("value")

    def test_clear_txt_swallows_errors(self, monkeypatch):
        monkeypatch.setattr(tls_acme.httpx, "get", lambda *a, **k: _FakeResponse("KO"))
        _issuer().clear_txt()  # must not raise


class TestWaitForTxt:
    def test_found(self, monkeypatch):
        answer = {"Answer": [{"data": '"the-validation-value"'}]}
        monkeypatch.setattr(
            tls_acme.httpx, "get", lambda *a, **k: _FakeResponse(json_data=answer))
        _issuer().wait_for_txt("the-validation-value", timeout=1, interval=0)

    def test_timeout(self, monkeypatch):
        monkeypatch.setattr(
            tls_acme.httpx, "get", lambda *a, **k: _FakeResponse(json_data={"Answer": []}))
        with pytest.raises(DnsTimeoutError):
            _issuer().wait_for_txt("value", timeout=0, interval=0)

    def test_queries_acme_challenge_name(self, monkeypatch):
        seen = {}

        def fake_get(url, params=None, **kw):
            seen.update(params or {})
            return _FakeResponse(json_data={"Answer": [{"data": '"v"'}]})

        monkeypatch.setattr(tls_acme.httpx, "get", fake_get)
        _issuer().wait_for_txt("v", timeout=1, interval=0)
        assert seen["name"] == "_acme-challenge.myhub.duckdns.org"
        assert seen["type"] == "TXT"


class TestErrorMapping:
    def test_rate_limited(self):
        class E(Exception):
            pass

        err = DuckDnsIssuer._map_acme_error(E("urn:ietf:params:acme:error:rateLimited: too many certs"))
        assert isinstance(err, RateLimitedError)
        assert err.error_code == "acme_rate_limited"

    def test_generic(self):
        err = DuckDnsIssuer._map_acme_error(Exception("badCSR"))
        assert err.error_code == "acme_error"


class TestDirectoryUrl:
    def test_staging_flag(self, monkeypatch):
        monkeypatch.delenv("SHH_ACME_DIRECTORY", raising=False)
        assert "staging" in tls_acme.directory_url(True)
        assert "staging" not in tls_acme.directory_url(False)

    def test_env_override_wins(self, monkeypatch):
        monkeypatch.setenv("SHH_ACME_DIRECTORY", "https://pebble:14000/dir")
        assert tls_acme.directory_url(True) == "https://pebble:14000/dir"
        assert tls_acme.directory_url(False) == "https://pebble:14000/dir"


class TestIssuerInput:
    def test_empty_token_rejected(self):
        with pytest.raises(BadTokenError):
            DuckDnsIssuer("myhub", "   ")

    def test_domain_built(self):
        assert _issuer().domain == "myhub.duckdns.org"
