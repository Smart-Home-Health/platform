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
"""Wave 4 — med/vital correlation analysis: query-param bounds, full-auth
gating, and the integrity of the metric-column allowlist that is interpolated
into raw SQL (the only defense against injection there)."""

import re


def test_list_medications_for_analysis(admin_client, patient):
    resp = admin_client.get(f"/api/analysis/patients/{patient.id}/medications")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_med_effects_unknown_med(admin_client, patient):
    resp = admin_client.get(f"/api/analysis/patients/{patient.id}/med-effects/999999")
    assert resp.status_code == 200
    assert resp.json().get("error") == "Medication not found"


def test_med_effects_few_doses_returns_warning(admin_client, patient):
    med_id = admin_client.post("/api/add/medication", json={
        "name": "Albuterol", "concentration": "90mcg", "quantity": 10,
        "quantity_unit": "puffs", "instructions": "prn", "start_date": "2026-06-01",
        "is_patient_specific": True, "admin_patient_id": patient.id,
    }).json()["id"]
    resp = admin_client.get(f"/api/analysis/patients/{patient.id}/med-effects/{med_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["medication"]["id"] == med_id
    assert "warnings" in body  # <2 dose events -> needs-more-data warning


def test_med_effects_rejects_out_of_range_window(admin_client, patient):
    """pre_start has a ge=5 bound -> 422."""
    resp = admin_client.get(
        f"/api/analysis/patients/{patient.id}/med-effects/1",
        params={"pre_start": 1},
    )
    assert resp.status_code == 422


def test_requires_full_auth(account_client, patient):
    """Account-level token (no user selected) -> require_full_auth 403."""
    resp = account_client.get(f"/api/analysis/patients/{patient.id}/medications")
    assert resp.status_code == 403


def test_requires_auth(client):
    assert client.get("/api/analysis/patients/1/medications").status_code == 401


def test_metric_column_allowlist_is_injection_safe():
    """metric_col is f-string-interpolated into SQL, so the only safe source is
    these hardcoded constants. Guard that every identifier stays a bare column
    token (no spaces/quotes/semicolons) — a regression here would open SQLi."""
    from analysis.med_vital_correlation import (
        PULSE_OX_METRICS, VITALS_METRICS, VENT_METRICS,
    )
    ident = re.compile(r"^[a-z0-9_]+$")
    for m in PULSE_OX_METRICS:
        assert ident.match(m["column"]), m
    # vitals/vent are parameterized by type/key, not interpolated as columns,
    # but keeping them clean is cheap defense-in-depth.
    for m in VITALS_METRICS:
        assert ident.match(m["vital_type"]), m
    for m in VENT_METRICS:
        assert ident.match(m["key"]) and ident.match(m["suffix"].lstrip("_")), m
