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
"""Vitals capture endpoint: two-band validation, stamping, idempotency,
event publishing; per-patient vital ranges API."""
import uuid

import pytest

from schemas.vital import Vital


@pytest.fixture
def events(monkeypatch):
    published = []
    import routes.vitals as rv
    monkeypatch.setattr(rv, "publish_event",
                        lambda etype, data: published.append((etype, data)))
    return published


def _capture(client, patient_id, readings, encounter_uid=None):
    return client.post("/api/vitals/capture", json={
        "patient_id": patient_id,
        "encounter_uid": encounter_uid or str(uuid.uuid4()),
        "readings": readings,
    })


def _rows(db, patient_id):
    return db.query(Vital).filter(Vital.patient_id == patient_id).all()


def test_capture_ok_values_stamped(admin_client, admin_user, account, patient,
                                   db_session, events):
    resp = _capture(admin_client, patient.id, [
        {"vital_key": "spo2", "value": 97, "measured_at": "2026-08-15T10:00:00+00:00"},
        {"vital_key": "heart_rate", "value": 72},
    ])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "success"
    assert len(body["saved"]) == 2
    assert body["skipped_duplicates"] == 0

    rows = {r.vital_type: r for r in _rows(db_session, patient.id)}
    spo2 = rows["spo2"]
    assert spo2.unit == "%"
    assert spo2.code == "2708-6"  # manual SpO2 -> generic arterial O2 sat
    assert spo2.ucum_unit == "%"
    assert spo2.source == "manual"
    assert spo2.account_id == account.id
    assert spo2.recorded_by == admin_user.id
    assert spo2.encounter_uid
    assert spo2.confirmed_against_warning is None  # in-range values carry no flag
    assert spo2.reference_low == 88 and spo2.reference_high == 100  # default expected
    assert rows["heart_rate"].code == "8867-4"

    assert [e[0] for e in events] == ["vital_saved", "vital_saved"]
    for _, data in events:
        assert data["from_manual"] is True
        assert data["patient_id"] == patient.id
    assert events[0][1]["vital_data"] == {"spo2": 97}


def test_capture_blood_pressure_expands_and_computes_map(admin_client, patient,
                                                         db_session, events):
    resp = _capture(admin_client, patient.id, [
        {"vital_key": "blood_pressure", "systolic": 118, "diastolic": 76},
    ])
    assert resp.status_code == 200, resp.text
    rows = _rows(db_session, patient.id)
    assert {r.vital_group for r in rows} == {"systolic", "diastolic", "map"}
    assert len({r.timestamp for r in rows}) == 1  # shared timestamp groups the set
    by_group = {r.vital_group: r for r in rows}
    assert by_group["map"].value == round(76 + (118 - 76) / 3)
    assert by_group["systolic"].reference_low == 70
    assert len(events) == 1
    assert events[0][1]["vital_data"] == {"systolic": 118, "diastolic": 76,
                                          "map": by_group["map"].value}


def test_capture_diastolic_not_below_systolic_hard_blocks(admin_client, patient,
                                                          db_session, events):
    resp = _capture(admin_client, patient.id, [
        {"vital_key": "blood_pressure", "systolic": 90, "diastolic": 118},
    ])
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["code"] == "implausible"
    assert "lower than systolic" in detail["errors"][0]["message"]
    assert _rows(db_session, patient.id) == []
    assert events == []


def test_capture_implausible_rejected_nothing_saved(admin_client, patient,
                                                    db_session, events):
    resp = _capture(admin_client, patient.id, [
        {"vital_key": "heart_rate", "value": 72},          # fine on its own
        {"vital_key": "spo2", "value": 8},                 # typo for 80-something
    ])
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["code"] == "implausible"
    assert detail["errors"][0]["vital_key"] == "spo2"
    assert detail["errors"][0]["implausible_min"] == 30
    assert _rows(db_session, patient.id) == []  # batch is atomic
    assert events == []


def test_capture_concerning_requires_confirmation(admin_client, patient,
                                                  db_session, events):
    unconfirmed = _capture(admin_client, patient.id, [
        {"vital_key": "spo2", "value": 85},
    ])
    assert unconfirmed.status_code == 409
    detail = unconfirmed.json()["detail"]
    assert detail["code"] == "confirmation_required"
    warn = detail["warnings"][0]
    assert (warn["expected_min"], warn["expected_max"]) == (88, 100)
    assert _rows(db_session, patient.id) == []

    confirmed = _capture(admin_client, patient.id, [
        {"vital_key": "spo2", "value": 85, "confirmed_against_warning": True},
    ])
    assert confirmed.status_code == 200
    row = _rows(db_session, patient.id)[0]
    assert row.confirmed_against_warning is True
    assert row.reference_low == 88 and row.reference_high == 100
    assert len(events) == 1


def test_capture_respects_patient_specific_ranges(admin_client, patient,
                                                  db_session, events):
    put = admin_client.put("/api/vitals/ranges", json={
        "patient_id": patient.id,
        "ranges": [{"vital_key": "spo2", "expected_min": 92, "expected_max": 100,
                    "required": True}],
    })
    assert put.status_code == 200, put.text

    resp = _capture(admin_client, patient.id, [{"vital_key": "spo2", "value": 90}])
    assert resp.status_code == 409  # fine by defaults (88), concerning for this patient


def test_capture_idempotent_replay(admin_client, patient, db_session, events):
    euid = str(uuid.uuid4())
    readings = [{"vital_key": "heart_rate", "value": 72}]
    first = _capture(admin_client, patient.id, readings, encounter_uid=euid)
    assert first.status_code == 200
    replay = _capture(admin_client, patient.id, readings, encounter_uid=euid)
    assert replay.status_code == 200
    assert replay.json()["skipped_duplicates"] == 1
    assert replay.json()["saved"] == []
    assert len(_rows(db_session, patient.id)) == 1
    assert len(events) == 1  # no event for the skipped replay


def test_capture_unknown_vital_rejected(admin_client, patient):
    resp = _capture(admin_client, patient.id, [{"vital_key": "mood", "value": 5}])
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "unknown_vital"


def test_capture_custom_vital_never_blocked_without_ranges(admin_client, patient,
                                                           db_session, events):
    admin_client.post("/api/vitals/custom-definitions", json={
        "patient_id": patient.id, "name": "peak flow", "unit": "L/min"})
    resp = _capture(admin_client, patient.id, [{"vital_key": "peak_flow", "value": 12345}])
    assert resp.status_code == 200  # no defaults for custom vitals -> never blocked
    row = _rows(db_session, patient.id)[0]
    assert row.unit == "L/min"
    assert row.code is None


def test_capture_requires_permission(limited_client, patient):
    # limited_client and admin_client share one underlying client object, so
    # this test uses only the limited one (last _auth call would win otherwise).
    denied = _capture(limited_client, patient.id, [{"vital_key": "heart_rate", "value": 70}])
    assert denied.status_code == 403
    limited_client.headers.pop("Authorization", None)
    anon = _capture(limited_client, patient.id, [{"vital_key": "heart_rate", "value": 70}])
    assert anon.status_code == 401


def test_ranges_defaults_then_patient_override(admin_client, patient):
    resp = admin_client.get(f"/api/vitals/ranges?patient_id={patient.id}")
    assert resp.status_code == 200
    ranges = {(r["vital_key"], r["field_key"]): r for r in resp.json()["ranges"]}
    assert ranges[("blood_pressure", "systolic")]["source"] == "default"
    assert ranges[("spo2", "")]["implausible_max"] == 100
    assert not any(r["required"] for r in ranges.values())

    put = admin_client.put("/api/vitals/ranges", json={
        "patient_id": patient.id,
        "ranges": [{"vital_key": "heart_rate", "expected_min": 50,
                    "expected_max": 120, "required": True, "note": "cardiology"}],
    })
    assert put.status_code == 200
    hr = {(r["vital_key"], r["field_key"]): r for r in put.json()["ranges"]}[("heart_rate", "")]
    assert hr["source"] == "patient"
    assert hr["required"] is True
    assert hr["implausible_min"] == 10  # global default still applies when not overridden

    # Second PUT updates in place (unique key upsert, no duplicates)
    again = admin_client.put("/api/vitals/ranges", json={
        "patient_id": patient.id,
        "ranges": [{"vital_key": "heart_rate", "expected_min": 55,
                    "expected_max": 125, "required": False}],
    })
    hr2 = {(r["vital_key"], r["field_key"]): r for r in again.json()["ranges"]}[("heart_rate", "")]
    assert hr2["expected_min"] == 55 and hr2["required"] is False
    from models.patient_vital_range import PatientVitalRange
    # exactly one row for the key proves upsert
    resp2 = admin_client.get(f"/api/vitals/ranges?patient_id={patient.id}")
    assert len([r for r in resp2.json()["ranges"]
                if r["vital_key"] == "heart_rate"]) == 1


def test_ranges_include_custom_definitions(admin_client, patient):
    admin_client.post("/api/vitals/custom-definitions", json={
        "patient_id": patient.id, "name": "peak flow", "unit": "L/min"})
    resp = admin_client.get(f"/api/vitals/ranges?patient_id={patient.id}")
    keys = [r["vital_key"] for r in resp.json()["ranges"]]
    assert "peak_flow" in keys


def test_custom_definition_mutations_require_permission(limited_client, patient):
    denied = limited_client.post("/api/vitals/custom-definitions", json={
        "patient_id": patient.id, "name": "mood", "unit": ""})
    assert denied.status_code == 403
    denied_del = limited_client.delete("/api/vitals/custom-definitions/1")
    assert denied_del.status_code == 403


def test_ranges_put_requires_permission(limited_client, patient):
    resp = limited_client.put("/api/vitals/ranges", json={
        "patient_id": patient.id,
        "ranges": [{"vital_key": "spo2", "expected_min": 90, "expected_max": 100}],
    })
    assert resp.status_code == 403


def test_ranges_rejects_inverted_bounds(admin_client, patient):
    resp = admin_client.put("/api/vitals/ranges", json={
        "patient_id": patient.id,
        "ranges": [{"vital_key": "spo2", "expected_min": 100, "expected_max": 90}],
    })
    assert resp.status_code == 422
