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
