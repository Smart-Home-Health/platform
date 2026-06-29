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
"""
Blob storage for clinical documents (report PDFs, scanned results).

Blobs are written to the host-visible ``./data`` volume (mounted at ``/app/data``)
rather than into Postgres, to keep the DB and its backups lean — important given
the high-volume vent/pulse-ox streams already in the DB. Only metadata + a
``file_path`` is stored in ``clinical_documents``.

Layout: ``{EPIC_DOCS_DIR}/{account_id}/{patient_id}/{uuid}{ext}``
"""
import os
import uuid
from typing import Optional, Tuple

# Lives under the existing ./data bind mount (see docker-compose.yml backend volumes).
EPIC_DOCS_DIR = os.getenv("EPIC_DOCS_DIR", "/app/data/epic_docs")

# Minimal content-type -> extension map for the document types we ingest.
_EXT_BY_CONTENT_TYPE = {
    "application/pdf": ".pdf",
    "text/html": ".html",
    "text/plain": ".txt",
    "text/xml": ".xml",
    "application/xml": ".xml",
    "image/jpeg": ".jpg",
    "image/png": ".png",
}


def _ext_for(content_type: Optional[str]) -> str:
    if not content_type:
        return ".bin"
    return _EXT_BY_CONTENT_TYPE.get(content_type.split(";")[0].strip().lower(), ".bin")


def save_document(
    account_id: Optional[int],
    patient_id: int,
    content: bytes,
    content_type: Optional[str] = None,
) -> Tuple[str, int]:
    """Write blob bytes to the data volume.

    Returns ``(file_path, size_bytes)`` where ``file_path`` is the absolute path
    inside the container (also browsable on the host under ``./data``).
    """
    sub_dir = os.path.join(EPIC_DOCS_DIR, str(account_id or "0"), str(patient_id))
    os.makedirs(sub_dir, exist_ok=True)
    file_path = os.path.join(sub_dir, f"{uuid.uuid4().hex}{_ext_for(content_type)}")
    with open(file_path, "wb") as fh:
        fh.write(content)
    return file_path, len(content)


def delete_document(file_path: Optional[str]) -> None:
    """Remove a stored blob. Safe to call for missing/None paths."""
    if not file_path:
        return
    try:
        os.remove(file_path)
    except FileNotFoundError:
        pass
