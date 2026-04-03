"""add reasoning_effort and max_completion_tokens to settings

Revision ID: d8a3f2c91b45
Revises: c7e2a1b34f90
Create Date: 2026-04-03 02:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8a3f2c91b45'
down_revision: Union[str, Sequence[str], None] = 'c7e2a1b34f90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add reasoning_effort and max_completion_tokens columns to settings table."""
    op.add_column(
        'settings',
        sa.Column('reasoning_effort', sa.String(length=20), nullable=False, server_default=''),
    )
    op.add_column(
        'settings',
        sa.Column('max_completion_tokens', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    """Remove reasoning_effort and max_completion_tokens columns from settings table."""
    op.drop_column('settings', 'max_completion_tokens')
    op.drop_column('settings', 'reasoning_effort')
