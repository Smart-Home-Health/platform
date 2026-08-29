"""A face for each person, not just their initials

Revision ID: 050_avatar_seed_photo
Revises: 049_patient_vent_pins
Create Date: 2026-08-20

Three people in one household can share initials, and the initials disc was
the only thing telling them apart in the login picker, the patient dropdown
and the care profile. Each user and patient now carries a generated avatar
drawn from a seed, with an optional photo on top.

``avatar_seed`` is normally NULL: the frontend derives a stable seed from the
record kind and id, so nothing needs storing until an administrator decides
two generated avatars look too alike and shuffles one. Then it holds a random
UUID that overrides the derived seed.

``avatar_photo`` is the uuid-named file under PHOTOS_DIR (see
``avatar_store.py``); the name changes with every upload so the browser can
cache the image forever.
"""
from alembic import op
import sqlalchemy as sa

revision = '050_avatar_seed_photo'
down_revision = '049_patient_vent_pins'
branch_labels = None
depends_on = None


def upgrade():
    for table in ('users', 'patients'):
        op.add_column(table, sa.Column('avatar_seed', sa.String(length=36), nullable=True))
        op.add_column(table, sa.Column('avatar_photo', sa.String(length=64), nullable=True))


def downgrade():
    for table in ('patients', 'users'):
        op.drop_column(table, 'avatar_photo')
        op.drop_column(table, 'avatar_seed')
