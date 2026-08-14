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
"""Patient <- HA user provenance

Revision ID: 038_patient_ha_identity
Revises: 037_ha_identity
Create Date: 2026-08-14

patients.ha_user_id records which Home Assistant login a patient record was
created from, so the HA user directory can offer "Add as patient" at most
once per HA login (and show which patient it produced). Unique — one patient
per HA user.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '038_patient_ha_identity'
down_revision: Union[str, None] = '037_ha_identity'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('patients', sa.Column('ha_user_id', sa.String(length=32), nullable=True))
    op.create_index('ix_patients_ha_user_id', 'patients', ['ha_user_id'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_patients_ha_user_id', table_name='patients')
    op.drop_column('patients', 'ha_user_id')
