import os

from sqlalchemy import text

from app.core.database import create_engine, create_session_factory


async def test_wal_mode():
    """INFR-01: SQLite configured with WAL mode."""
    engine = create_engine("sqlite+aiosqlite:///test_wal.db")
    session_factory = create_session_factory(engine)

    async with session_factory() as session:
        result = await session.execute(text("PRAGMA journal_mode"))
        journal_mode = result.scalar()
        assert journal_mode == "wal", f"Expected WAL mode, got {journal_mode}"

    await engine.dispose()

    # Cleanup test database
    for f in ["test_wal.db", "test_wal.db-wal", "test_wal.db-shm"]:
        if os.path.exists(f):
            os.remove(f)


async def test_foreign_keys_enabled():
    """INFR-01: SQLite has foreign keys enabled."""
    engine = create_engine("sqlite+aiosqlite:///test_fk.db")
    session_factory = create_session_factory(engine)

    async with session_factory() as session:
        result = await session.execute(text("PRAGMA foreign_keys"))
        fk_enabled = result.scalar()
        assert fk_enabled == 1, f"Expected foreign_keys=1, got {fk_enabled}"

    await engine.dispose()

    for f in ["test_fk.db", "test_fk.db-wal", "test_fk.db-shm"]:
        if os.path.exists(f):
            os.remove(f)


async def test_session_factory_creates_sessions():
    """INFR-01: Session factory produces working async sessions."""
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    session_factory = create_session_factory(engine)

    async with session_factory() as session:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar() == 1

    await engine.dispose()
