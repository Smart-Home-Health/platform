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
"""Per-patient room bounds: defaults, overrides, clearing, and scoping."""

BASE = "/api/environment/ranges"


def _by_metric(payload):
    return {r["metric"]: r for r in payload["ranges"]}


def test_defaults_when_nothing_is_configured(admin_client, patient):
    resp = admin_client.get(f"{BASE}?patient_id={patient.id}")
    assert resp.status_code == 200
    ranges = _by_metric(resp.json())
    assert set(ranges) == {"temperature", "relative_humidity", "co2", "pm25"}
    assert all(r["source"] == "default" for r in ranges.values())
    # PM2.5 carries the two AQI breakpoints that give the bar three states.
    assert ranges["pm25"]["caution_max"] == 12.0
    assert ranges["pm25"]["critical_max"] == 35.0


def test_metrics_without_a_floor_report_none_not_zero(admin_client, patient):
    """A 0 floor would read as a real bound and flag every clean reading low."""
    ranges = _by_metric(admin_client.get(f"{BASE}?patient_id={patient.id}").json())
    assert ranges["co2"]["caution_min"] is None
    assert ranges["co2"]["critical_min"] is None
    assert ranges["pm25"]["critical_min"] is None
    # …while a metric that is bounded both ways keeps its floor.
    assert ranges["temperature"]["critical_min"] == 15.0


def test_override_replaces_the_default_and_is_marked_as_chosen(
        admin_client, patient):
    resp = admin_client.put(BASE, json={
        "patient_id": patient.id,
        "ranges": [{"metric": "co2", "caution_max": 800, "critical_max": 1500,
                    "note": "chronic lung disease"}],
    })
    assert resp.status_code == 200
    ranges = _by_metric(resp.json())
    assert ranges["co2"]["caution_max"] == 800
    assert ranges["co2"]["critical_max"] == 1500
    assert ranges["co2"]["source"] == "patient"
    assert ranges["co2"]["note"] == "chronic lung disease"
    # Untouched metrics stay on their defaults.
    assert ranges["pm25"]["source"] == "default"


def test_clearing_every_bound_falls_back_rather_than_switching_off(
        admin_client, patient):
    admin_client.put(BASE, json={
        "patient_id": patient.id,
        "ranges": [{"metric": "temperature", "caution_min": 20, "caution_max": 22}],
    })
    assert _by_metric(admin_client.get(f"{BASE}?patient_id={patient.id}").json()
                      )["temperature"]["source"] == "patient"

    resp = admin_client.put(BASE, json={
        "patient_id": patient.id,
        "ranges": [{"metric": "temperature"}],
    })
    temp = _by_metric(resp.json())["temperature"]
    assert temp["source"] == "default"
    assert temp["caution_min"] == 18.0


def test_an_unknown_metric_is_ignored(admin_client, patient):
    resp = admin_client.put(BASE, json={
        "patient_id": patient.id,
        "ranges": [{"metric": "unicorns", "caution_max": 1}],
    })
    assert resp.status_code == 200
    assert "unicorns" not in _by_metric(resp.json())


def test_updating_twice_does_not_duplicate_the_row(admin_client, db_session, patient):
    from models.patient_env_range import PatientEnvRange
    for value in (900, 950):
        admin_client.put(BASE, json={
            "patient_id": patient.id,
            "ranges": [{"metric": "co2", "caution_max": value}],
        })
    rows = db_session.query(PatientEnvRange).filter(
        PatientEnvRange.patient_id == patient.id,
        PatientEnvRange.metric == "co2").all()
    assert len(rows) == 1
    assert rows[0].caution_max == 950


def test_unknown_patient_404s(admin_client):
    assert admin_client.get(f"{BASE}?patient_id=999999").status_code == 404


def test_reading_bounds_survives_a_read_restricted_session(limited_client, patient):
    """Monitoring mode still flags a bad room; losing the bounds there would
    turn the flags off rather than hide them."""
    resp = limited_client.get(f"{BASE}?patient_id={patient.id}")
    assert resp.status_code == 200


def test_writing_bounds_needs_the_patient_permission(limited_client, patient):
    resp = limited_client.put(BASE, json={
        "patient_id": patient.id,
        "ranges": [{"metric": "co2", "caution_max": 800}],
    })
    assert resp.status_code == 403


def test_requires_auth(client, patient):
    assert client.get(f"{BASE}?patient_id={patient.id}").status_code == 401
