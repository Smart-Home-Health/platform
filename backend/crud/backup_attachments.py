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
"""Patient-backup blobs, with confined paths and rollback-safe restore writes.

The caller owns the SQL transaction. Use AttachmentRestore as a context manager
and call commit() only AFTER the database commit succeeds. Archive paths never
become destination paths; destinations are allocated under the configured stores.
"""
from __future__ import annotations

import hashlib
import io
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tarfile
import tempfile
import uuid

import avatar_store
import document_store


_CHUNK = 1024 * 1024
_KINDS = {"patient_avatar", "clinical_document", "shipment_document", "vent_import"}
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_MEMBER = re.compile(r"^attachments/[0-9]{8}$")


def _vent_root() -> Path:
    return Path(os.getenv("INTEGRATIONS_DATA_DIR", "/app/data")) / "vent_imports"


def _relative(value: str) -> PurePosixPath:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise ValueError("Invalid attachment relative path")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ("", ".", "..") for part in value.split("/")):
        raise ValueError("Unsafe attachment relative path")
    return path


def _no_symlinks(path: Path) -> None:
    for part in (path, *path.parents):
        if part.is_symlink():
            raise ValueError("Attachment paths must not contain symbolic links")


def _confined(path: Path, root: Path) -> Path:
    path, root = path.absolute(), root.absolute()
    if ".." in path.parts or ".." in root.parts:
        raise ValueError("Unsafe attachment storage path")
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ValueError("Attachment is outside its allowed storage root") from exc
    _no_symlinks(path)
    return path


def _source(path: Path, root: Path):
    path = _confined(path, root)
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError as exc:
        raise ValueError("Referenced attachment is missing or unreadable") from exc
    if not stat.S_ISREG(os.fstat(fd).st_mode):
        os.close(fd)
        raise ValueError("Attachment is not a regular file")
    return os.fdopen(fd, "rb")


def export_attachments(tar, contents, patient_id, account_id):
    """Append blobs and return a JSON manifest; remove inline bytes from rows.

contents contains the patient, clinical_documents, dme_shipment_documents and
vent_imports JSON row lists. Every referenced blob must exist: a successful
export must never silently omit a missing file.
"""
    files = []

    def add(stream, kind, row_id, path="", primary=False):
        # Spooling bounds memory and ensures the hash describes the exact bytes
        # added even if a source file is concurrently replaced.
        with tempfile.SpooledTemporaryFile(max_size=_CHUNK) as payload:
            digest, size = hashlib.sha256(), 0
            while chunk := stream.read(_CHUNK):
                payload.write(chunk)
                digest.update(chunk)
                size += len(chunk)
            member = f"attachments/{len(files):08d}"
            info = tarfile.TarInfo(member)
            info.size = size
            info.mode = 0o600
            payload.seek(0)
            tar.addfile(info, payload)
        files.append(dict(member=member, kind=kind, row_id=str(row_id),
                          path=path, primary=primary, size=size, sha256=digest.hexdigest()))

    for patient in contents.get("patient.json", []):
        filename = patient.get("avatar_photo")
        if filename:
            if not avatar_store.FILENAME_RE.fullmatch(filename):
                raise ValueError("Invalid backed-up avatar filename")
            source = Path(avatar_store.avatar_path("patient", patient_id, filename))
            with _source(source, Path(avatar_store.PHOTOS_DIR) / "patient" / str(patient_id)) as stream:
                add(stream, "patient_avatar", patient["id"])

    doc_root = Path(document_store.EPIC_DOCS_DIR)
    for member, kind in (("clinical_documents.json", "clinical_document"),
                         ("dme_shipment_documents.json", "shipment_document")):
        for row in contents.get(member, []):
            storage = row.get("storage", "file")
            if storage == "db" and kind == "clinical_document":
                blob = row.get("data")
                if not isinstance(blob, (bytes, bytearray, memoryview)):
                    raise ValueError("Referenced inline clinical document is missing")
                add(io.BytesIO(bytes(blob)), kind, row["id"])
                row["data"] = None
            elif storage == "file":
                if not row.get("file_path"):
                    raise ValueError("Referenced document has no stored file")
                # Some older clinical rows have no account_id, and their store
                # namespace is consequently 0. Never accept another patient's.
                root = doc_root / str(row.get("account_id") or "0") / str(patient_id)
                if row.get("account_id") not in (None, account_id):
                    raise ValueError("Attachment belongs to another account")
                with _source(Path(row["file_path"]), root) as stream:
                    add(stream, kind, row["id"])
            else:
                raise ValueError("Unsupported document storage type")

    for row in contents.get("vent_imports.json", []):
        import_id = str(row["id"])
        if "/" in import_id or "\\" in import_id or import_id in ("", ".", ".."):
            raise ValueError("Invalid ventilator import ID")
        root = _vent_root() / import_id
        main = _confined(Path(row.get("storage_path") or ""), root)
        # Check the original upload even if the directory has extracted files.
        with _source(main, root):
            pass
        start = len(files)

        def walk_error(error):
            raise ValueError("Ventilator attachment directory is unreadable") from error

        for directory, dirs, names in os.walk(root, followlinks=False, onerror=walk_error):
            for name in dirs:
                _no_symlinks(Path(directory) / name)
            for name in sorted(names):
                source = Path(directory) / name
                relative = source.relative_to(root).as_posix()
                _relative(relative)
                with _source(source, root) as stream:
                    add(stream, "vent_import", import_id, relative, source.absolute() == main)
        if sum(entry["primary"] for entry in files[start:]) != 1:
            raise ValueError("Referenced ventilator upload disappeared during backup")

    return {"version": 1, "files": files}


class AttachmentRestore:
    """Own newly written files until the caller confirms its database commit."""

    def __init__(self, archive_bytes, manifest):
        self._archive = archive_bytes
        self._manifest = manifest
        self._files = []
        self._dirs = []
        self._committed = False
        self.warnings = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        if not self._committed:
            for path in reversed(self._files):
                path.unlink(missing_ok=True)
            for path in reversed(self._dirs):
                try:
                    path.rmdir()
                except OSError:
                    pass  # Never remove pre-existing files or unrelated content.

    def commit(self):
        self._committed = True

    def _mkdir(self, directory):
        _no_symlinks(directory)
        if not directory.exists():
            self._mkdir(directory.parent)
            directory.mkdir(mode=0o700)
            self._dirs.append(directory)
        elif not directory.is_dir():
            raise ValueError("Attachment destination is not a directory")

    def _write(self, tar, entry, target=None):
        stream = tar.extractfile(entry["member"])
        if stream is None:
            raise ValueError("Attachment payload is missing")
        if target is None:
            output = io.BytesIO()
        else:
            self._mkdir(target.parent)
            _no_symlinks(target)
            output = target.open("xb")  # Never overwrite an existing file.
            self._files.append(target)
        try:
            digest, size = hashlib.sha256(), 0
            with stream:
                while chunk := stream.read(_CHUNK):
                    output.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
            if size != entry["size"] or digest.hexdigest() != entry["sha256"]:
                raise ValueError("Attachment checksum or size mismatch")
            return output.getvalue() if target is None else str(target)
        finally:
            output.close()

    def restore(self, contents, new_patient_id, account_id, vent_import_id_map):
        if self._manifest is None:
            self.warnings.append("Legacy backup contains no attachment payloads; patient photos, "
                                 "documents and original ventilator uploads cannot be recovered.")
            for row in contents.get("patient.json", []):
                row["avatar_photo"] = None
            for name in ("clinical_documents.json", "dme_shipment_documents.json"):
                for row in contents.get(name, []):
                    row["file_path"] = None
            for row in contents.get("vent_imports.json", []):
                row["storage_path"] = ""
            return
        manifest = self._manifest
        if not isinstance(manifest, dict) or manifest.get("version") != 1 or not isinstance(manifest.get("files"), list):
            raise ValueError("Unsupported attachment manifest")
        with tarfile.open(fileobj=io.BytesIO(self._archive), mode="r:gz") as tar:
            members = {}
            for member in tar.getmembers():
                _relative(member.name)
                if not member.isfile() or member.name in members:
                    raise ValueError("Archive contains unsafe or duplicate members")
                members[member.name] = member
            groups, declared = {}, set()
            for entry in manifest["files"]:
                if not isinstance(entry, dict):
                    raise ValueError("Invalid attachment manifest entry")
                name, kind = entry.get("member"), entry.get("kind")
                if not isinstance(name, str) or not _MEMBER.fullmatch(name) or kind not in _KINDS:
                    raise ValueError("Invalid attachment member or kind")
                size, checksum = entry.get("size"), entry.get("sha256")
                if type(size) is not int or size < 0 or not isinstance(checksum, str) or not _SHA256.fullmatch(checksum):
                    raise ValueError("Invalid attachment size or checksum")
                if name in declared or name not in members or members[name].size != size:
                    raise ValueError("Missing, duplicate or incorrectly sized attachment")
                if not isinstance(entry.get("row_id"), str):
                    raise ValueError("Invalid attachment owner")
                if kind == "vent_import":
                    _relative(entry.get("path"))
                    if type(entry.get("primary")) is not bool:
                        raise ValueError("Invalid ventilator attachment metadata")
                elif entry.get("path") != "":
                    raise ValueError("Unexpected document attachment path")
                declared.add(name)
                groups.setdefault((kind, entry["row_id"]), []).append(entry)
            if {name for name in members if name.startswith("attachments/")} != declared:
                raise ValueError("Archive contains undeclared attachment payloads")

            def take(kind, row, single=True):
                entries = groups.pop((kind, str(row["id"])), [])
                if not entries or (single and len(entries) != 1):
                    raise ValueError("Missing or duplicate attachment for referenced row")
                return entries[0] if single else entries

            for row in contents.get("patient.json", []):
                filename = row.get("avatar_photo")
                if filename:
                    if not avatar_store.FILENAME_RE.fullmatch(filename):
                        raise ValueError("Invalid backed-up avatar filename")
                    new_name = uuid.uuid4().hex + Path(filename).suffix
                    root = Path(avatar_store.PHOTOS_DIR) / "patient" / str(int(new_patient_id))
                    self._write(tar, take("patient_avatar", row), _confined(root / new_name, root))
                    row["avatar_photo"] = new_name
            for name, kind in (("clinical_documents.json", "clinical_document"),
                               ("dme_shipment_documents.json", "shipment_document")):
                for row in contents.get(name, []):
                    entry = take(kind, row)
                    if row.get("storage", "file") == "db" and kind == "clinical_document":
                        row["data"] = self._write(tar, entry)
                        row["file_path"] = None
                    elif row.get("storage", "file") == "file":
                        root = Path(document_store.EPIC_DOCS_DIR) / str(int(account_id)) / str(int(new_patient_id))
                        filename = uuid.uuid4().hex + document_store._ext_for(row.get("content_type"))
                        row["file_path"] = self._write(tar, entry, _confined(root / filename, root))
                        if "data" in row:
                            row["data"] = None
                    else:
                        raise ValueError("Unsupported document storage type")
                    row["size_bytes"] = entry["size"]
            for row in contents.get("vent_imports.json", []):
                entries = take("vent_import", row, single=False)
                if sum(entry["primary"] for entry in entries) != 1:
                    raise ValueError("Ventilator upload must have exactly one primary file")
                mapped = str(vent_import_id_map.get(row["id"], ""))
                try:
                    uuid.UUID(mapped)
                except ValueError as exc:
                    raise ValueError("Missing remapped ventilator import UUID") from exc
                root = _vent_root() / mapped
                if root.exists() or root.is_symlink():
                    raise ValueError("Ventilator attachment destination already exists")
                paths = set()
                for entry in entries:
                    relative = _relative(entry["path"])
                    if relative in paths:
                        raise ValueError("Duplicate ventilator attachment path")
                    paths.add(relative)
                    target = _confined(root / relative, root)
                    result = self._write(tar, entry, target)
                    if entry["primary"]:
                        row["storage_path"] = result
            if groups:
                raise ValueError("Attachment manifest references unknown rows")
