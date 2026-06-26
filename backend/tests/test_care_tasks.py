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
"""Wave 2 — care tasks: create (permission-gated), authz, and listing."""


def _make_category(admin_client):
    resp = admin_client.post("/api/add/care-task-category",
                             json={"name": "Hygiene", "color": "#3B82F6"})
    assert resp.status_code == 200
    return resp.json()["id"]


def test_create_care_task(admin_client, patient):
    cat_id = _make_category(admin_client)
    resp = admin_client.post("/api/add/care-task",
                             json={"name": "Brush teeth", "category_id": cat_id, "patient_id": patient.id})
    assert resp.status_code == 200
    assert resp.json()["id"] > 0


def test_create_care_task_requires_permission(limited_client, patient):
    """A user without care_tasks.create is forbidden (403)."""
    resp = limited_client.post("/api/add/care-task",
                               json={"name": "Nope", "category_id": 1, "patient_id": patient.id})
    assert resp.status_code == 403


def test_create_care_task_validation(admin_client, patient):
    # category_id must be > 0
    resp = admin_client.post("/api/add/care-task",
                             json={"name": "Bad", "category_id": 0, "patient_id": patient.id})
    assert resp.status_code == 422


def test_active_care_tasks_listing(admin_client, patient):
    cat_id = _make_category(admin_client)
    admin_client.post("/api/add/care-task",
                      json={"name": "Wash face", "category_id": cat_id, "patient_id": patient.id})
    resp = admin_client.get(f"/api/care-tasks/active?patient_id={patient.id}")
    assert resp.status_code == 200
    tasks = resp.json()["care_tasks"]
    assert any(t["name"] == "Wash face" for t in tasks)
