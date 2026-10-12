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
"""Exercise real backup DB hooks and filesystem payloads together, using only fixtures."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
from datetime import datetime, timezone
from types import SimpleNamespace
import uuid

import pytest

import avatar_store
import document_store
from crud.backup import (export_patient_to_targz, restore_patient_from_targz,
                         get_or_create_imported_integration)
from models.users import Account
from schemas.clinical_results import ClinicalDocument, DiagnosticReport
from schemas.dme_shipment import DMEShipment, DMEShipmentDocument
from schemas.integration import PatientIntegration
from schemas.patient import Patient
from schemas.vent_device_info import VentDeviceInfo
from schemas.vent_import import VentImport
from schemas.vent_sample import VentSample


WHEN = datetime(2026, 7, 4, 13, 30, tzinfo=timezone.utc)
PHOTO = b"\x89PNG\r\n\x1a\nsynthetic source avatar"
REPORT = b"%PDF synthetic clinical report"
INLINE = b"synthetic inline clinical note"
SLIP = b"%PDF synthetic packing slip"
UPLOAD = b"synthetic original vent upload"
SAMPLES = b"timestamp,value\n2026-07-04,20\n"


def _add(db, model_cls, **values):
    row = model_cls(**values)
    db.add(row)
    db.flush()
    return row


def _disk_snapshot(root):
    return {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in root.rglob("*") if path.is_file()}


@pytest.fixture
def blob_graph(db_session, account, patient, monkeypatch, tmp_path):
    db = db_session
    photos, documents, data = (tmp_path / name for name in ("photos", "documents", "data"))
    monkeypatch.setattr(avatar_store, "PHOTOS_DIR", str(photos))
    monkeypatch.setattr(document_store, "EPIC_DOCS_DIR", str(documents))
    monkeypatch.setenv("INTEGRATIONS_DATA_DIR", str(data))
    patient.account_id = account.id
    patient.avatar_photo = avatar_store.save_avatar("patient", patient.id, PHOTO, "image/png")
    target = _add(db, Account, name="Blob target", slug="blob-backup-target",
                  password_hash="unused-test-hash", timezone="America/New_York")
    resident = _add(db, Patient, account_id=target.id, first_name="Existing",
                    last_name="Resident", created_at=WHEN, updated_at=WHEN)
    resident.avatar_photo = avatar_store.save_avatar("patient", resident.id,
                                                    b"\x89PNG\r\n\x1a\nresident", "image/png")
    resident_path, resident_size = document_store.save_document(target.id, resident.id,
                                                               b"existing document", "text/plain")
    _add(db, ClinicalDocument, account_id=target.id, patient_id=resident.id,
         title="Existing document", storage="file", file_path=resident_path,
         size_bytes=resident_size, content_type="text/plain", created_at=WHEN)

    report = _add(db, DiagnosticReport, account_id=account.id, patient_id=patient.id,
                  display="Synthetic report", status="final", created_at=WHEN, updated_at=WHEN)
    clinical_path, size = document_store.save_document(account.id, patient.id, REPORT, "application/pdf")
    clinical = _add(db, ClinicalDocument, account_id=account.id, patient_id=patient.id,
                    diagnostic_report_id=report.id, title="File report", storage="file",
                    file_path=clinical_path, size_bytes=size, content_type="application/pdf", created_at=WHEN)
    inline = _add(db, ClinicalDocument, account_id=account.id, patient_id=patient.id,
                  diagnostic_report_id=report.id, title="Inline note", storage="db", data=INLINE,
                  size_bytes=len(INLINE), content_type="text/plain", created_at=WHEN)
    shipment = _add(db, DMEShipment, account_id=account.id, patient_id=patient.id,
                    status="complete", created_at=WHEN, updated_at=WHEN)
    slip_path, slip_size = document_store.save_document(account.id, patient.id, SLIP, "application/pdf")
    slip = _add(db, DMEShipmentDocument, account_id=account.id, patient_id=patient.id,
                shipment_id=shipment.id, title="Packing slip", storage="file", file_path=slip_path,
                size_bytes=slip_size, content_type="application/pdf", created_at=WHEN)

    integration_id = get_or_create_imported_integration(db, account.id, patient.id)
    import_id = uuid.uuid4().hex
    vent_dir = data / "vent_imports" / import_id
    (vent_dir / "extracted").mkdir(parents=True)
    vent_path = vent_dir / "upload.tar.gz"
    vent_path.write_bytes(UPLOAD)
    (vent_dir / "extracted/batch_1.csv").write_bytes(SAMPLES)
    vent = _add(db, VentImport, id=import_id, patient_id=patient.id,
                integration_id=integration_id, vendor="vocsn", file_name="original.tar.gz",
                file_size_bytes=len(UPLOAD), storage_path=str(vent_path), status="completed",
                uploaded_at=WHEN, parsed_at=WHEN)
    _add(db, VentDeviceInfo, import_id=vent.id, vendor="vocsn", model="Synthetic ventilator")
    _add(db, VentSample, import_id=vent.id, patient_id=patient.id, recorded_at_raw=WHEN,
         recorded_at=WHEN, parameter_key="synthetic_pressure", value_numeric=20.0)
    db.commit()
    return SimpleNamespace(source=patient, account=account, target=target, resident=resident,
                           clinical=clinical, inline=inline, report=report, slip=slip,
                           shipment=shipment, vent=vent, root=tmp_path, photos=photos,
                           documents=documents, data=data)


def test_core_blob_roundtrip_remaps_paths_rows_and_payloads(db_session, blob_graph):
    db, g = db_session, blob_graph
    before = _disk_snapshot(g.root)
    archive, _ = export_patient_to_targz(db, g.source.id, g.account.id)
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        manifest = json.load(tar.extractfile("manifest.json"))
        payloads = manifest["attachments"]["files"]
        assert len(payloads) == 6
        for entry in payloads:
            data = tar.extractfile(entry["member"]).read()
            assert len(data) == entry["size"]
            assert hashlib.sha256(data).hexdigest() == entry["sha256"]
        exported_inline = next(row for row in json.load(tar.extractfile("clinical_documents.json"))
                               if row["id"] == g.inline.id)
        assert exported_inline["data"] is None
    # Moving inline bytes into the archive must not mutate the source ORM row.
    assert g.inline.data == INLINE

    summary = restore_patient_from_targz(db, archive, g.target.id)
    restored_id = summary["new_patient_id"]
    assert restored_id not in (g.source.id, g.resident.id)
    restored = db.get(Patient, restored_id)
    assert restored.account_id == g.target.id
    photo = Path(avatar_store.avatar_path("patient", restored_id, restored.avatar_photo))
    assert photo.read_bytes() == PHOTO
    assert restored.avatar_photo != g.source.avatar_photo
    docs = {row.title: row for row in db.query(ClinicalDocument).filter_by(patient_id=restored_id)}
    assert set(docs) == {"File report", "Inline note"}
    assert all(row.account_id == g.target.id for row in docs.values())
    report = db.query(DiagnosticReport).filter_by(patient_id=restored_id).one()
    assert report.id != g.report.id
    assert all(row.diagnostic_report_id == report.id for row in docs.values())
    file_doc, inline_doc = docs["File report"], docs["Inline note"]
    file_path = Path(file_doc.file_path)
    assert file_path.parent == g.documents / str(g.target.id) / str(restored_id)
    assert file_path.read_bytes() == REPORT
    assert file_doc.size_bytes == len(REPORT)
    assert file_doc.file_path != g.clinical.file_path
    assert inline_doc.storage == "db" and inline_doc.data == INLINE and inline_doc.file_path is None
    assert inline_doc.size_bytes == len(INLINE)

    shipment = db.query(DMEShipment).filter_by(patient_id=restored_id).one()
    slip = db.query(DMEShipmentDocument).filter_by(patient_id=restored_id).one()
    assert slip.shipment_id == shipment.id != g.shipment.id
    assert slip.account_id == g.target.id
    assert Path(slip.file_path).parent == file_path.parent
    assert Path(slip.file_path).read_bytes() == SLIP
    assert slip.file_path != g.slip.file_path

    vent = db.query(VentImport).filter_by(patient_id=restored_id).one()
    assert vent.id != g.vent.id
    vent_path = Path(vent.storage_path)
    assert vent_path.parent == g.data / "vent_imports" / vent.id
    assert vent_path.read_bytes() == UPLOAD
    assert (vent_path.parent / "extracted/batch_1.csv").read_bytes() == SAMPLES
    integration = db.get(PatientIntegration, vent.integration_id)
    assert integration.id != g.vent.integration_id
    assert (integration.account_id, integration.patient_id) == (g.target.id, restored_id)
    info = db.query(VentDeviceInfo).filter_by(import_id=vent.id).one()
    sample = db.query(VentSample).filter_by(patient_id=restored_id).one()
    assert info.model == "Synthetic ventilator"
    assert sample.import_id == vent.id
    assert sample.value_numeric == 20.0
    assert (sample.recorded_at_raw, sample.recorded_at) == (WHEN, WHEN)
    assert summary["inserted"]["clinical_documents"] == 2
    assert summary["inserted"]["dme_shipment_documents"] == 1
    assert summary["inserted"]["vent_samples"] == 1

    after = _disk_snapshot(g.root)
    assert {path: after[path] for path in before} == before
    db.refresh(g.source)
    db.refresh(g.clinical)
    db.refresh(g.inline)
    db.refresh(g.vent)
    assert Path(g.clinical.file_path).read_bytes() == REPORT
    assert g.inline.data == INLINE
    assert Path(g.vent.storage_path).read_bytes() == UPLOAD


def test_core_db_commit_failure_removes_staged_blobs_and_rows(db_session, blob_graph, monkeypatch):
    db, g = db_session, blob_graph
    archive, _ = export_patient_to_targz(db, g.source.id, g.account.id)
    before_files = _disk_snapshot(g.root)
    models = (Patient, ClinicalDocument, DiagnosticReport, DMEShipment, DMEShipmentDocument,
              VentImport, VentDeviceInfo, VentSample, PatientIntegration)
    before_counts = {model: db.query(model).count() for model in models}
    source_id, resident_id = g.source.id, g.resident.id
    staged = []

    def fail_commit():
        # This failure happens after both SQL inserts and all attachment writes.
        staged.extend(set(_disk_snapshot(g.root)) - set(before_files))
        assert len(staged) == 5  # avatar, report, slip, upload and extracted CSV
        assert db.query(Patient).count() == before_counts[Patient] + 1
        assert db.query(ClinicalDocument).count() == before_counts[ClinicalDocument] + 2
        raise RuntimeError("synthetic database commit failure")

    with monkeypatch.context() as scoped:
        scoped.setattr(db, "commit", fail_commit)
        with pytest.raises(RuntimeError, match="synthetic database commit failure"):
            restore_patient_from_targz(db, archive, g.target.id)
    assert staged
    assert _disk_snapshot(g.root) == before_files
    assert {model: db.query(model).count() for model in models} == before_counts
    assert db.get(Patient, source_id).account_id == g.account.id
    assert db.get(Patient, resident_id).account_id == g.target.id
