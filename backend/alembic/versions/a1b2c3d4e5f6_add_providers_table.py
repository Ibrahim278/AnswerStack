"""add providers table and active_provider_id to settings

Revision ID: a1b2c3d4e5f6
Revises: d8a3f2c91b45
Create Date: 2026-04-05 05:00:00.000000

"""
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'd8a3f2c91b45'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SETTINGS_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    """Create providers table and add active_provider_id to settings."""
    op.create_table(
        'providers',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('provider_url', sa.String(length=2048), nullable=False, server_default=''),
        sa.Column('provider_api_key', sa.String(length=512), nullable=False, server_default=''),
        sa.Column('provider_model', sa.String(length=255), nullable=False, server_default=''),
        sa.Column('embedding_model', sa.String(length=255), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_providers')),
        sa.UniqueConstraint('name', name=op.f('uq_providers_name')),
    )

    # SQLite requires batch mode for adding FK constraints
    with op.batch_alter_table('settings') as batch_op:
        batch_op.add_column(
            sa.Column('active_provider_id', sa.Uuid(), nullable=True),
        )
        batch_op.create_foreign_key(
            op.f('fk_settings_active_provider_id_providers'),
            'providers',
            ['active_provider_id'],
            ['id'],
            ondelete='SET NULL',
        )

    # Data migration: if settings has a provider configured, create a Default provider from it
    conn = op.get_bind()
    row = conn.execute(
        sa.text("SELECT provider_url, provider_api_key, provider_model, embedding_model FROM settings WHERE id = :id"),
        {"id": SETTINGS_ID},
    ).fetchone()

    if row and row[0] and row[0].strip():
        provider_id = str(uuid4())
        conn.execute(
            sa.text(
                "INSERT INTO providers (id, name, provider_url, provider_api_key, provider_model, embedding_model, created_at, updated_at) "
                "VALUES (:id, :name, :url, :key, :model, :embed, datetime('now'), datetime('now'))"
            ),
            {
                "id": provider_id,
                "name": "Default",
                "url": row[0],
                "key": row[1] or "",
                "model": row[2] or "",
                "embed": row[3] or "",
            },
        )
        conn.execute(
            sa.text("UPDATE settings SET active_provider_id = :pid WHERE id = :sid"),
            {"pid": provider_id, "sid": SETTINGS_ID},
        )


def downgrade() -> None:
    """Remove active_provider_id from settings and drop providers table."""
    with op.batch_alter_table('settings') as batch_op:
        batch_op.drop_constraint(op.f('fk_settings_active_provider_id_providers'), type_='foreignkey')
        batch_op.drop_column('active_provider_id')
    op.drop_table('providers')
