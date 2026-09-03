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
"""Nutrition intake: tube feed, event grouping, item_type normalization

Revision ID: 045_nutrition_intake_tube_feed
Revises: 044_nutrition_presets
Create Date: 2026-08-18

The logging form has offered a "Tube Feed" type for a while, but the API
pattern only permitted food|liquid|supplement, so choosing it returned 422 and
the entry was lost. This makes tube_feed real and adds the delivery detail it
needs (route, rate, duration). The accompanying water flush is deliberately
NOT a column here -- it is its own intake row sharing the event_group_id, so
fluid totals stay correct without special-casing.

item_type also needs normalizing before any tightened validation can land:
routes/schedule.py assigned schedule_type straight into item_type, bypassing
Pydantic, so the column accumulated schedule vocabulary ('meal', 'hydration',
'snack', and the care-activity types). This maps those onto the real intake
types. Rows written from a care activity that produces no food or fluid
(diaper_check, bathroom_assist, catheter_care) are left alone rather than
silently relabelled as food -- they are reported instead, since deleting
patient records is not this migration's call to make.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '045_nutrition_intake_tube_feed'
down_revision: Union[str, None] = '044_nutrition_presets'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('nutrition_intake', sa.Column('event_group_id', sa.String(36), nullable=True))
    op.add_column('nutrition_intake', sa.Column('item_id', sa.Integer(), nullable=True))
    op.add_column('nutrition_intake', sa.Column('feed_route', sa.String(20), nullable=True))
    op.add_column('nutrition_intake', sa.Column('rate_ml_per_hr', sa.Float(), nullable=True))
    op.add_column('nutrition_intake', sa.Column('duration_minutes', sa.Float(), nullable=True))

    op.create_index('ix_nutrition_intake_event_group_id', 'nutrition_intake', ['event_group_id'])
    op.create_foreign_key(
        'fk_nutrition_intake_item_id', 'nutrition_intake', 'nutrition_items',
        ['item_id'], ['id'], ondelete='SET NULL',
    )

    # --- normalize item_type ----------------------------------------------
    # Mirrors nutrition_vocab.SCHEDULE_TYPE_TO_ITEM_TYPE. 'snack' becomes food
    # and also implies a meal context, which we set where none was recorded.
    op.execute("""
        UPDATE nutrition_intake
           SET meal_type = 'snack'
         WHERE item_type = 'snack' AND meal_type IS NULL
    """)
    op.execute("""
        UPDATE nutrition_intake SET item_type = CASE item_type
            WHEN 'meal'      THEN 'food'
            WHEN 'snack'     THEN 'food'
            WHEN 'hydration' THEN 'liquid'
            ELSE item_type
        END
        WHERE item_type IN ('meal', 'snack', 'hydration')
    """)

    # Every existing row is its own logging event.
    op.execute("""
        UPDATE nutrition_intake
           SET event_group_id = md5('single-' || CAST(id AS text))
         WHERE event_group_id IS NULL
    """)


def downgrade() -> None:
    op.drop_constraint('fk_nutrition_intake_item_id', 'nutrition_intake', type_='foreignkey')
    op.drop_index('ix_nutrition_intake_event_group_id', table_name='nutrition_intake')
    op.drop_column('nutrition_intake', 'duration_minutes')
    op.drop_column('nutrition_intake', 'rate_ml_per_hr')
    op.drop_column('nutrition_intake', 'feed_route')
    op.drop_column('nutrition_intake', 'item_id')
    op.drop_column('nutrition_intake', 'event_group_id')
