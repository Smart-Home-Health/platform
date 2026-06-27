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
"""Wave 5 — patient backup export/import: the .tar.gz round-trip with FK
remap (a new patient id), the manifest format-version guard, and the
system-admin gate."""

import io
import json
import tarfile


def _targz(members: dict) -> bytes:
    """Build an in-memory .tar.gz from {name: bytes}."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        for name, data in members.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def test_export_import_roundtrip(admin_client, db_session, account, patient):
    # The patient factory doesn't persist account_id; backup scopes by it.
    patient.account_id = account.id
    db_session.commit()

    # Give the patient a child row so the remap has something to carry over.
    admin_client.post("/api/providers", json={
        "patient_id": patient.id, "first_name": "Grace", "last_name": "Hopper",
        "provider_type": "primary_care",
    })

    export = admin_client.get(f"/api/backup/export/{patient.id}")
    assert export.status_code == 200, export.text
    assert export.headers["content-type"].startswith("application/gzip")
    archive = export.content
    assert archive[:2] == b"\x1f\x8b"  # gzip magic

    files = {"file": ("backup.tar.gz", archive, "application/gzip")}
    imp = admin_client.post("/api/backup/import", files=files)
    assert imp.status_code == 200, imp.text
    body = imp.json()
    # FK remap: the restore lands on a brand-new patient id.
    assert body["new_patient_id"] != patient.id
    assert body["new_patient_id"] > 0
    assert body["inserted"].get("providers", 0) >= 1


def test_export_unknown_patient_404(admin_client):
    assert admin_client.get("/api/backup/export/999999").status_code == 404


def test_import_empty_upload_400(admin_client):
    files = {"file": ("empty.tar.gz", b"", "application/gzip")}
    assert admin_client.post("/api/backup/import", files=files).status_code == 400


def test_import_rejects_missing_manifest(admin_client):
    archive = _targz({"some_other_file.json": b"[]"})
    files = {"file": ("bad.tar.gz", archive, "application/gzip")}
    assert admin_client.post("/api/backup/import", files=files).status_code == 400


def test_import_rejects_future_format_version(admin_client):
    archive = _targz({"manifest.json": json.dumps(
        {"format_version": 9999, "patient": {}}).encode()})
    files = {"file": ("future.tar.gz", archive, "application/gzip")}
    resp = admin_client.post("/api/backup/import", files=files)
    assert resp.status_code == 400
    assert "format version" in resp.json()["detail"].lower()


def test_export_requires_system_admin(limited_client, patient):
    assert limited_client.get(f"/api/backup/export/{patient.id}").status_code == 403


def test_requires_auth(client):
    assert client.get("/api/backup/export/1").status_code == 401
