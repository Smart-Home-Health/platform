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
"""Wave 5 — system health + maintenance. We only exercise the safe, validating
paths: the hypertable/identifier allowlist (400) and param validation (422) —
never an actual prune/compress/VACUUM against the test DB."""


def test_health_overview(admin_client):
    resp = admin_client.get("/api/system/health")
    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)


def test_prune_rejects_non_hypertable(admin_client):
    """A table that isn't a TimescaleDB hypertable is refused before any DDL."""
    resp = admin_client.post("/api/system/maintenance/prune",
                             json={"table": "users", "older_than_days": 30})
    assert resp.status_code == 400


def test_prune_rejects_bad_days(admin_client):
    resp = admin_client.post("/api/system/maintenance/prune",
                             json={"table": "pulse_ox_data", "older_than_days": 0})
    assert resp.status_code == 422


def test_compress_rejects_non_hypertable(admin_client):
    resp = admin_client.post("/api/system/maintenance/compress",
                             json={"table": "definitely_not_a_table", "older_than_days": 30})
    assert resp.status_code == 400


def test_vacuum_rejects_unknown_table(admin_client):
    resp = admin_client.post("/api/system/maintenance/vacuum",
                             json={"table": "no_such_table_xyz"})
    assert resp.status_code == 400


def test_health_requires_system_admin(limited_client):
    assert limited_client.get("/api/system/health").status_code == 403


def test_requires_auth(client):
    assert client.get("/api/system/health").status_code == 401
