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
"""Wave 3 — user attention messages: create/list/snooze/dismiss, the
ack_scope 'anyone' vs 'per_user' semantics, and the low-medication-stock
generator that runs on GET /active."""


def _create(admin_client, **over):
    payload = {"title": "Heads up", "body": "Something needs attention"}
    payload.update(over)
    return admin_client.post("/api/messages", json=payload)


def _active_ids(client, headers=None):
    resp = client.get("/api/messages/active", headers=headers or {})
    assert resp.status_code == 200, resp.text
    return [m["id"] for m in resp.json()["items"]]


def _bearer(user, account):
    from routes.auth import create_access_token
    token = create_access_token(user=user, account=account, auth_level="full")
    return {"Authorization": f"Bearer {token}"}


# --- Create / validation -----------------------------------------------------
def test_create_message(admin_client):
    resp = _create(admin_client)
    assert resp.status_code == 201, resp.text
    assert resp.json()["message"]["id"] > 0


def test_create_rejects_bad_severity(admin_client):
    assert _create(admin_client, severity="apocalyptic").status_code == 422


def test_create_rejects_bad_ack_scope(admin_client):
    assert _create(admin_client, ack_scope="some_people").status_code == 422


def test_create_requires_title(admin_client):
    assert admin_client.post("/api/messages", json={"body": "no title"}).status_code == 422


# --- List --------------------------------------------------------------------
def test_list_messages(admin_client):
    _create(admin_client)
    resp = admin_client.get("/api/messages")
    assert resp.status_code == 200
    assert "items" in resp.json()


def test_active_messages_shape(admin_client):
    resp = admin_client.get("/api/messages/active")
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body and "count" in body


# --- Dismiss / snooze --------------------------------------------------------
def test_dismiss_message(admin_client):
    mid = _create(admin_client).json()["message"]["id"]
    assert admin_client.post(f"/api/messages/{mid}/dismiss").status_code == 200
    assert mid not in _active_ids(admin_client)


def test_dismiss_unknown_404(admin_client):
    assert admin_client.post("/api/messages/999999/dismiss").status_code == 404


def test_snooze_hides_message(admin_client):
    mid = _create(admin_client).json()["message"]["id"]
    resp = admin_client.post(f"/api/messages/{mid}/snooze", json={"minutes": 60})
    assert resp.status_code == 200
    assert resp.json()["snoozed_until"] is not None
    assert mid not in _active_ids(admin_client)  # snoozed -> hidden


def test_snooze_rejects_zero_minutes(admin_client):
    mid = _create(admin_client).json()["message"]["id"]
    assert admin_client.post(f"/api/messages/{mid}/snooze", json={"minutes": 0}).status_code == 422


def test_snooze_unknown_404(admin_client):
    assert admin_client.post("/api/messages/999999/snooze", json={"minutes": 5}).status_code == 404


def test_delete_message(admin_client):
    mid = _create(admin_client).json()["message"]["id"]
    assert admin_client.delete(f"/api/messages/{mid}").status_code == 200


def test_delete_unknown_404(admin_client):
    assert admin_client.delete("/api/messages/999999").status_code == 404


# --- ack_scope semantics -----------------------------------------------------
def test_ack_scope_anyone_clears_for_everyone(admin_client, limited_user, account):
    """'anyone': one user dismissing clears the message for all users."""
    mid = _create(admin_client, ack_scope="anyone").json()["message"]["id"]
    admin_client.post(f"/api/messages/{mid}/dismiss")
    # A different user no longer sees it either.
    assert mid not in _active_ids(admin_client, headers=_bearer(limited_user, account))


def test_ack_scope_per_user_clears_only_for_that_user(admin_client, limited_user, account):
    """'per_user': each user acknowledges individually; dismissing as one user
    leaves it active for another."""
    mid = _create(admin_client, ack_scope="per_user").json()["message"]["id"]
    admin_client.post(f"/api/messages/{mid}/dismiss")  # admin acks
    assert mid not in _active_ids(admin_client)  # cleared for admin
    # Still in the other user's face.
    assert mid in _active_ids(admin_client, headers=_bearer(limited_user, account))


# --- Low-medication-stock generator (runs on /active) ------------------------
def test_low_medication_message_generated_and_not_dismissible(admin_client, patient):
    """An out-of-stock tracked med surfaces a critical low_medication message
    that cannot be dismissed (it clears by restocking) but can be snoozed."""
    admin_client.post("/api/add/medication", json={
        "name": "Lasix", "concentration": "40mg", "quantity": 0,
        "quantity_unit": "tablets", "instructions": "daily",
        "start_date": "2026-06-01", "is_patient_specific": True,
        "admin_patient_id": patient.id,
    })

    items = admin_client.get("/api/messages/active").json()["items"]
    low = [m for m in items if m["type"] == "low_medication"]
    assert low, "expected a low_medication message for the out-of-stock med"
    msg = low[0]
    assert msg["severity"] == "critical"
    assert msg["dismissible"] is False

    # Non-dismissible -> 409; snoozable -> 200.
    assert admin_client.post(f"/api/messages/{msg['id']}/dismiss").status_code == 409
    assert admin_client.post(f"/api/messages/{msg['id']}/snooze",
                             json={"minutes": 30}).status_code == 200


def test_requires_auth(client):
    assert client.get("/api/messages/active").status_code == 401
