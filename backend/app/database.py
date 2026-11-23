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

    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("ALTER TABLE videos ADD COLUMN last_watched_at DATETIME"))
            conn.commit()
    except Exception:
        pass

    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("ALTER TABLE videos ADD COLUMN formulas_json TEXT DEFAULT '[]'"))
            conn.commit()
    except Exception:
        pass

    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("ALTER TABLE videos ADD COLUMN laws_and_principles_json TEXT DEFAULT '[]'"))
            conn.commit()
    except Exception:
        pass

    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("ALTER TABLE videos ADD COLUMN rapid_recall_json TEXT DEFAULT '{}'"))
            conn.commit()
    except Exception:
        pass

    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("ALTER TABLE videos ADD COLUMN user_id INTEGER DEFAULT 1"))
            conn.commit()
    except Exception:
        pass

    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("ALTER TABLE flashcards ADD COLUMN user_id INTEGER DEFAULT 1"))
            conn.commit()
    except Exception:
        pass

    # Ensure default user exists (id=1) for guest / zero-auth backward compatibility
    try:
        from backend.app.models import User
        with SessionLocal() as db:
            default_user = db.query(User).filter(User.id == 1).first()
            if not default_user:
                import bcrypt
                salt = bcrypt.gensalt(rounds=10)
                hashed = bcrypt.hashpw(b"guest123", salt).decode('utf-8')
                guest = User(
                    id=1,
                    email="guest@youtuberecall.local",
                    hashed_password=hashed,
                    full_name="Default Workspace",
                    is_active=True
                )
                db.add(guest)
                db.commit()

            # Ensure default AppSetting keys are initialized
            from backend.app.models import AppSetting
            gemini_setting = db.query(AppSetting).filter(AppSetting.key == "GEMINI_API_KEY").first()
            if not gemini_setting:
                db.add(AppSetting(key="GEMINI_API_KEY", value=settings.GEMINI_API_KEY))
                db.commit()

            prov_setting = db.query(AppSetting).filter(AppSetting.key == "DEFAULT_AI_PROVIDER").first()
            if not prov_setting:
                db.add(AppSetting(key="DEFAULT_AI_PROVIDER", value="gemini"))
                db.commit()
    except Exception:
        pass

