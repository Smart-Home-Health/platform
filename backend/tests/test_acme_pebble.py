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
"""Real ACME DNS-01 round-trip against pebble + pebble-challtestsrv.

Runs only when the pebble stack is up (docker-compose.acme-test.yml sets
SHH_ACME_DIRECTORY + SHH_CHALLTESTSRV_URL + SHH_ACME_INSECURE); auto-skips
in the normal suite. The DuckDNS/DoH pieces are replaced by challtestsrv's
management API — what's under test is the issuer's ACME flow itself
(account, order, DNS-01 answer, finalize, chain download).
"""
import os

import httpx
import pytest
from cryptography import x509

import tls_acme
import tls_manager

pytestmark = [
    pytest.mark.acme_integration,
    pytest.mark.skipif(
        not os.environ.get("SHH_ACME_DIRECTORY"),
        reason="pebble stack not configured (SHH_ACME_DIRECTORY unset)",
    ),
]

CHALLTESTSRV = os.environ.get("SHH_CHALLTESTSRV_URL", "http://challtestsrv:8055")


class _PebbleIssuer(tls_acme.DuckDnsIssuer):
    """DuckDNS/DoH swapped for challtestsrv's management API; ACME flow real."""

    def preflight(self):
        pass

    def set_txt(self, value):
        r = httpx.post(f"{CHALLTESTSRV}/set-txt", json={
            "host": f"_acme-challenge.{self.domain}.", "value": value,
        }, timeout=10)
        r.raise_for_status()

    def clear_txt(self):
        httpx.post(f"{CHALLTESTSRV}/clear-txt", json={
            "host": f"_acme-challenge.{self.domain}.",
        }, timeout=10)

    def wait_for_txt(self, value, timeout=None, interval=None):
        pass  # challtestsrv answers immediately; no propagation delay


def test_full_issuance_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(tls_manager, "TLS_DIR", str(tmp_path / "tls"))
    issuer = _PebbleIssuer("pebbletest", "unused-token")
    fullchain, privkey = issuer.issue()

    tls_manager.write_cert_atomic(fullchain, privkey)  # pair validates
    cert = x509.load_pem_x509_certificate(fullchain)
    san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
    assert "pebbletest.duckdns.org" in san.value.get_values_for_type(x509.DNSName)
    assert tls_manager.read_cert_expiry() is not None
