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
"""Shipments are scoped to an account.

Every endpoint here was reachable across accounts: nothing set account_id on
create and no query filtered on it, so holding shipments.read was enough to
read, and shipments.receive enough to write into, any other account's data.

The item routes are covered separately because they take both a shipment id
and an item id but only ever used the item's — so naming your own shipment
alongside someone else's line was enough to reach it.
"""
import pytest


# --- A second account, with its own user, client and patient -----------------

@pytest.fixture
def other_account(db_session):
    from models.users import Account
    import bcrypt
    acc = Account(
        name="Other Family", slug="other-family",
        password_hash=bcrypt.hashpw(b"otherpass", bcrypt.gensalt()).decode(),
        timezone="America/New_York", is_default=False,
    )
    db_session.add(acc)
    db_session.commit()
    db_session.refresh(acc)
    return acc


@pytest.fixture
def other_user(db_session, other_account):
    from crud.users import create_user, get_role_by_name
    role = get_role_by_name(db_session, "system_admin")
    user = create_user(
        db_session, username="other_admin", password="otherpass",
        full_name="Other Admin", is_system_admin=True,
        role_ids=[role.id] if role else None, force_password_reset=False,
    )
    user.account_id = other_account.id
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def other_client(client, other_user, other_account):
    """A fully-privileged client belonging to a different account.

    System admin on purpose: the boundary must hold on account identity, not
    on permissions, so the strongest role is the honest thing to test with.
    """
    from routes.auth import create_access_token
    from starlette.testclient import TestClient
    token = create_access_token(user=other_user, account=other_account, auth_level="full")
    fresh = TestClient(client.app)
    fresh.headers.update({"Authorization": f"Bearer {token}"})
    return fresh


@pytest.fixture
def other_patient(db_session, other_account):
    from crud.patients import create_patient
    p = create_patient(db_session, {
        "first_name": "Other", "last_name": "Patient",
        "account_id": other_account.id, "is_active": True,
    })
    db_session.commit()
    return p


def _make_shipment(cl, patient, **over):
    payload = {"patient_id": patient.id, "po_number": "PO-SCOPE"}
    payload.update(over)
    resp = cl.post("/api/shipments", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _add_item(cl, sid, **over):
    payload = {"item_description": "Tubing", "qty_ordered": 5, "qty_shipped": 5}
    payload.update(over)
    resp = cl.post(f"/api/shipments/{sid}/items", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


# --- The account is recorded on create ---------------------------------------

def test_create_records_the_account(admin_client, patient, db_session, account):
    sid = _make_shipment(admin_client, patient)
    from schemas.dme_shipment import DMEShipment
    row = db_session.query(DMEShipment).filter(DMEShipment.id == sid).first()
    assert row.account_id == account.id


# --- Reads -------------------------------------------------------------------

def test_list_excludes_other_accounts(admin_client, other_client, patient, other_patient):
    mine = _make_shipment(admin_client, patient)
    theirs = _make_shipment(other_client, other_patient)

    ids = [s["id"] for s in admin_client.get("/api/shipments").json()["shipments"]]
    assert mine in ids
    assert theirs not in ids


def test_get_by_id_across_accounts_is_404(admin_client, other_client, other_patient):
    theirs = _make_shipment(other_client, other_patient)
    assert admin_client.get(f"/api/shipments/{theirs}").status_code == 404


def test_alerts_exclude_other_accounts(admin_client, other_client, other_patient):
    theirs = _make_shipment(other_client, other_patient)
    item = _add_item(other_client, theirs)
    # Receive nothing, then finalize: that shortfall raises a 'short' alert.
    other_client.post(f"/api/shipments/{theirs}/receive",
                      json=[{"shipment_item_id": item, "qty_received": 0}])
    other_client.post(f"/api/shipments/{theirs}/finalize")

    theirs_alerts = other_client.get("/api/shipments/alerts").json()["alerts"]
    assert theirs_alerts, "the other account should see its own alert"

    mine = admin_client.get("/api/shipments/alerts").json()["alerts"]
    assert all(a["shipment_id"] != theirs for a in mine)


def test_shipment_alerts_by_id_across_accounts_is_empty(admin_client, other_client, other_patient):
    theirs = _make_shipment(other_client, other_patient)
    item = _add_item(other_client, theirs)
    # Give the shipment a real alert first, or an empty list proves nothing.
    other_client.post(f"/api/shipments/{theirs}/receive",
                      json=[{"shipment_item_id": item, "qty_received": 0}])
    other_client.post(f"/api/shipments/{theirs}/finalize")
    assert other_client.get(f"/api/shipments/{theirs}/alerts").json()["alerts"]

    assert admin_client.get(f"/api/shipments/{theirs}/alerts").json()["alerts"] == []


def test_documents_across_accounts_are_hidden(admin_client, other_client, other_patient):
    theirs = _make_shipment(other_client, other_patient)
    other_client.post(
        f"/api/shipments/{theirs}/documents",
        files={"file": ("slip.png", b"\x89PNG\r\n\x1a\n" + b"0" * 32, "image/png")},
    )
    assert other_client.get(f"/api/shipments/{theirs}/documents").json()["documents"]
    assert admin_client.get(f"/api/shipments/{theirs}/documents").json()["documents"] == []


# --- Writes ------------------------------------------------------------------

def test_update_across_accounts_does_not_apply(admin_client, other_client, other_patient, db_session):
    theirs = _make_shipment(other_client, other_patient)
    admin_client.patch(f"/api/shipments/{theirs}", json={"tracking_number": "STOLEN"})

    from schemas.dme_shipment import DMEShipment
    db_session.expire_all()
    row = db_session.query(DMEShipment).filter(DMEShipment.id == theirs).first()
    assert row.tracking_number != "STOLEN"


def test_delete_across_accounts_does_not_apply(admin_client, other_client, other_patient, db_session):
    theirs = _make_shipment(other_client, other_patient)
    admin_client.delete(f"/api/shipments/{theirs}")

    from schemas.dme_shipment import DMEShipment
    db_session.expire_all()
    assert db_session.query(DMEShipment).filter(DMEShipment.id == theirs).first() is not None


def test_add_item_across_accounts_does_not_apply(admin_client, other_client, other_patient):
    theirs = _make_shipment(other_client, other_patient)
    resp = admin_client.post(f"/api/shipments/{theirs}/items",
                             json={"item_description": "Injected", "qty_ordered": 1})
    assert resp.json().get("success") is not True
    assert other_client.get(f"/api/shipments/{theirs}").json()["items"] == []


def test_finalize_across_accounts_does_not_apply(admin_client, other_client, other_patient):
    theirs = _make_shipment(other_client, other_patient)
    resp = admin_client.post(f"/api/shipments/{theirs}/finalize")
    assert resp.json().get("success") is not True
    assert other_client.get(f"/api/shipments/{theirs}").json()["finalized_at"] is None


# --- Item routes: the shipment id in the path is now enforced ----------------

def test_item_update_cannot_reach_another_shipments_line(
    admin_client, other_client, patient, other_patient
):
    """The classic shape: name a shipment you own, an item you do not."""
    theirs = _make_shipment(other_client, other_patient)
    their_item = _add_item(other_client, theirs)
    mine = _make_shipment(admin_client, patient)

    admin_client.put(f"/api/shipments/{mine}/items/{their_item}",
                     json={"item_description": "Rewritten"})

    items = other_client.get(f"/api/shipments/{theirs}").json()["items"]
    assert items[0]["item_description"] == "Tubing"


def test_item_delete_cannot_reach_another_shipments_line(
    admin_client, other_client, patient, other_patient
):
    theirs = _make_shipment(other_client, other_patient)
    their_item = _add_item(other_client, theirs)
    mine = _make_shipment(admin_client, patient)

    admin_client.delete(f"/api/shipments/{mine}/items/{their_item}")
    assert len(other_client.get(f"/api/shipments/{theirs}").json()["items"]) == 1


def test_receive_cannot_reach_another_shipments_line(
    admin_client, other_client, patient, other_patient
):
    """Receiving writes to inventory, so this one moved stock, not just rows."""
    theirs = _make_shipment(other_client, other_patient)
    their_item = _add_item(other_client, theirs)
    mine = _make_shipment(admin_client, patient)

    resp = admin_client.post(f"/api/shipments/{mine}/receive",
                             json=[{"shipment_item_id": their_item, "qty_received": 5}])
    assert all(r["success"] is False for r in resp.json()["results"])

    items = other_client.get(f"/api/shipments/{theirs}").json()["items"]
    assert items[0]["qty_received"] == 0


def test_receipts_cannot_be_read_through_another_shipment(
    admin_client, other_client, patient, other_patient
):
    theirs = _make_shipment(other_client, other_patient)
    their_item = _add_item(other_client, theirs)
    other_client.post(f"/api/shipments/{theirs}/receive",
                      json=[{"shipment_item_id": their_item, "qty_received": 5}])
    mine = _make_shipment(admin_client, patient)

    body = admin_client.get(f"/api/shipments/{mine}/items/{their_item}/receipts").json()
    assert body["receipts"] == []
    assert body["totals"]["total"] == 0


# --- Same-account behaviour is unchanged -------------------------------------

def test_own_items_still_work_through_their_own_shipment(admin_client, patient):
    sid = _make_shipment(admin_client, patient)
    item = _add_item(admin_client, sid)

    assert admin_client.put(f"/api/shipments/{sid}/items/{item}",
                            json={"item_description": "Renamed"}).json()["success"] is True
    resp = admin_client.post(f"/api/shipments/{sid}/receive",
                             json=[{"shipment_item_id": item, "qty_received": 5}])
    assert resp.json()["results"][0]["success"] is True

    items = admin_client.get(f"/api/shipments/{sid}").json()["items"]
    assert items[0]["item_description"] == "Renamed"
    assert items[0]["qty_received"] == 5
