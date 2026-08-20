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
"""A ventilator day is the patient's day.

Bucketing by UTC put an account in America/New_York into a "day" that opened
at 8pm the previous evening: the day view's chart started at 20:00 and crossed
midnight in the middle of the plot. The test account is America/New_York, so
an evening sample lands on the previous UTC date and is the whole test.
"""
from datetime import datetime, timezone

import pytest


@pytest.fixture
def vent_patient(db_session, account, patient):
    """A patient with an enabled ventilator integration and one parsed import
    for the samples to hang off — vent_samples.import_id is NOT NULL."""
    from schemas.integration import Integration, PatientIntegration
    from schemas.vent_import import VentImport
    integ = db_session.query(Integration).filter(Integration.slug == "ventilator").first()
    if integ is None:
        now = datetime.now(timezone.utc)
        integ = Integration(name="Ventilator", slug="ventilator", auth_type="none",
                            is_active=True, created_at=now, updated_at=now)
        db_session.add(integ)
        db_session.flush()
    # The ORM sends explicit NULLs for these, so the column defaults never
    # get a chance; set them here rather than in every test.
    now = datetime.now(timezone.utc)
    pi = PatientIntegration(account_id=account.id, patient_id=patient.id,
                            integration_id=integ.id, is_enabled=True,
                            created_at=now, updated_at=now)
    db_session.add(pi)
    db_session.flush()

    imp = VentImport(
        id="test-import-0001", patient_id=patient.id, integration_id=pi.id,
        vendor="vocsn", file_name="export.tar.gz", storage_path="/tmp/export",
        status="completed", uploaded_at=now, parsed_at=now,
    )
    db_session.add(imp)
    db_session.commit()
    patient.vent_import_id = imp.id
    return patient


def _sample(db_session, patient, when, *, key="9408", suffix="50", value=25.0,
            msg_type="M", msg_id=6007):
    from schemas.vent_sample import VentSample
    db_session.add(VentSample(
        import_id=patient.vent_import_id, patient_id=patient.id,
        recorded_at_raw=when, recorded_at=when,
        parameter_key=key, parameter_suffix=suffix,
        value_numeric=value, source_message_type=msg_type, source_message_id=msg_id,
    ))


# 2026-08-19 23:30 UTC is 19:30 local on the 19th; 2026-08-20 01:30 UTC is
# 21:30 local, still the 19th. Under UTC bucketing the second lands on the
# 20th, which is what split the evening off the day it belongs to.
EVENING = datetime(2026, 8, 19, 23, 30, tzinfo=timezone.utc)
LATE_EVENING = datetime(2026, 8, 20, 1, 30, tzinfo=timezone.utc)
NEXT_MORNING = datetime(2026, 8, 20, 14, 0, tzinfo=timezone.utc)


def test_days_are_the_patients_local_days(admin_client, db_session, vent_patient):
    _sample(db_session, vent_patient, EVENING)
    _sample(db_session, vent_patient, LATE_EVENING)
    _sample(db_session, vent_patient, NEXT_MORNING)
    db_session.commit()

    resp = admin_client.get(
        f"/api/integrations/patient/{vent_patient.id}/vent/days")
    assert resp.status_code == 200
    days = {d["date"]: d["sample_count"] for d in resp.json()["days"]}
    # Both evening samples belong to the 19th locally, even though one of them
    # carries a UTC date of the 20th.
    assert days.get("2026-08-19") == 2
    assert days.get("2026-08-20") == 1


def test_a_day_covers_local_midnight_to_local_midnight(
        admin_client, db_session, vent_patient):
    _sample(db_session, vent_patient, EVENING)
    _sample(db_session, vent_patient, LATE_EVENING)
    _sample(db_session, vent_patient, NEXT_MORNING)
    db_session.commit()

    resp = admin_client.get(
        f"/api/integrations/patient/{vent_patient.id}/vent/day/2026-08-19")
    assert resp.status_code == 200
    summary = resp.json()["summary"]
    assert summary["total_samples"] == 2
    # …and the next morning's sample is not dragged in.
    assert summary["last_at"].startswith("2026-08-20T01:30")


def test_the_series_endpoint_uses_the_same_window(
        admin_client, db_session, vent_patient):
    _sample(db_session, vent_patient, LATE_EVENING)
    _sample(db_session, vent_patient, NEXT_MORNING)
    db_session.commit()

    resp = admin_client.get(
        f"/api/integrations/patient/{vent_patient.id}"
        f"/vent/day/2026-08-19/parameter/9408")
    assert resp.status_code == 200
    points = resp.json()["points"]
    # One point, the 21:30 local one — a day picker and a chart that disagreed
    # about where the day starts would plot the wrong evening.
    assert len(points) == 1


def test_a_day_with_nothing_in_it_is_empty_not_an_error(
        admin_client, db_session, vent_patient):
    _sample(db_session, vent_patient, NEXT_MORNING)
    db_session.commit()
    resp = admin_client.get(
        f"/api/integrations/patient/{vent_patient.id}/vent/day/2026-08-18")
    assert resp.status_code == 200
    assert resp.json()["summary"]["total_samples"] == 0
    assert resp.json()["groups"] == []


def test_a_bad_date_is_rejected(admin_client, vent_patient):
    resp = admin_client.get(
        f"/api/integrations/patient/{vent_patient.id}/vent/day/19-08-2026")
    assert resp.status_code == 400


def _day(admin_client, patient_id, date="2026-08-19"):
    resp = admin_client.get(
        f"/api/integrations/patient/{patient_id}/vent/day/{date}")
    assert resp.status_code == 200
    return {p["parameter_key"]: p
            for g in resp.json()["groups"] for p in g["parameters"]}


def test_only_the_dominant_message_is_counted(admin_client, db_session, vent_patient):
    """A parameter key is not one measurement. VOCSN's column layout differs
    per message, so all but one message's values land under the wrong key —
    on real data that averaged a monitor stream reading 4 cmH2O together with
    a counter, and printed 164. Only the message carrying the parameter most
    often is counted."""
    for _ in range(3):
        _sample(db_session, vent_patient, EVENING, value=10.0, msg_id=7201)
    _sample(db_session, vent_patient, EVENING, value=1619.0, msg_id=7204)
    db_session.commit()

    entry = _day(admin_client, vent_patient.id)["9408"]
    # 10, not the 412 that averaging in the counter would give.
    assert entry["stats_by_suffix"]["50"]["mean"] == 10.0
    assert entry["stats_by_suffix"]["50"]["n"] == 3


def test_a_parameter_reports_what_was_used_and_what_was_dropped(
        admin_client, db_session, vent_patient):
    for _ in range(3):
        _sample(db_session, vent_patient, EVENING, value=10.0, msg_id=7201)
    _sample(db_session, vent_patient, EVENING, value=1619.0, msg_id=7204)
    db_session.commit()

    entry = _day(admin_client, vent_patient.id)["9408"]
    assert [s["message_id"] for s in entry["sources"]] == [7201, 7204]
    assert [s["used"] for s in entry["sources"]] == [True, False]
    # Dropping data silently would let a partial day read as a whole one.
    assert [s["n"] for s in entry["sources"]] == [3, 1]


def test_the_series_is_drawn_from_the_same_message_as_the_number(
        admin_client, db_session, vent_patient):
    for _ in range(3):
        _sample(db_session, vent_patient, EVENING, value=10.0, msg_id=7201)
    _sample(db_session, vent_patient, LATE_EVENING, value=1619.0, msg_id=7204)
    db_session.commit()

    resp = admin_client.get(
        f"/api/integrations/patient/{vent_patient.id}"
        f"/vent/day/2026-08-19/parameter/9408")
    assert resp.status_code == 200
    values = [p["p50"] for p in resp.json()["points"]]
    # The chart must not plot a source the headline excluded.
    assert 1619.0 not in values


def test_a_single_message_parameter_says_so(admin_client, db_session, vent_patient):
    _sample(db_session, vent_patient, EVENING, msg_id=7201)
    _sample(db_session, vent_patient, LATE_EVENING, msg_id=7201)
    db_session.commit()

    resp = admin_client.get(
        f"/api/integrations/patient/{vent_patient.id}/vent/day/2026-08-19")
    params = [p for g in resp.json()["groups"] for p in g["parameters"]]
    entry = next(p for p in params if p["parameter_key"] == "9408")
    assert len(entry["sources"]) == 1
    assert entry["sources"][0]["n"] == 2
