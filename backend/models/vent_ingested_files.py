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
Per-integration ledger of ventilator batch files already ingested.

Vent exports are rolling windows: consecutive tarballs share most of their
batch_NNNNNN.csv files byte-for-byte, and the newest file grows append-only
between exports. The ledger lets the parser skip identical files entirely and
ingest only the appended tail of a grown file, so re-uploading overlapping
exports doesn't duplicate samples.

`import_id` records the import that first ingested the file (most of its
rows); deleting that import cascades the ledger row away, so a later upload
re-ingests the file from scratch.
"""
from sqlalchemy import Column, Integer, String, ForeignKey, TIMESTAMP, UniqueConstraint

from db import Base


class VentIngestedFile(Base):
    __tablename__ = 'vent_ingested_files'
    __table_args__ = (
        UniqueConstraint('integration_id', 'file_name', name='uq_vent_ingested_file'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    integration_id = Column(Integer, ForeignKey('patient_integrations.id', ondelete='CASCADE'), nullable=False, index=True)
    import_id = Column(String(36), ForeignKey('vent_imports.id', ondelete='CASCADE'), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    sha256 = Column(String(64), nullable=False)
    # CSV rows consumed (including the header row): on a grown file we skip
    # this many rows and ingest only the appended tail.
    line_count = Column(Integer, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
