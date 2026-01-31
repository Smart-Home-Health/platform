"""Add business_type_assignments table for many-to-many business types

Revision ID: 20260130_business_types
Revises: 
Create Date: 2026-01-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260130_business_types'
down_revision: Union[str, None] = 'd8e5f2a1b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create business_type_assignments junction table
    op.create_table(
        'business_type_assignments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('type_name', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create index for faster lookups by type
    op.create_index(
        'ix_business_type_assignments_type_name',
        'business_type_assignments',
        ['type_name']
    )
    
    # Create unique constraint to prevent duplicate type assignments
    op.create_index(
        'ix_business_type_assignments_unique',
        'business_type_assignments',
        ['business_id', 'type_name'],
        unique=True
    )
    
    # Make business_type nullable (it's now a legacy field)
    op.alter_column('businesses', 'business_type',
                    existing_type=sa.String(),
                    nullable=True)
    
    # Migrate existing data: copy business_type to business_type_assignments
    op.execute("""
        INSERT INTO business_type_assignments (business_id, type_name)
        SELECT id, LOWER(TRIM(business_type))
        FROM businesses
        WHERE business_type IS NOT NULL AND TRIM(business_type) != ''
    """)


def downgrade() -> None:
    # Drop the junction table
    op.drop_index('ix_business_type_assignments_unique', table_name='business_type_assignments')
    op.drop_index('ix_business_type_assignments_type_name', table_name='business_type_assignments')
    op.drop_table('business_type_assignments')
    
    # Make business_type not nullable again
    op.alter_column('businesses', 'business_type',
                    existing_type=sa.String(),
                    nullable=False)
