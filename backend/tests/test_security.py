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
"""HTTPS management API (/api/security): status shape, the system-admin gate,
BYO cert upload validation, mode transitions, and env-derived flags."""

import pytest

import tls_manager
from tests.test_tls_manager import _make_cert


@pytest.fixture()
def tls_dir(tmp_path, monkeypatch):
    d = tmp_path / "tls"
    monkeypatch.setattr(tls_manager, "TLS_DIR", str(d))
    return d


class TestGate:
    def test_requires_system_admin(self, limited_client):
        assert limited_client.get("/api/security/status").status_code == 403

    def test_requires_auth(self, client):
        r = client.get("/api/security/status")
        assert r.status_code in (401, 403)


class TestStatus:
    def test_default_shape(self, admin_client, tls_dir):
        r = admin_client.get("/api/security/status")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["mode"] == "off"
        assert body["cert_installed"] is False
        assert body["https_active"] is False
        assert body["cert_expires_at"] is None
        assert body["days_until_expiry"] is None
        assert body["ingress"] is False
        assert body["behind_proxy"] is False
        assert body["request_scheme"] == "http"
        assert body["public_port"] == 8443
        assert body["setup_state"] is None

    def test_ingress_flag_from_env(self, admin_client, tls_dir, monkeypatch):
        monkeypatch.setenv("SHH_INGRESS", "1")
        assert admin_client.get("/api/security/status").json()["ingress"] is True

    def test_behind_proxy_flag_from_env(self, admin_client, tls_dir, monkeypatch):
        monkeypatch.setenv("SHH_BEHIND_PROXY", "true")
        assert admin_client.get("/api/security/status").json()["behind_proxy"] is True


class TestByoCert:
    def _upload(self, client, cert_pem, key_pem):
        return client.post("/api/security/byo-cert", files={
            "fullchain": ("fullchain.pem", cert_pem, "application/x-pem-file"),
            "privkey": ("privkey.pem", key_pem, "application/x-pem-file"),
        })

    def test_happy_path(self, admin_client, tls_dir):
        cert_pem, key_pem = _make_cert(domains=("hub.example.org",), days_valid=90)
        r = self._upload(admin_client, cert_pem, key_pem)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["mode"] == "byo"
        assert body["cert_installed"] is True
        assert body["domain"] == "hub.example.org"
        assert 88 <= body["days_until_expiry"] <= 90
        assert tls_manager.cert_available()
        # restart was requested so the supervisor would pick the cert up
        assert tls_manager.restart_event.is_set()
        tls_manager.restart_event.clear()

    def test_mismatched_key_rejected(self, admin_client, tls_dir):
        cert_pem, _ = _make_cert()
        _, other_key = _make_cert()
        r = self._upload(admin_client, cert_pem, other_key)
        assert r.status_code == 422
        assert "does not match" in r.json()["detail"]
        assert not tls_manager.cert_available()

    def test_expired_cert_rejected(self, admin_client, tls_dir):
        cert_pem, key_pem = _make_cert(days_valid=-3)
        r = self._upload(admin_client, cert_pem, key_pem)
        assert r.status_code == 422
        assert "expired" in r.json()["detail"]

    def test_garbage_rejected(self, admin_client, tls_dir):
        r = self._upload(admin_client, b"not a cert", b"not a key")
        assert r.status_code == 422


class TestModeTransitions:
    def test_proxy_enable_disable(self, admin_client, tls_dir):
        r = admin_client.post("/api/security/proxy", json={"enabled": True})
        assert r.status_code == 200
        assert r.json()["mode"] == "proxy"
        # persisted: a fresh status read agrees
        assert admin_client.get("/api/security/status").json()["mode"] == "proxy"
        r = admin_client.post("/api/security/proxy", json={"enabled": False})
        assert r.json()["mode"] == "off"

    def test_disable_keeps_cert_files(self, admin_client, tls_dir):
        cert_pem, key_pem = _make_cert()
        tls_manager.write_cert_atomic(cert_pem, key_pem)
        r = admin_client.post("/api/security/disable")
        assert r.status_code == 200
        assert r.json()["mode"] == "off"
        assert r.json()["cert_installed"] is True  # files kept for re-enable

    def test_public_port(self, admin_client, tls_dir):
        r = admin_client.post("/api/security/public-port", json={"port": 443})
        assert r.status_code == 200
        assert r.json()["public_port"] == 443
        r = admin_client.post("/api/security/public-port", json={"port": 0})
        assert r.status_code == 422


# --- DuckDNS guided setup routes ----------------------------------------------
import tls_acme
from routes import security as security_mod


@pytest.fixture()
def worker_session(db_session, monkeypatch):
    """The issuance worker opens its own SessionLocal; point it at the test's
    transactional session (same pattern as test_integration_imports)."""
    monkeypatch.setattr(security_mod, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(db_session, "close", lambda: None)
    return db_session


class _FakeIssuer:
    """Stands in for DuckDnsIssuer: walks the progress steps, returns a real
    self-signed pair so write_cert_atomic's validation passes."""
    fail_with = None

    def __init__(self, subdomain, token, staging=False):
        self.domain = f"{tls_acme.normalize_subdomain(subdomain)}.duckdns.org"
        self.staging = staging

    def issue(self, progress_cb=None):
        for step in ("validating_token", "setting_dns", "waiting_dns",
                     "requesting_cert", "finalizing"):
            if progress_cb:
                progress_cb(step)
        if self.fail_with is not None:
            raise self.fail_with
        return _make_cert(domains=(self.domain,))


class TestDuckdnsSetup:
    def _start(self, client, **over):
        payload = {"subdomain": "myhub", "token": "tok-123", **over}
        return client.post("/api/security/duckdns/setup", json=payload)

    def test_happy_path(self, admin_client, tls_dir, worker_session, monkeypatch):
        monkeypatch.setattr(tls_acme, "DuckDnsIssuer", _FakeIssuer)
        r = self._start(admin_client)
        assert r.status_code == 200, r.text
        # TestClient runs BackgroundTasks synchronously, so the job is done.
        poll = admin_client.get("/api/security/duckdns/setup").json()["setup_state"]
        assert poll["status"] == "issued"
        assert poll["error"] is None
        status = admin_client.get("/api/security/status").json()
        assert status["mode"] == "duckdns"
        assert status["domain"] == "myhub.duckdns.org"
        assert status["cert_installed"] is True
        assert status["days_until_expiry"] > 80
        assert tls_manager.read_duckdns_token() == "tok-123"
        tls_manager.restart_event.clear()

    def test_failure_records_error_code(self, admin_client, tls_dir, worker_session, monkeypatch):
        class _Failing(_FakeIssuer):
            fail_with = tls_acme.BadTokenError("DuckDNS rejected the token")

        monkeypatch.setattr(tls_acme, "DuckDnsIssuer", _Failing)
        r = self._start(admin_client)
        assert r.status_code == 200
        poll = admin_client.get("/api/security/duckdns/setup").json()["setup_state"]
        assert poll["status"] == "failed"
        assert poll["error_code"] == "bad_token"
        assert "rejected" in poll["error"]
        status = admin_client.get("/api/security/status").json()
        assert status["mode"] == "off"
        assert status["cert_installed"] is False

    def test_conflict_while_running(self, admin_client, tls_dir, db_session):
        security_mod.write_setup_state(db_session, {"status": "waiting_dns"})
        r = self._start(admin_client)
        assert r.status_code == 409

    def test_invalid_subdomain(self, admin_client, tls_dir):
        r = self._start(admin_client, subdomain="not a domain!")
        assert r.status_code == 422

    def test_empty_token(self, admin_client, tls_dir):
        r = self._start(admin_client, token="   ")
        assert r.status_code == 422

    def test_renew_requires_duckdns_mode(self, admin_client, tls_dir):
        r = admin_client.post("/api/security/duckdns/renew")
        assert r.status_code == 409

    def test_renew_happy_path(self, admin_client, tls_dir, worker_session, monkeypatch):
        monkeypatch.setattr(tls_acme, "DuckDnsIssuer", _FakeIssuer)
        self._start(admin_client)
        tls_manager.restart_event.clear()
        r = admin_client.post("/api/security/duckdns/renew")
        assert r.status_code == 200, r.text
        poll = admin_client.get("/api/security/duckdns/setup").json()["setup_state"]
        assert poll["status"] == "issued"
        assert tls_manager.restart_event.is_set()
        tls_manager.restart_event.clear()
