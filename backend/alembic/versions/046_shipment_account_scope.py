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
"""Backfill dme_shipments.account_id so shipments can be scoped to an account

Revision ID: 046_shipment_account_scope
Revises: 045_nutrition_intake_tube_feed
Create Date: 2026-08-19

The column has existed since the accounts work, but nothing ever wrote it:
create_shipment took no account_id, so every row in every install carries
NULL. Now that the queries filter on it, the existing rows have to be given
the account they always belonged to, or they would vanish from the UI.

A shipment's account is not ambiguous -- patient_id is NOT NULL and a patient
carries the account -- so the backfill reads it from there rather than
guessing. Documents denormalize the same value and are corrected from their
shipment for the same reason.

Rows whose patient has no account (a single-tenant install, where the whole
accounts column is NULL) stay NULL, which is what the query layer expects:
a request with no account applies no filter.
"""
from typing import Sequence, Union
from alembic import op


revision: str = '046_shipment_account_scope'
down_revision: Union[str, None] = '045_nutrition_intake_tube_feed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Take the account from the patient the shipment is for.
    op.execute("""
        UPDATE dme_shipments AS s
           SET account_id = p.account_id
          FROM patients AS p
         WHERE p.id = s.patient_id
           AND s.account_id IS NULL
           AND p.account_id IS NOT NULL
    """)

    # Documents copy the shipment's account at upload time, so any attached to
    # a shipment created before this migration carry the same NULL.
    op.execute("""
        UPDATE dme_shipment_documents AS d
           SET account_id = s.account_id
          FROM dme_shipments AS s
         WHERE s.id = d.shipment_id
           AND d.account_id IS NULL
           AND s.account_id IS NOT NULL
    """)

    # No index is created here: ix_dme_shipments_account_id already exists
    # from 001_initial_schema, which indexed the column the module then never
    # populated.


def downgrade() -> None:
    # Data-only migration. The backfilled values are deliberately left in
    # place: they are the correct account for each row, and clearing them
    # would re-open the gap this migration exists to close.
    pass
