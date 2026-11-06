from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from backend.app.config import settings

# SQLite connection configuration with thread safety for FastAPI
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    from backend.app import models  # noqa
    Base.metadata.create_all(bind=engine)
    
    # Safe migration for new columns in SQLite
    try:
        with engine.connect() as conn:
            conn.execute(models.Base.metadata.tables["videos"].columns.keys()) # check
    except Exception:
        pass

    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("ALTER TABLE videos ADD COLUMN smart_transcript_json TEXT DEFAULT '[]'"))
            conn.commit()
    except Exception:
        pass # column already exists

