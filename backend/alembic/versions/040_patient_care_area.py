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
"""Patient care area (room)

Revision ID: 040_patient_care_area
Revises: 039_ha_entity_mappings
Create Date: 2026-08-15

patients.care_area names the room the patient is cared for in, matching a
Home Assistant area / environmental-observation location. Used to default
room-scoped timeline overlays and to suggest the HA area for the patient's
device (MQTT discovery suggested_area).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '040_patient_care_area'
down_revision: Union[str, None] = '039_ha_entity_mappings'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('patients', sa.Column('care_area', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('patients', 'care_area')
