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
"""Avatars: shuffle the generated design, upload/serve/remove a photo.

Covers both owners (users + patients): permission gates, the account-level
photo GET the login picker relies on, patient visibility (404, not 403), the
byte-sniffing and size caps, immutable caching, and that every list payload
carries the two avatar fields.
"""
import os
import re

import pytest

import avatar_store

# 1x1 transparent PNG
_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d4944415478da63640000000600023081d02f0000000049454e44ae426082"
)
# JPEG SOI + APP0 marker — enough for the sniffer; the server never decodes.
_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


@pytest.fixture(autouse=True)
def photos_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(avatar_store, "PHOTOS_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture
def nurse_client(client, db_session, account):
    """patients.update but no PatientAccess grants — sees no patients."""
    from crud.users import create_user, get_role_by_name
    from routes.auth import create_access_token
    role = get_role_by_name(db_session, "nurse")
    user = create_user(
        db_session, username="nurse_test", password="nursepass",
        full_name="Nurse Test", is_system_admin=False,
        role_ids=[role.id] if role else None, force_password_reset=False,
    )
    user.account_id = account.id
    db_session.commit()
    db_session.refresh(user)
    token = create_access_token(user=user, account=account, auth_level="full")
    client.headers.update({"Authorization": f"Bearer {token}"})
    client.nurse = user
    return client


def _grant(db_session, user, patient):
    from datetime import datetime
    from schemas.patient import PatientAccess, AccessLevel
    db_session.add(PatientAccess(
        patient_id=patient.id, user_id=user.id, access_level=AccessLevel.VIEWER,
        is_active=True, granted_at=datetime.utcnow(),
    ))
    db_session.commit()


def _as_account(client, account):
    """Downgrade a client to account-level auth (the login picker's posture)."""
    from routes.auth import create_access_token
    token = create_access_token(account=account, auth_level="account")
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


def _upload(client, base, body, ctype="image/png", name="p.png"):
    return client.put(f"{base}/avatar/photo", files={"file": (name, body, ctype)})


# --- Shuffle -------------------------------------------------------------------

@pytest.mark.parametrize("kind", ["user", "patient"])
def test_shuffle_sets_a_fresh_uuid_seed(admin_client, admin_user, patient, kind):
    base = f"/api/users/{admin_user.id}" if kind == "user" else f"/api/patients/{patient.id}"
    first = admin_client.post(f"{base}/avatar/shuffle")
    assert first.status_code == 200, first.text
    assert UUID_RE.match(first.json()["avatar_seed"])
    assert first.json()["avatar_photo"] is None
    second = admin_client.post(f"{base}/avatar/shuffle")
    assert second.json()["avatar_seed"] != first.json()["avatar_seed"]


def test_shuffle_requires_update_permission(limited_client, admin_user, patient):
    assert limited_client.post(f"/api/users/{admin_user.id}/avatar/shuffle").status_code == 403
    assert limited_client.post(f"/api/patients/{patient.id}/avatar/shuffle").status_code == 403


def test_shuffle_rejects_account_level_auth(account_client, admin_user):
    assert account_client.post(f"/api/users/{admin_user.id}/avatar/shuffle").status_code == 401


def test_shuffle_unknown_owner_is_404(admin_client):
    assert admin_client.post("/api/users/999999/avatar/shuffle").status_code == 404
    assert admin_client.post("/api/patients/999999/avatar/shuffle").status_code == 404


# --- Photo upload / serve / delete ----------------------------------------------

@pytest.mark.parametrize("kind", ["user", "patient"])
def test_photo_roundtrip(admin_client, admin_user, patient, photos_dir, kind):
    owner_id = admin_user.id if kind == "user" else patient.id
    base = f"/api/users/{owner_id}" if kind == "user" else f"/api/patients/{owner_id}"

    up = _upload(admin_client, base, _PNG)
    assert up.status_code == 200, up.text
    filename = up.json()["avatar_photo"]
    assert avatar_store.FILENAME_RE.match(filename)
    assert filename.endswith(".png")
    on_disk = photos_dir / kind / str(owner_id) / filename
    assert on_disk.exists()

    got = admin_client.get(f"{base}/avatar/photo/{filename}")
    assert got.status_code == 200
    assert got.headers["content-type"].startswith("image/png")
    assert got.headers["cache-control"] == "private, max-age=31536000, immutable"
    assert got.content == _PNG

    # Re-upload (as JPEG) swaps the file and removes the old one.
    again = _upload(admin_client, base, _JPEG, "image/jpeg", "p.jpg")
    assert again.status_code == 200
    new_name = again.json()["avatar_photo"]
    assert new_name != filename and new_name.endswith(".jpg")
    assert not on_disk.exists()
    assert (photos_dir / kind / str(owner_id) / new_name).exists()
    assert admin_client.get(f"{base}/avatar/photo/{filename}").status_code == 404

    # Delete nulls the column, removes the file, and the GET 404s.
    gone = admin_client.delete(f"{base}/avatar/photo")
    assert gone.status_code == 200
    assert gone.json()["avatar_photo"] is None
    assert not (photos_dir / kind / str(owner_id) / new_name).exists()
    assert admin_client.get(f"{base}/avatar/photo/{new_name}").status_code == 404


def test_upload_decides_by_magic_bytes_not_content_type(admin_client, admin_user):
    base = f"/api/users/{admin_user.id}"
    # Claims PNG, is a shell script.
    resp = _upload(admin_client, base, b"#!/bin/sh\necho hi\n", "image/png")
    assert resp.status_code == 415
    # Claims text, is a PNG — accepted.
    resp = _upload(admin_client, base, _PNG, "text/plain", "whatever.txt")
    assert resp.status_code == 200
    assert resp.json()["avatar_photo"].endswith(".png")
    # SVG is not an image we serve.
    resp = _upload(admin_client, base, b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml")
    assert resp.status_code == 415


def test_upload_too_large(admin_client, admin_user):
    body = _JPEG + b"\x00" * (avatar_store.MAX_AVATAR_BYTES + 1 - len(_JPEG))
    resp = _upload(admin_client, f"/api/users/{admin_user.id}", body, "image/jpeg", "big.jpg")
    assert resp.status_code == 413


def test_upload_requires_update_permission(limited_client, admin_user, patient):
    assert _upload(limited_client, f"/api/users/{admin_user.id}", _PNG).status_code == 403
    assert _upload(limited_client, f"/api/patients/{patient.id}", _PNG).status_code == 403
    assert limited_client.delete(f"/api/users/{admin_user.id}/avatar/photo").status_code == 403


def test_photo_get_rejects_foreign_and_malformed_filenames(admin_client, admin_user):
    base = f"/api/users/{admin_user.id}"
    real = _upload(admin_client, base, _PNG).json()["avatar_photo"]
    assert admin_client.get(f"{base}/avatar/photo/{'0' * 32}.png").status_code == 404
    assert admin_client.get(f"{base}/avatar/photo/..%2F..%2Fetc%2Fpasswd").status_code == 404
    assert admin_client.get(f"{base}/avatar/photo/{real}").status_code == 200


def test_photo_get_needs_a_photo_on_the_row(admin_client, admin_user):
    assert admin_client.get(f"/api/users/{admin_user.id}/avatar/photo/{'a' * 32}.png").status_code == 404


# --- Login picker: account-level GET, same-account only --------------------------

def test_user_photo_readable_at_account_level(admin_client, admin_user, account):
    name = _upload(admin_client, f"/api/users/{admin_user.id}", _PNG).json()["avatar_photo"]
    resp = _as_account(admin_client, account).get(f"/api/users/{admin_user.id}/avatar/photo/{name}")
    assert resp.status_code == 200
    assert resp.content == _PNG


def test_user_photo_hidden_from_other_accounts(admin_client, admin_user, db_session):
    from models.users import Account
    from routes.auth import create_access_token
    name = _upload(admin_client, f"/api/users/{admin_user.id}", _PNG).json()["avatar_photo"]
    other = Account(name="Other Family", slug="other-family", password_hash="x",
                    timezone="UTC", is_default=False)
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)
    token = create_access_token(account=other, auth_level="account")
    admin_client.headers.update({"Authorization": f"Bearer {token}"})
    assert admin_client.get(f"/api/users/{admin_user.id}/avatar/photo/{name}").status_code == 404


# --- Patient visibility ------------------------------------------------------------

def test_patient_avatar_routes_scope_to_visible_patients(nurse_client, db_session, patient):
    base = f"/api/patients/{patient.id}"
    # nurse has patients.update but no grant → 404 everywhere, existence not leaked
    assert nurse_client.post(f"{base}/avatar/shuffle").status_code == 404
    assert _upload(nurse_client, base, _PNG).status_code == 404
    assert nurse_client.get(f"{base}/avatar/photo/{'a' * 32}.png").status_code == 404

    _grant(db_session, nurse_client.nurse, patient)
    assert nurse_client.post(f"{base}/avatar/shuffle").status_code == 200
    up = _upload(nurse_client, base, _PNG)
    assert up.status_code == 200
    assert nurse_client.get(f"{base}/avatar/photo/{up.json()['avatar_photo']}").status_code == 200


# --- Payloads carry the fields ------------------------------------------------------

def test_list_payloads_carry_avatar_fields(admin_client, admin_user, patient, account):
    seed = admin_client.post(f"/api/patients/{patient.id}/avatar/shuffle").json()["avatar_seed"]
    useed = admin_client.post(f"/api/users/{admin_user.id}/avatar/shuffle").json()["avatar_seed"]

    pl = admin_client.get("/api/patients").json()
    row = next(p for p in pl if p["id"] == patient.id)
    assert row["avatar_seed"] == seed and row["avatar_photo"] is None
    assert admin_client.get(f"/api/patients/{patient.id}").json()["avatar_seed"] == seed

    ul = admin_client.get("/api/users").json()
    row = next(u for u in ul if u["id"] == admin_user.id)
    assert row["avatar_seed"] == useed and "avatar_photo" in row
    assert admin_client.get(f"/api/users/{admin_user.id}").json()["avatar_seed"] == useed
    al = admin_client.get("/api/auth/users").json()
    assert next(u for u in al if u["id"] == admin_user.id)["avatar_seed"] == useed

    summary = admin_client.get("/api/dashboard/summary").json()
    prow = next(p for p in summary["patients"] if p["id"] == patient.id)
    assert prow["avatar_seed"] == seed and "avatar_photo" in prow

    # the login picker, at account level
    picker = _as_account(admin_client, account).get("/api/auth/account/users").json()
    assert next(u for u in picker if u["id"] == admin_user.id)["avatar_seed"] == useed
