# Smart Home Health Hub
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
"""Account settings — timezone is validated against the IANA database on write.

The value is later embedded into SQL for day-bucketing (`AT TIME ZONE '<tz>'`),
so the write-side guard both prevents a stored-injection vector and gives a
clean 422 instead of a silent fallback at read time."""


def test_get_account(admin_client):
    resp = admin_client.get("/api/account")
    assert resp.status_code == 200
    assert resp.json()["id"] > 0


def test_update_timezone_valid(admin_client):
    resp = admin_client.put("/api/account", json={"timezone": "America/Los_Angeles"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["timezone"] == "America/Los_Angeles"


def test_update_timezone_rejects_unknown_zone(admin_client):
    resp = admin_client.put("/api/account", json={"timezone": "Mars/Olympus_Mons"})
    assert resp.status_code == 422


def test_update_timezone_rejects_sql_payload(admin_client):
    resp = admin_client.put("/api/account", json={"timezone": "'); DROP TABLE accounts;--"})
    assert resp.status_code == 422
    # The account row is untouched and still queryable.
    assert admin_client.get("/api/account").status_code == 200


def test_update_timezone_null_is_ignored(admin_client):
    # Omitting timezone leaves it unchanged (validator only runs on a value).
    resp = admin_client.put("/api/account", json={"name": "Renamed Account"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed Account"


def test_update_account_requires_full_auth(account_client):
    resp = account_client.put("/api/account", json={"timezone": "America/Chicago"})
    assert resp.status_code == 403


def test_requires_auth(client):
    assert client.get("/api/account").status_code == 401
