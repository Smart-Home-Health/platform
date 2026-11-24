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
"""Exercise the administrative boundary over the same MCP transport as Keywright."""
import asyncio
import json
import secrets

import httpx2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from sqlalchemy.orm import sessionmaker

from admin_mcp import register_admin_mcp
from crud.medications import stage_medication, stage_medication_schedule
from crud.patients import create_patient
from middleware import AuthenticationMiddleware
from models.users import AuditLog
from schemas.medication_log import MedicationLog
from utils.datetime_utils import utc_now

HOST = "health.example.test"
BASE = f"https://{HOST}"
SCHEDULE = {"cron_expression": "0 14 * * *", "description": "Morning", "dose_amount": 1}


def new_med(name):
    return {
        "name": name, "concentration": "test strength", "quantity": 10, "quantity_unit": "units",
        "instructions": "Test label", "start_date": "2026-01-01", "schedules": [SCHEDULE],
    }


@pytest.fixture
def service(patient, db_session, monkeypatch):
    token = secrets.token_urlsafe(32)
    monkeypatch.setenv("SHH_MCP_TOKEN", token)
    monkeypatch.setenv("SHH_MCP_PATIENT_ID", str(patient.id))
    monkeypatch.setenv("SHH_MCP_HOST", HOST)
    app = FastAPI()
    app.add_middleware(AuthenticationMiddleware)
    register_admin_mcp(app, sessionmaker(bind=db_session.connection(), join_transaction_mode="create_savepoint"))
    return app, {"Authorization": f"Bearer {token}"}


def rpc(client, method, params=None):
    response = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
                           headers={"Accept": "application/json, text/event-stream"})
    assert response.status_code == 200, response.text
    return response.json()


def call(client, name, arguments):
    return rpc(client, "tools/call", {"name": name, "arguments": arguments})["result"]


def plan(client):
    return call(client, "get_medication_plan", {})["structuredContent"]


def target(client):
    snapshot = plan(client)
    return {k: snapshot[k] for k in ("patient_id", "revision")}


def test_broker_client_discovers_exact_tools(service):
    app, headers = service

    async def check():
        async with app.router.lifespan_context(app), httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app), base_url=BASE, headers=headers,
        ) as http:
            async with Client(streamable_http_client(f"{BASE}/mcp", http_client=http)) as broker:
                tools = (await broker.list_tools()).tools
                assert {t.name for t in tools} == {
                    "get_medication_plan", "add_medication", "retire_medication",
                    "set_medication_schedule", "replace_medications",
                }
                result = await broker.call_tool("get_medication_plan", {})
                assert not result.is_error
                assert result.structured_content["patient_name"] == "Pat Ient"
                for forbidden in ("administer_medication", "perform_care_task", "log_nutrition_intake", "call_api"):
                    result = await broker.call_tool(forbidden, {})
                    assert result.is_error
    asyncio.run(check())


def test_bearer_is_mcp_only(service, admin_client, monkeypatch):
    app, headers = service
    # The real UI auth middleware rejects this credential on the REST API.
    assert admin_client.get("/api/medications/active", headers=headers).status_code == 401
    with TestClient(app, base_url=BASE) as client:
        assert client.post("/mcp").status_code == 401
        assert client.post("/mcp", headers=dict(admin_client.headers)).status_code == 401
        assert client.post("/mcp", headers={**headers, "Host": "wrong.test"}, json={}).status_code == 421
        assert client.post("/mcp", headers={**headers, "Origin": "https://browser.test"}, json={}).status_code == 403
    monkeypatch.delenv("SHH_MCP_TOKEN")
    disabled = FastAPI()
    register_admin_mcp(disabled)
    assert TestClient(disabled).post("/mcp", headers=headers).status_code == 404


def test_swap_preserves_history_and_rolls_back_partial_failure(service, patient, db_session):
    app, headers = service
    with TestClient(app, base_url=BASE, headers=headers) as client:
        old_ids = []
        for name in ("Original A", "Original B"):
            args = {**target(client), "medication": new_med(name)}
            old_ids.append(call(client, "add_medication", args)["structuredContent"]["medication_id"])
            assert call(client, "add_medication", args)["isError"]  # replay
        prior = plan(client)
        old_schedule = prior["medications"][0]["schedules"][0]["id"]
        now = utc_now()
        db_session.add(MedicationLog(medication_id=old_ids[0], patient_id=patient.id, schedule_id=old_schedule,
                                     administered_at=now, dose_amount=1, created_at=now))
        db_session.commit()

        swaps = [{"old_medication_id": old_id, "new_medication": new_med(name)}
                 for old_id, name in zip(old_ids, ("Replacement A", "Replacement B"))]
        args = {**target(client), "replacements": swaps}
        bad = [swaps[0], {**swaps[1], "old_medication_id": old_ids[0]}]
        assert call(client, "replace_medications", {**args, "replacements": bad})["isError"]
        assert plan(client) == prior

        result = call(client, "replace_medications", args)["structuredContent"]
        current = plan(client)["medications"]
        active = [m for m in current if m["active"]]
        assert [m["name"] for m in active] == ["Replacement A", "Replacement B"]
        assert [m["id"] for m in active] == [s["new_medication_id"] for s in result["replacements"]]
        assert all(m["schedules"][0]["active"] == m["active"] for m in current)
        assert all(m["quantity"] == 10 for m in current)
        assert call(client, "replace_medications", args)["isError"]
        log = db_session.query(MedicationLog).filter_by(patient_id=patient.id).one()
        assert (log.medication.name, log.schedule_id) == ("Original A", old_schedule)
        audit = db_session.query(AuditLog).filter_by(action="mcp.replace_medications", resource_id=patient.id).one()
        assert json.loads(audit.details) == result


def test_patient_and_schedule_scope(service, db_session, patient):
    other = create_patient(db_session, {"first_name": "Another", "last_name": "Patient"})
    foreign = stage_medication(db_session, patient_id=other.id, name="Other", quantity=0, quantity_unit="units")
    shared = stage_medication(db_session, patient_id=None, name="Shared", quantity=0, quantity_unit="units")
    db_session.commit()
    app, headers = service
    with TestClient(app, base_url=BASE, headers=headers) as client:
        assert plan(client)["medications"] == []
        args = target(client)
        for med_id in (foreign.id, shared.id):
            assert call(client, "retire_medication", {**args, "medication_id": med_id})["isError"]
        for invalid in (other.id, True):
            result = call(client, "add_medication", {**args, "patient_id": invalid, "medication": new_med("X")})
            assert result["isError"]
        args["medication"] = new_med("Owned")
        med_id = call(client, "add_medication", args)["structuredContent"]["medication_id"]
        schedule_id = plan(client)["medications"][0]["schedules"][0]["id"]
        change = {**target(client), "medication_id": med_id, "schedule_id": schedule_id,
                  "schedule": {"description": "Evening", "cron_expression": "0 23 * * *"}}
        assert call(client, "set_medication_schedule", {**change, "medication_id": foreign.id})["isError"]
        for invalid in ({"cron_expression": "bad"}, {"dose_amount": 0}, {"dose_amount": True},
                        {"administered_at": "2026-01-01"}):
            bad = {**change, "schedule": {**change["schedule"], **invalid}}
            assert call(client, "set_medication_schedule", bad)["isError"]
        assert call(client, "set_medication_schedule", change)["structuredContent"]["schedule_id"] == schedule_id
        edited = plan(client)["medications"][0]["schedules"][0]
        assert (edited["id"], edited["cron_expression"], edited["dose_amount"]) == (schedule_id, "0 23 * * *", 1)
        add_schedule = {**target(client), "medication_id": med_id}
        assert call(client, "set_medication_schedule", {**add_schedule, "schedule": {"active": True}})["isError"]
        second = call(client, "set_medication_schedule", {**add_schedule, "schedule": SCHEDULE})
        assert second["structuredContent"]["schedule_id"] != schedule_id
        result = call(client, "retire_medication", {**target(client), "medication_id": med_id})
        assert result["structuredContent"]["retired_medication_id"] == med_id
        assert not plan(client)["medications"][0]["active"]


def test_edit_existing_ui_medication_with_legacy_schedule(service, admin_client, patient, db_session):
    fields = new_med("Existing item")
    fields.pop("schedules")
    response = admin_client.post("/api/add/medication", json={
        **fields, "is_patient_specific": True, "admin_patient_id": patient.id,
    })
    assert response.status_code == 200
    med_id = response.json()["id"]
    legacy = stage_medication_schedule(db_session, medication_id=med_id, patient_id=None,
                                       **SCHEDULE, notes="Original label", grace_period_hours=3)
    db_session.commit()
    app, headers = service
    with TestClient(app, base_url=BASE, headers=headers) as client:
        args = {**target(client), "medication_id": med_id, "schedule_id": legacy.id}
        result = call(client, "set_medication_schedule", {
            **args, "schedule": {"cron_expression": "0 21 * * *", "description": "Evening"},
        })
        assert result["structuredContent"]["schedule_id"] == legacy.id
    db_session.expire_all()
    row, = admin_client.get(f"/api/medications/{med_id}/schedules").json()["schedules"]
    assert (row["cron_expression"], row["notes"], row["grace_period_hours"]) == ("0 21 * * *", "Original label", 3)
    assert (row["dose_amount"], row["patient_id"]) == (1, None)
