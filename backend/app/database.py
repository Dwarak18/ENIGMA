"""Database connection and session management."""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base
from app.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Session:
    """Dependency for obtaining database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)

    # Keep older volumes compatible with the current ORM model.
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE entropy_records ADD COLUMN IF NOT EXISTS integrity_hash VARCHAR(64)"))
        conn.execute(text("ALTER TABLE entropy_records ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64)"))
