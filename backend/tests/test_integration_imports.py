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
"""Wave 4 — vent-log import worker: the tar-archive path-traversal guard.

`_run_import` extracts an uploaded tar; a malicious member name (`../x` or an
absolute path) must be refused before extraction (Zip/Tar Slip). The worker
opens its own ``SessionLocal()``, so we monkeypatch it onto the test's
transactional session (the documented Wave-4 gotcha)."""

import io
import os
import tarfile
import uuid
from datetime import datetime, timezone

import pytest

import routes.integration_imports as imports_mod


@pytest.fixture
def enabled_integration(db_session, patient, account):
    """Integration registry row + an enabled PatientIntegration for the patient."""
    from schemas.integration import Integration, PatientIntegration
    now = datetime.now(timezone.utc)
    integ = Integration(name="VOCSN", slug="vocsn", auth_type="local",
                         is_active=True, created_at=now, updated_at=now)
    db_session.add(integ)
    db_session.flush()
    pi = PatientIntegration(account_id=account.id, patient_id=patient.id,
                            integration_id=integ.id, is_enabled=True,
                            created_at=now, updated_at=now)
    db_session.add(pi)
    db_session.flush()
    return pi


def _make_tar(path, member_name):
    payload = b"sample"
    with tarfile.open(path, "w") as tf:
        info = tarfile.TarInfo(name=member_name)
        info.size = len(payload)
        tf.addfile(info, io.BytesIO(payload))


def _make_import(db_session, pi, storage_path, vendor="vocsn"):
    from schemas.vent_import import VentImport
    import_id = uuid.uuid4().hex
    vi = VentImport(
        id=import_id, patient_id=pi.patient_id, integration_id=pi.id,
        vendor=vendor, file_name="export.tar", storage_path=storage_path,
        status="queued", uploaded_at=datetime.now(timezone.utc),
    )
    db_session.add(vi)
    db_session.flush()
    return import_id


@pytest.fixture
def use_test_session(db_session, monkeypatch):
    """Point the worker's SessionLocal at the test session; neutralize its
    close() so post-call assertions can still read status."""
    monkeypatch.setattr(imports_mod, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(db_session, "close", lambda: None)


def _status(db_session, import_id):
    from schemas.vent_import import VentImport
    db_session.expire_all()
    return db_session.query(VentImport).filter(VentImport.id == import_id).first()


def test_rejects_parent_traversal_member(tmp_path, db_session, enabled_integration, use_test_session):
    archive = os.path.join(tmp_path, "evil.tar")
    _make_tar(archive, "../escape.txt")
    import_id = _make_import(db_session, enabled_integration, archive)

    imports_mod._run_import(import_id)

    vi = _status(db_session, import_id)
    assert vi.status == "failed"
    assert "unsafe archive member" in (vi.error or "")


def test_rejects_absolute_path_member(tmp_path, db_session, enabled_integration, use_test_session):
    archive = os.path.join(tmp_path, "abs.tar")
    _make_tar(archive, "/etc/passwd")
    import_id = _make_import(db_session, enabled_integration, archive)

    imports_mod._run_import(import_id)

    vi = _status(db_session, import_id)
    assert vi.status == "failed"
    assert "unsafe archive member" in (vi.error or "")


def test_safe_member_passes_extraction(tmp_path, db_session, enabled_integration, use_test_session):
    """A benign member clears the guard — the worker then fails later on an
    unknown vendor, proving extraction itself succeeded (no traversal block)."""
    archive = os.path.join(tmp_path, "safe.tar")
    _make_tar(archive, "subdir/reading.csv")
    import_id = _make_import(db_session, enabled_integration, archive,
                             vendor="not_a_real_vendor")

    imports_mod._run_import(import_id)

    vi = _status(db_session, import_id)
    assert vi.status == "failed"
    assert "unsafe archive member" not in (vi.error or "")
    assert "Unknown integration" in (vi.error or "")
