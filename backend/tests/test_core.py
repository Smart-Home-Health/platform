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
"""Wave 6 — core routes (routes/core.py): limits, first-run, test, /ws/sensors.

These were the only backend route module without dedicated coverage. The
websocket tests pin the delegation contract in core.py: it looks up the
WebSocket module via main.get_modules() and closes 1011 when it is absent.
"""
import pytest
from starlette.websockets import WebSocketDisconnect


def test_limits_shape(admin_client):
    resp = admin_client.get("/limits")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"spo2", "bpm"}
    assert set(body["spo2"]) == {"min", "max"}
    assert set(body["bpm"]) == {"min", "max"}


def test_limits_is_public(client):
    # /limits is mounted at the root (no /api prefix). With the unified-image
    # change, only /api/* is auth-gated — non-/api paths (static/SPA + these
    # legacy root routes) are public, so /limits no longer needs a token.
    resp = client.get("/limits")
    assert resp.status_code == 200
    assert set(resp.json()) == {"spo2", "bpm"}


def test_api_test_endpoint(admin_client):
    resp = admin_client.get("/api/test")
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"


def test_first_run_false_when_admin_exists(admin_client):
    # admin_client materializes a system-admin user.
    resp = admin_client.get("/first-run")
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_first_run"] is False
    assert body["has_admin"] is True


def test_first_run_true_without_admin(account_client):
    # Account-level token, no system-admin user seeded in this transaction.
    resp = account_client.get("/first-run")
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_first_run"] is True
    assert body["has_admin"] is False


def test_ws_sensors_closes_1011_when_module_missing(client, monkeypatch):
    """/ws/ is public; with no WebSocket module the endpoint closes 1011."""
    import main
    monkeypatch.setattr(main, "get_modules", lambda: {})
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/sensors") as ws:
            ws.receive_text()
    assert exc.value.code == 1011


def test_ws_sensors_delegates_to_module(client, monkeypatch):
    """When a WebSocket module is present, the connection is handed to it."""
    import main
    handled = {}

    class FakeWebSocketModule:
        async def handle_websocket_connection(self, websocket):
            handled["called"] = True
            await websocket.accept()
            await websocket.send_json({"ok": True})
            await websocket.close()

    monkeypatch.setattr(main, "get_modules", lambda: {"websocket": FakeWebSocketModule()})
    with client.websocket_connect("/ws/sensors") as ws:
        assert ws.receive_json() == {"ok": True}
    assert handled["called"] is True


# --- Home Assistant ingress base-path injection (SPA shell) -------------------

_SHELL = '<head><base href="/" /><script>window.__BASE_PATH__ = "";</script></head>'


def test_inject_ingress_base_rewrites_prefix():
    from main import inject_ingress_base
    out = inject_ingress_base(_SHELL, "/api/hassio_ingress/abc")
    assert '<base href="/api/hassio_ingress/abc/">' in out
    assert 'window.__BASE_PATH__ = "/api/hassio_ingress/abc"' in out


def test_inject_ingress_base_strips_trailing_slash():
    from main import inject_ingress_base
    out = inject_ingress_base(_SHELL, "/api/hassio_ingress/abc/")
    assert '<base href="/api/hassio_ingress/abc/">' in out
    assert 'window.__BASE_PATH__ = "/api/hassio_ingress/abc"' in out


def test_inject_ingress_base_empty_keeps_root():
    """No ingress header -> app stays at root (identical to today's behavior)."""
    from main import inject_ingress_base
    out = inject_ingress_base(_SHELL, "")
    assert '<base href="/">' in out
    assert 'window.__BASE_PATH__ = ""' in out


def test_inject_ingress_base_rejects_crafted_header():
    """A directly-reachable backend must not reflect a crafted X-Ingress-Path
    into the SPA shell (HTML/JS injection) -> falls back to root."""
    from main import inject_ingress_base
    out = inject_ingress_base(_SHELL, '/x"><script>alert(1)</script>')
    assert "<script>alert(1)" not in out
    assert '<base href="/">' in out
    assert 'window.__BASE_PATH__ = ""' in out


def test_inject_ingress_base_rejects_backslash_payload():
    """Backslashes aren't valid ingress-path chars and would be re.sub
    backreferences -> rejected to root."""
    from main import inject_ingress_base
    out = inject_ingress_base(_SHELL, r"/a\1b")
    assert '<base href="/">' in out
    assert 'window.__BASE_PATH__ = ""' in out
