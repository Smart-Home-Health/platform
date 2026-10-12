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
"""Filesystem-only backup tests; every source and destination is temporary.

Also runnable without the API/database test harness:
    python -m unittest discover -s backend/tests -p test_backup_attachments.py
"""
import copy
import importlib.util
import io
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import uuid


_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))
# Import this filesystem-only module without importing crud's DB-facing package.
_SPEC = importlib.util.spec_from_file_location("backup_attachments_under_test", _BACKEND / "crud/backup_attachments.py")
attachments = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(attachments)


class BackupAttachmentsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.photos = self.root / "avatars"
        self.docs = self.root / "documents"
        self.data = self.root / "data"
        for context in (patch.object(attachments.avatar_store, "PHOTOS_DIR", str(self.photos)),
                        patch.object(attachments.document_store, "EPIC_DOCS_DIR", str(self.docs)),
                        patch.dict(os.environ, {"INTEGRATIONS_DATA_DIR": str(self.data)})):
            context.start()
            self.addCleanup(context.stop)
        self.old_vent = uuid.uuid4().hex
        self.new_vent = str(uuid.uuid4())
        self.avatar_name = uuid.uuid4().hex + ".png"
        self.avatar = self.put(self.photos / "patient/7" / self.avatar_name, b"\x89PNG\r\n\x1a\nphoto")
        self.clinical = self.put(self.docs / "3/7/report.pdf", b"clinical-report")
        self.shipment = self.put(self.docs / "3/7/slip.png", b"shipment-slip")
        self.vent = self.put(self.data / "vent_imports" / self.old_vent / "upload.tar.gz", b"vent-upload")
        self.extracted = self.put(self.vent.parent / "extracted/subdir/samples.csv", b"timestamp,value\n1,3")
        self.contents = {
            "patient.json": [{"id": 7, "avatar_photo": self.avatar_name}],
            "clinical_documents.json": [
                {"id": 10, "account_id": 3, "patient_id": 7, "storage": "file",
                 "file_path": str(self.clinical), "content_type": "application/pdf", "data": None},
                {"id": 11, "account_id": 3, "patient_id": 7, "storage": "db",
                 "file_path": None, "content_type": "text/plain", "data": b"inline document"}],
            "dme_shipment_documents.json": [
                {"id": 12, "account_id": 3, "patient_id": 7, "storage": "file",
                 "file_path": str(self.shipment), "content_type": "image/png"}],
            "vent_imports.json": [{"id": self.old_vent, "storage_path": str(self.vent)}],
        }

    def put(self, path, payload):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        return path

    def export(self, contents=None):
        rows = copy.deepcopy(self.contents if contents is None else contents)
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            manifest = attachments.export_attachments(tar, rows, 7, 3)
        return buf.getvalue(), manifest, rows

    def restore(self, archive, manifest, rows, commit=False):
        with attachments.AttachmentRestore(archive, manifest) as restored:
            restored.restore(rows, 91, 42, {self.old_vent: self.new_vent})
            if commit:
                restored.commit()
        return restored

    def assert_no_destination(self):
        self.assertFalse((self.photos / "patient/91").exists())
        self.assertFalse((self.docs / "42").exists())
        self.assertFalse((self.data / "vent_imports" / self.new_vent).exists())

    def test_all_blob_types_round_trip_into_new_paths(self):
        archive, manifest, rows = self.export()
        self.assertEqual(len(manifest["files"]), 6)
        self.assertIsNone(rows["clinical_documents.json"][1]["data"])
        self.restore(archive, manifest, rows, commit=True)
        photo = self.photos / "patient/91" / rows["patient.json"][0]["avatar_photo"]
        self.assertNotEqual(photo.name, self.avatar_name)
        self.assertEqual(photo.read_bytes(), self.avatar.read_bytes())
        clinical, inline = rows["clinical_documents.json"]
        self.assertEqual(Path(clinical["file_path"]).read_bytes(), b"clinical-report")
        self.assertEqual(Path(clinical["file_path"]).parent, self.docs / "42/91")
        self.assertEqual(inline["data"], b"inline document")
        self.assertIsNone(inline["file_path"])
        self.assertEqual(Path(rows["dme_shipment_documents.json"][0]["file_path"]).read_bytes(), b"shipment-slip")
        vent = Path(rows["vent_imports.json"][0]["storage_path"])
        self.assertEqual(vent.parent.name, self.new_vent)
        self.assertEqual(vent.read_bytes(), b"vent-upload")
        self.assertEqual((vent.parent / "extracted/subdir/samples.csv").read_bytes(), self.extracted.read_bytes())
        self.assertEqual(self.vent.read_bytes(), b"vent-upload")

    def test_database_failure_cleans_only_new_files(self):
        archive, manifest, rows = self.export()
        with self.assertRaisesRegex(RuntimeError, "database commit"):
            with attachments.AttachmentRestore(archive, manifest) as restored:
                restored.restore(rows, 91, 42, {self.old_vent: self.new_vent})
                raise RuntimeError("database commit failed")
        self.assert_no_destination()
        self.assertEqual(self.avatar.read_bytes(), b"\x89PNG\r\n\x1a\nphoto")
        self.assertTrue(self.clinical.exists())

    def test_no_commit_also_removes_staged_files(self):
        self.restore(*self.export())
        self.assert_no_destination()

    def test_legacy_backup_warns_and_clears_foreign_paths(self):
        rows = copy.deepcopy(self.contents)
        restored = self.restore(b"", None, rows)
        self.assertIn("no attachment payloads", restored.warnings[0])
        self.assertIsNone(rows["patient.json"][0]["avatar_photo"])
        self.assertIsNone(rows["clinical_documents.json"][0]["file_path"])
        self.assertEqual(rows["vent_imports.json"][0]["storage_path"], "")
        self.assert_no_destination()

    def test_missing_referenced_source_fails_export(self):
        self.clinical.unlink()
        with self.assertRaisesRegex(ValueError, "missing or unreadable"):
            self.export()

    def test_missing_avatar_fails_export(self):
        self.avatar.unlink()
        with self.assertRaisesRegex(ValueError, "missing or unreadable"):
            self.export()

    def test_source_cannot_point_at_another_patients_document(self):
        rows = copy.deepcopy(self.contents)
        other = self.put(self.docs / "3/8/report.pdf", b"other patient")
        rows["clinical_documents.json"][0]["file_path"] = str(other)
        with self.assertRaisesRegex(ValueError, "outside"):
            self.export(rows)

    def test_legacy_document_namespace_round_trip_preserves_source(self):
        for member in ("clinical_documents.json", "dme_shipment_documents.json"):
            for account_id in (3, None):
                with self.subTest(member=member, account_id=account_id):
                    contents = copy.deepcopy(self.contents)
                    row = contents[member][0]
                    legacy = self.put(self.docs / "0/7" / Path(row["file_path"]).name,
                                      b"legacy document bytes")
                    row.update(account_id=account_id, file_path=str(legacy))
                    before_rows = copy.deepcopy(contents)
                    before_files = {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
                    archive, manifest, rows = self.export(contents)
                    self.assertEqual(rows[member][0]["file_path"], str(legacy))
                    self.assertEqual(rows[member][0]["account_id"], account_id)
                    with attachments.AttachmentRestore(archive, manifest) as restored:
                        restored.restore(rows, 91, 42, {self.old_vent: self.new_vent})
                        target = Path(rows[member][0]["file_path"])
                        self.assertEqual(target.parent, self.docs / "42/91")
                        self.assertNotEqual(target.name, legacy.name)
                        self.assertEqual(target.read_bytes(), b"legacy document bytes")
                    self.assertEqual(contents, before_rows)
                    self.assertEqual({p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()},
                                     before_files)

    def test_legacy_document_namespace_rejects_other_account_or_patient_row(self):
        legacy = self.put(self.docs / "0/7/report.pdf", b"legacy document")
        for member in ("clinical_documents.json", "dme_shipment_documents.json"):
            for field, value, error in (("account_id", 4, "another account"),
                                        ("patient_id", 8, "another patient"),
                                        ("patient_id", None, "another patient")):
                with self.subTest(member=member, field=field, value=value):
                    rows = copy.deepcopy(self.contents)
                    rows[member][0].update(file_path=str(legacy), **{field: value})
                    with self.assertRaisesRegex(ValueError, error):
                        self.export(rows)

    def test_document_namespace_rejects_other_account_or_patient_path(self):
        for member in ("clinical_documents.json", "dme_shipment_documents.json"):
            for namespace in ("4/7", "3/8", "0/8", "0/70"):
                with self.subTest(member=member, namespace=namespace):
                    rows = copy.deepcopy(self.contents)
                    other = self.put(self.docs / namespace / "report.pdf", b"other owner")
                    rows[member][0]["file_path"] = str(other)
                    with self.assertRaisesRegex(ValueError, "outside"):
                        self.export(rows)

    def test_legacy_document_namespace_rejects_file_and_directory_symlinks(self):
        for member in ("clinical_documents.json", "dme_shipment_documents.json"):
            for directory in (False, True):
                with self.subTest(member=member, directory=directory):
                    rows = copy.deepcopy(self.contents)
                    link = self.docs / "0/7" / (member + str(directory))
                    link.parent.mkdir(parents=True, exist_ok=True)
                    link.symlink_to(self.clinical.parent if directory else self.clinical,
                                    target_is_directory=directory)
                    rows[member][0]["file_path"] = str(link / "report.pdf" if directory else link)
                    with self.assertRaisesRegex(ValueError, "symbolic"):
                        self.export(rows)

    def test_legacy_document_namespace_rejects_traversal(self):
        self.put(self.docs / "0/8/report.pdf", b"other patient")
        (self.docs / "0/7").mkdir()
        for member in ("clinical_documents.json", "dme_shipment_documents.json"):
            with self.subTest(member=member):
                rows = copy.deepcopy(self.contents)
                rows[member][0]["file_path"] = str(self.docs / "0/7/../8/report.pdf")
                with self.assertRaisesRegex(ValueError, "Unsafe"):
                    self.export(rows)

    def test_missing_legacy_document_does_not_fall_back_to_current_namespace(self):
        for member in ("clinical_documents.json", "dme_shipment_documents.json"):
            with self.subTest(member=member):
                rows = copy.deepcopy(self.contents)
                current = Path(rows[member][0]["file_path"])
                self.assertTrue(current.is_file())
                rows[member][0]["file_path"] = str(self.docs / "0/7" / current.name)
                with self.assertRaisesRegex(ValueError, "missing or unreadable"):
                    self.export(rows)

    def test_source_symlink_is_rejected(self):
        self.shipment.unlink()
        self.shipment.symlink_to(self.clinical)
        with self.assertRaisesRegex(ValueError, "symbolic"):
            self.export()

    def test_vent_directory_symlink_is_rejected(self):
        (self.vent.parent / "linked").symlink_to(self.docs, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symbolic"):
            self.export()

    def test_missing_primary_vent_upload_fails_even_with_extracted_files(self):
        self.vent.unlink()
        with self.assertRaisesRegex(ValueError, "missing or unreadable"):
            self.export()

    def test_checksum_mismatch_rolls_back_earlier_blobs(self):
        archive, manifest, rows = self.export()
        manifest["files"][2]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.restore(archive, manifest, rows)
        self.assert_no_destination()

    def test_missing_blob_is_rejected(self):
        archive, manifest, rows = self.export()
        manifest["files"][0]["member"] = "attachments/99999999"
        with self.assertRaisesRegex(ValueError, "Missing"):
            self.restore(archive, manifest, rows)
        self.assert_no_destination()

    def test_manifest_cannot_omit_referenced_attachment(self):
        archive, manifest, rows = self.export()
        manifest["files"].pop()
        with self.assertRaisesRegex(ValueError, "undeclared"):
            self.restore(archive, manifest, rows)

    def test_vent_traversal_is_rejected(self):
        archive, manifest, rows = self.export()
        next(e for e in manifest["files"] if e["kind"] == "vent_import")["path"] = "../escape"
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            self.restore(archive, manifest, rows)
        self.assert_no_destination()

    def test_unsafe_tar_members_are_rejected(self):
        for name, link in (("../escape", False), ("/absolute", False), ("attachment-link", True)):
            with self.subTest(name=name):
                buf = io.BytesIO()
                with tarfile.open(fileobj=buf, mode="w:gz") as tar:
                    info = tarfile.TarInfo(name)
                    if link:
                        info.type = tarfile.SYMTYPE
                        info.linkname = str(self.clinical)
                    tar.addfile(info)
                with self.assertRaises(ValueError):
                    self.restore(buf.getvalue(), {"version": 1, "files": []}, {})

    def test_duplicate_tar_members_are_rejected(self):
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            tar.addfile(tarfile.TarInfo("duplicate.json"))
            tar.addfile(tarfile.TarInfo("duplicate.json"))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            self.restore(buf.getvalue(), {"version": 1, "files": []}, {})

    def test_hardlinks_and_special_tar_files_are_rejected(self):
        for kind in (tarfile.LNKTYPE, tarfile.FIFOTYPE, tarfile.CHRTYPE):
            with self.subTest(kind=kind):
                buf = io.BytesIO()
                with tarfile.open(fileobj=buf, mode="w:gz") as tar:
                    info = tarfile.TarInfo("unsafe")
                    info.type = kind
                    info.linkname = str(self.clinical)
                    tar.addfile(info)
                with self.assertRaisesRegex(ValueError, "unsafe"):
                    self.restore(buf.getvalue(), {"version": 1, "files": []}, {})

    def test_duplicate_vent_paths_are_rejected_and_cleaned(self):
        archive, manifest, rows = self.export()
        vent_entries = [entry for entry in manifest["files"] if entry["kind"] == "vent_import"]
        vent_entries[1]["path"] = vent_entries[0]["path"]
        with self.assertRaisesRegex(ValueError, "Duplicate ventilator"):
            self.restore(archive, manifest, rows)
        self.assert_no_destination()

    def test_unknown_owner_fails_and_cleans_prior_files(self):
        archive, manifest, rows = self.export()
        manifest["files"][2]["row_id"] = "999"
        with self.assertRaisesRegex(ValueError, "referenced row"):
            self.restore(archive, manifest, rows)
        self.assert_no_destination()

    def test_existing_vent_destination_is_never_overwritten(self):
        archive, manifest, rows = self.export()
        existing = self.put(self.data / "vent_imports" / self.new_vent / "upload.tar.gz", b"keep me")
        with self.assertRaisesRegex(ValueError, "already exists"):
            self.restore(archive, manifest, rows)
        self.assertEqual(existing.read_bytes(), b"keep me")
        self.assertFalse((self.photos / "patient/91").exists())

    def test_symlinked_destination_is_rejected_without_writing_through_it(self):
        archive, manifest, rows = self.export()
        outside = self.root / "outside"
        outside.mkdir()
        (self.docs / "42").symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symbolic"):
            self.restore(archive, manifest, rows)
        self.assertEqual(list(outside.iterdir()), [])
        self.assertFalse((self.photos / "patient/91").exists())


if __name__ == "__main__":
    unittest.main()
