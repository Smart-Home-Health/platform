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
"""Wave 2 — nutrition intake: create, validation, listing."""


def _intake(amount=120.0, item_type="liquid"):
    return {"item_name": "Water", "item_type": item_type, "amount": amount, "amount_unit": "ml"}


def test_create_nutrition_intake(admin_client, patient):
    resp = admin_client.post(f"/api/nutrition-intake?patient_id={patient.id}", json=_intake())
    assert resp.status_code == 200
    assert resp.json()["id"] > 0


def test_nutrition_intake_item_type_validation(admin_client, patient):
    resp = admin_client.post(f"/api/nutrition-intake?patient_id={patient.id}",
                             json=_intake(item_type="poison"))
    assert resp.status_code == 422


def test_nutrition_intake_amount_must_be_positive(admin_client, patient):
    resp = admin_client.post(f"/api/nutrition-intake?patient_id={patient.id}", json=_intake(amount=0))
    assert resp.status_code == 422


def test_list_patient_nutrition_intake(admin_client, patient):
    admin_client.post(f"/api/nutrition-intake?patient_id={patient.id}", json=_intake())
    resp = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) >= 1
