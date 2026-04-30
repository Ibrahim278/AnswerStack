"""add tts_provider and tts_voice_id to settings

Revision ID: c7e2a1b34f90
Revises: f48c151aa58e
Create Date: 2026-03-31 07:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7e2a1b34f90'
down_revision: Union[str, Sequence[str], None] = 'f48c151aa58e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add tts_provider and tts_voice_id columns to settings table."""
    op.add_column(
        'settings',
        sa.Column('tts_provider', sa.String(length=50), nullable=False, server_default=''),
    )
    op.add_column(
        'settings',
        sa.Column('tts_voice_id', sa.String(length=255), nullable=False, server_default=''),
    )


def downgrade() -> None:
    """Remove tts_provider and tts_voice_id columns from settings table."""
    op.drop_column('settings', 'tts_voice_id')
    op.drop_column('settings', 'tts_provider')
