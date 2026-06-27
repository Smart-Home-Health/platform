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
"""One-off backfill of the vent_ingested_files ledger from already-parsed
imports' stored tarballs (run from /app inside the backend container):

    python scripts/backfill_vent_ledger.py

Walks completed vent imports oldest-first; for each batch_*.csv records
(name, sha256, csv row count) keyed by integration, updating in place when a
later import carried a grown version of the same file — mirroring what the
parser now does at ingest time. Raw SQL (no ORM) per scripts convention.
"""
import csv
import hashlib
import io
import os
import sys
import tarfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from db import SessionLocal  # noqa: E402


def main() -> None:
    db = SessionLocal()
    imports = db.execute(text("""
        SELECT id, integration_id, storage_path, uploaded_at
        FROM vent_imports WHERE status = 'completed'
        ORDER BY uploaded_at ASC
    """)).all()
    for vi in imports:
        if not os.path.exists(vi.storage_path):
            print(f"{vi.id}: tarball missing at {vi.storage_path}, skipping")
            continue
        added = updated = unchanged = 0
        with tarfile.open(vi.storage_path) as tf:
            for member in tf.getmembers():
                name = os.path.basename(member.name)
                if not (name.startswith("batch_") and name.endswith(".csv")):
                    continue
                raw = tf.extractfile(member).read()
                sha = hashlib.sha256(raw).hexdigest()
                rows = sum(1 for _ in csv.reader(io.StringIO(raw.decode("utf-8", "replace"))))
                existing = db.execute(text("""
                    SELECT id, sha256 FROM vent_ingested_files
                    WHERE integration_id = :iid AND file_name = :name
                """), {"iid": vi.integration_id, "name": name}).first()
                if existing is None:
                    db.execute(text("""
                        INSERT INTO vent_ingested_files
                            (integration_id, import_id, file_name, sha256, line_count, created_at, updated_at)
                        VALUES (:iid, :imp, :name, :sha, :rows, now(), now())
                    """), {"iid": vi.integration_id, "imp": vi.id, "name": name, "sha": sha, "rows": rows})
                    added += 1
                elif existing.sha256 != sha:
                    db.execute(text("""
                        UPDATE vent_ingested_files
                        SET sha256 = :sha, line_count = :rows, updated_at = now()
                        WHERE id = :id
                    """), {"sha": sha, "rows": rows, "id": existing.id})
                    updated += 1
                else:
                    unchanged += 1
        db.commit()
        print(f"{vi.id} ({vi.uploaded_at:%Y-%m-%d}): {added} added, {updated} updated (grown), {unchanged} unchanged")
    db.close()


if __name__ == "__main__":
    main()
