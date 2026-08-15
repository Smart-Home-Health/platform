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
"""Wave 4 — reader devices: CRUD + the X25519 pairing-initiation handshake
(outbound call to the device mocked; we assert an ephemeral key is generated
and a pending pairing is stored)."""

import pytest

import routes.readers as readers_mod


def _make_reader(admin_client, ip="192.168.1.50", **over):
    payload = {"ip_address": ip, "name": "Bedside Reader"}
    payload.update(over)
    return admin_client.post("/api/readers", json=payload)


# --- CRUD --------------------------------------------------------------------
def test_create_reader(admin_client):
    resp = _make_reader(admin_client)
    assert resp.status_code == 200, resp.text
    assert resp.json()["success"] is True
    assert resp.json()["reader"]["id"] > 0


def test_create_duplicate_ip_rejected(admin_client):
    _make_reader(admin_client, ip="192.168.1.51")
    assert _make_reader(admin_client, ip="192.168.1.51").status_code == 400


def test_get_reader(admin_client):
    rid = _make_reader(admin_client, ip="192.168.1.52").json()["reader"]["id"]
    assert admin_client.get(f"/api/readers/{rid}").status_code == 200


def test_get_unknown_reader_404(admin_client):
    assert admin_client.get("/api/readers/999999").status_code == 404


def test_list_readers(admin_client):
    _make_reader(admin_client, ip="192.168.1.53")
    resp = admin_client.get("/api/readers")
    assert resp.status_code == 200
    assert isinstance(resp.json()["readers"], list)


def test_update_reader(admin_client):
    rid = _make_reader(admin_client, ip="192.168.1.54").json()["reader"]["id"]
    resp = admin_client.put(f"/api/readers/{rid}", json={"name": "Renamed Reader"})
    assert resp.status_code == 200
    assert resp.json()["reader"]["name"] == "Renamed Reader"


def test_delete_reader(admin_client):
    rid = _make_reader(admin_client, ip="192.168.1.55").json()["reader"]["id"]
    assert admin_client.delete(f"/api/readers/{rid}").status_code == 200


def test_delete_unknown_reader_404(admin_client):
    assert admin_client.delete("/api/readers/999999").status_code == 404


def test_read_restricted_cannot_list(client, admin_user, account):
    from routes.auth import create_access_token
    token = create_access_token(user=admin_user, account=account,
                                auth_level="full", read_restricted=True)
    resp = client.get("/api/readers", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_requires_auth(client):
    assert client.get("/api/readers").status_code == 401


# --- Pairing handshake -------------------------------------------------------
class _FakeResp:
    status_code = 200

    def json(self):
        return {"status": "pending", "device_name": "Pi-Reader"}


class _FakeAsyncClient:
    """Stands in for httpx.AsyncClient so /pair never touches the network."""

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, *a, **k):
        return _FakeResp()


def test_initiate_pairing_generates_ephemeral_key(admin_client, monkeypatch):
    from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
    monkeypatch.setattr(readers_mod.httpx, "AsyncClient", _FakeAsyncClient)

    resp = admin_client.post("/api/readers/pair", json={
        "ip_address": "192.168.1.90", "port": 8080,
        "host_url": "http://192.168.1.50:8000",
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "pending_approval"

    reader_id = body["reader_id"]
    try:
        pending = readers_mod.pending_pairings.get(reader_id)
        assert pending is not None
        assert isinstance(pending.private_key, X25519PrivateKey)
        assert pending.host_ws_url.endswith(f"/api/readers/ws/{reader_id}")
    finally:
        readers_mod.pending_pairings.pop(reader_id, None)


def test_pairing_rejects_ingress_host_url(admin_client, monkeypatch):
    """A browser on the HA sidebar reports its ingress origin — a headless
    reader can never dial that (session token, cookie-gated). Fail fast with a
    clear 400 instead of letting a doomed pairing 'succeed'."""
    monkeypatch.setattr(readers_mod.httpx, "AsyncClient", _FakeAsyncClient)
    resp = admin_client.post("/api/readers/pair", json={
        "ip_address": "192.168.1.91", "port": 8080,
        "host_url": "https://ha.local:8123/api/hassio_ingress/Abc123Token",
    })
    assert resp.status_code == 400
    assert "ingress" in resp.json()["detail"].lower()


# --- WebSocket slot protection -----------------------------------------------
# The endpoint is LAN-reachable (the add-on publishes port 8000): a live
# reader's slot may only be taken over by a connection that proves it holds
# the pairing key with one valid encrypted frame.
import json as _json

from cryptography.fernet import Fernet as _Fernet


@pytest.fixture
def paired_reader():
    """A really-committed paired reader: the WS handler opens its own
    SessionLocal, so the transaction-rollback fixtures can't reach it."""
    from db import SessionLocal
    from models.readers import Reader
    key = _Fernet.generate_key().decode()
    s = SessionLocal()
    try:
        r = Reader(name="WS Reader", ip_address="192.168.1.200", port=8080,
                   encryption_key=key, is_active=True, is_paired=True)
        s.add(r)
        s.commit()
        s.refresh(r)
        rid = r.id
        yield rid, key
        s.query(Reader).filter(Reader.id == rid).delete()
        s.commit()
    finally:
        s.close()


def _enc(key, payload):
    return _Fernet(key.encode()).encrypt(_json.dumps(payload).encode())


def _dec(key, data):
    return _json.loads(_Fernet(key.encode()).decrypt(data).decode())


def test_ws_fresh_connect_and_handshake(client, paired_reader):
    rid, key = paired_reader
    with client.websocket_connect(f"/api/readers/ws/{rid}") as ws:
        ws.send_bytes(_enc(key, {"type": "handshake", "device_name": "t"}))
        assert _dec(key, ws.receive_bytes())["type"] == "pong"


def test_ws_unverified_connection_cannot_evict_live_reader(client, paired_reader):
    rid, key = paired_reader
    with client.websocket_connect(f"/api/readers/ws/{rid}") as ws1:
        ws1.send_bytes(_enc(key, {"type": "handshake"}))
        assert _dec(key, ws1.receive_bytes())["type"] == "pong"

        with client.websocket_connect(f"/api/readers/ws/{rid}") as ws2:
            ws2.send_bytes(b"not-the-key")
            with pytest.raises(Exception):
                ws2.receive_bytes()  # server closes 4003 without evicting

        # The incumbent still owns the slot.
        ws1.send_bytes(_enc(key, {"type": "ping"}))
        assert _dec(key, ws1.receive_bytes())["type"] == "pong"


def test_ws_verified_takeover_replaces_incumbent(client, paired_reader):
    rid, key = paired_reader
    with client.websocket_connect(f"/api/readers/ws/{rid}") as ws1:
        ws1.send_bytes(_enc(key, {"type": "handshake"}))
        assert _dec(key, ws1.receive_bytes())["type"] == "pong"

        # A reconnecting real device proves the key with its first frame and
        # takes the slot; that frame is not lost (it gets a normal reply).
        with client.websocket_connect(f"/api/readers/ws/{rid}") as ws2:
            ws2.send_bytes(_enc(key, {"type": "handshake", "device_name": "new"}))
            assert _dec(key, ws2.receive_bytes())["type"] == "pong"


def test_pairing_unreachable_reader_502(admin_client, monkeypatch):
    """A device that can't be reached surfaces as 502, not a 500."""
    import httpx

    class _BoomClient(_FakeAsyncClient):
        async def post(self, *a, **k):
            raise httpx.RequestError("connection refused")

    monkeypatch.setattr(readers_mod.httpx, "AsyncClient", _BoomClient)
    resp = admin_client.post("/api/readers/pair", json={
        "ip_address": "192.168.1.91", "port": 8080,
    })
    assert resp.status_code == 502
