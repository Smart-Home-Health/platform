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
"""Wave 4 — system status/health smoke coverage."""


def test_health(admin_client):
    resp = admin_client.get("/api/status/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


def test_health_is_public(client):
    # /health is the container/LB liveness probe -> public (no token needed).
    assert client.get("/api/status/health").status_code == 200


def test_other_status_routes_require_auth(client):
    # A non-allowlisted /api route still requires a token (auth runs before the
    # handler, so this is 401 regardless of module state).
    assert client.get("/api/status/modules").status_code == 401
