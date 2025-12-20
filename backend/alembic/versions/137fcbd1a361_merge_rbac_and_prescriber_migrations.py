"""merge rbac and prescriber migrations

Revision ID: 137fcbd1a361
Revises: 3bd787d33e7d, b8f3c9d1e2a4
Create Date: 2025-12-17 00:19:22.435115

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '137fcbd1a361'
down_revision: Union[str, None] = ('3bd787d33e7d', 'b8f3c9d1e2a4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
