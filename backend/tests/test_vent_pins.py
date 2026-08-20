#
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
#
"""Per-patient ventilator pins. The claim worth guarding is that an empty set
is a choice, not an absence."""


def _url(patient_id):
    return f"/api/integrations/patient/{patient_id}/vent/pins"


def test_an_unconfigured_patient_gets_the_defaults(admin_client, patient):
    resp = admin_client.get(_url(patient.id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "default"
    # Breath rate leads; it is the one key the reports already hardcode.
    assert body["parameter_keys"][0] == "9408"
    assert len(body["parameter_keys"]) == 6


def test_pins_come_back_in_the_order_they_were_saved(admin_client, patient):
    resp = admin_client.put(_url(patient.id), json={
        "vendor": "vocsn", "parameter_keys": ["9409", "9408", "16003"],
    })
    assert resp.status_code == 200
    assert resp.json()["parameter_keys"] == ["9409", "9408", "16003"]
    assert resp.json()["source"] == "patient"
    # …and survive a round trip rather than re-sorting on read.
    assert admin_client.get(_url(patient.id)).json()["parameter_keys"] == \
        ["9409", "9408", "16003"]


def test_unpinning_everything_stays_unpinned(admin_client, patient):
    """The whole reason the state table exists: without it, clearing the last
    pin looks identical to never having configured any, and six defaults come
    back over the top of a deliberate choice."""
    admin_client.put(_url(patient.id), json={
        "vendor": "vocsn", "parameter_keys": ["9408"]})
    resp = admin_client.put(_url(patient.id), json={
        "vendor": "vocsn", "parameter_keys": []})
    assert resp.status_code == 200
    assert resp.json()["parameter_keys"] == []
    assert resp.json()["source"] == "patient"

    again = admin_client.get(_url(patient.id))
    assert again.json()["parameter_keys"] == []
    assert again.json()["source"] == "patient"


def test_saving_twice_replaces_rather_than_accumulates(admin_client, db_session, patient):
    from models.patient_vent_pin import PatientVentPin
    admin_client.put(_url(patient.id), json={
        "vendor": "vocsn", "parameter_keys": ["9408", "9406"]})
    admin_client.put(_url(patient.id), json={
        "vendor": "vocsn", "parameter_keys": ["9407"]})
    rows = db_session.query(PatientVentPin).filter(
        PatientVentPin.patient_id == patient.id).all()
    assert [r.parameter_key for r in rows] == ["9407"]


def test_a_repeated_key_is_dropped_not_rejected(admin_client, patient):
    resp = admin_client.put(_url(patient.id), json={
        "vendor": "vocsn", "parameter_keys": ["9408", "9406", "9408"]})
    assert resp.status_code == 200
    assert resp.json()["parameter_keys"] == ["9408", "9406"]


def test_pins_are_scoped_per_vendor(admin_client, patient):
    admin_client.put(_url(patient.id), json={
        "vendor": "vocsn", "parameter_keys": ["9408"]})
    # A vendor we have never seen starts unpinned rather than inheriting
    # another manufacturer's key numbers.
    other = admin_client.get(f"{_url(patient.id)}?vendor=acme")
    assert other.json()["parameter_keys"] == []
    assert other.json()["source"] == "default"
    assert admin_client.get(_url(patient.id)).json()["parameter_keys"] == ["9408"]


def test_pins_are_scoped_per_patient(admin_client, db_session, account, patient):
    from crud.patients import create_patient
    other = create_patient(db_session, {
        "first_name": "Other", "last_name": "Patient",
        "account_id": account.id, "is_active": True,
    })
    db_session.commit()
    admin_client.put(_url(patient.id), json={
        "vendor": "vocsn", "parameter_keys": ["9409"]})
    assert admin_client.get(_url(other.id)).json()["source"] == "default"


def test_unknown_patient_404s(admin_client):
    assert admin_client.get(_url(999999)).status_code == 404
    assert admin_client.put(_url(999999), json={
        "vendor": "vocsn", "parameter_keys": []}).status_code == 404


def test_reading_pins_needs_the_same_permission_as_the_vent_data(
        limited_client, patient):
    """Gated on monitoring.read, matching the sibling vent reads — a user who
    cannot see the parameters has no use for a list of which ones lead."""
    assert limited_client.get(_url(patient.id)).status_code == 403


def test_changing_pins_needs_the_patient_permission(limited_client, patient):
    resp = limited_client.put(_url(patient.id), json={
        "vendor": "vocsn", "parameter_keys": ["9408"]})
    assert resp.status_code == 403


def test_requires_auth(client, patient):
    assert client.get(_url(patient.id)).status_code == 401
