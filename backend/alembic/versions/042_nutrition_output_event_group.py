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
"""Nutrition outputs: event grouping, explicit location, Bristol scale

Revision ID: 042_nutrition_output_event_group
Revises: 041_vitals_capture
Create Date: 2026-08-18

One physical bathroom event (a mixed diaper, say) is stored as one row per
output_type. Nothing recorded that association, so four separate call sites
re-guessed it from a 3-minute time window using four different rules that
disagreed with each other. event_group_id records it instead.

The backfill reproduces the most generous of those existing rules -- same
patient, is_diaper, within 3 minutes -- so today's merged rows stay merged.
Rows that never grouped get their own uuid. The column is nullable and
best-effort: a null group id simply means "this row is its own event".

location becomes a real column instead of being inferred from the
is_diaper / is_catheter / is_accident booleans (all-false meant restroom).
The booleans stay and stay in sync -- crud/scheduling.py, the monitoring
timeline and MQTT consumers still read them.

bristol_scale is added alongside consistency rather than replacing it:
routes/monitoring.py projects consistency straight into the timeline. The
two are kept consistent by deriving one from the other on write.

account_id is added for symmetry with nutrition_intake / nutrition_goal,
which was the only reason outputs could not be scoped the same way.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '042_nutrition_output_event_group'
down_revision: Union[str, None] = '041_vitals_capture'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('nutrition_outputs', sa.Column('event_group_id', sa.String(36), nullable=True))
    op.add_column('nutrition_outputs', sa.Column('location', sa.String(20), nullable=True))
    op.add_column('nutrition_outputs', sa.Column('bristol_scale', sa.SmallInteger(), nullable=True))
    op.add_column('nutrition_outputs', sa.Column('account_id', sa.Integer(), nullable=True))

    op.create_index('ix_nutrition_outputs_event_group_id', 'nutrition_outputs', ['event_group_id'])
    op.create_index('ix_nutrition_outputs_account_id', 'nutrition_outputs', ['account_id'])
    op.create_foreign_key(
        'fk_nutrition_outputs_account_id', 'nutrition_outputs', 'accounts',
        ['account_id'], ['id'], ondelete='CASCADE',
    )

    # --- location, from the legacy booleans -------------------------------
    # Priority matches the frontend's inferLocation(): catheter, diaper,
    # accident, else restroom.
    op.execute("""
        UPDATE nutrition_outputs SET location = CASE
            WHEN is_catheter THEN 'catheter'
            WHEN is_diaper   THEN 'diaper'
            WHEN is_accident THEN 'accident'
            ELSE 'restroom'
        END
    """)

    # --- bristol_scale, from the legacy consistency vocabulary ------------
    # 'diarrhea' has no distinct Bristol number and folds into 7.
    op.execute("""
        UPDATE nutrition_outputs SET bristol_scale = CASE consistency
            WHEN 'pellets'     THEN 1
            WHEN 'constipated' THEN 2
            WHEN 'solid'       THEN 4
            WHEN 'soft'        THEN 5
            WHEN 'loose'       THEN 6
            WHEN 'watery'      THEN 7
            WHEN 'diarrhea'    THEN 7
            ELSE NULL
        END
        WHERE consistency IS NOT NULL
    """)

    # --- account_id, denormalized from the owning patient -----------------
    op.execute("""
        UPDATE nutrition_outputs o
           SET account_id = p.account_id
        FROM patients p
        WHERE p.id = o.patient_id AND p.account_id IS NOT NULL
    """)

    # --- event_group_id ----------------------------------------------------
    # Cluster diaper rows for the same patient that land within 3 minutes of
    # each other, mirroring the widest existing merge rule. A new group starts
    # whenever the gap from the previous row exceeds the window.
    op.execute("""
        WITH ordered AS (
            SELECT id, patient_id, occurred_at,
                   LAG(occurred_at) OVER (PARTITION BY patient_id ORDER BY occurred_at, id) AS prev_at
            FROM nutrition_outputs
            WHERE is_diaper AND event_group_id IS NULL
        ),
        marked AS (
            SELECT id, patient_id,
                   SUM(CASE
                         WHEN prev_at IS NOT NULL
                          AND occurred_at - prev_at <= INTERVAL '3 minutes'
                         THEN 0 ELSE 1
                       END) OVER (PARTITION BY patient_id ORDER BY occurred_at, id
                                  ROWS UNBOUNDED PRECEDING) AS grp
            FROM ordered
        )
        UPDATE nutrition_outputs o
           SET event_group_id = md5('diaper-' || CAST(m.patient_id AS text) || '-' || CAST(m.grp AS text))
          FROM marked m
         WHERE o.id = m.id
    """)

    # Everything not covered above is its own single-row event.
    op.execute("""
        UPDATE nutrition_outputs
           SET event_group_id = md5('single-' || CAST(id AS text))
         WHERE event_group_id IS NULL
    """)


def downgrade() -> None:
    op.drop_constraint('fk_nutrition_outputs_account_id', 'nutrition_outputs', type_='foreignkey')
    op.drop_index('ix_nutrition_outputs_account_id', table_name='nutrition_outputs')
    op.drop_index('ix_nutrition_outputs_event_group_id', table_name='nutrition_outputs')
    op.drop_column('nutrition_outputs', 'account_id')
    op.drop_column('nutrition_outputs', 'bristol_scale')
    op.drop_column('nutrition_outputs', 'location')
    op.drop_column('nutrition_outputs', 'event_group_id')
