import os
import sys
from pathlib import Path
from typing import List
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent

# When running as a PyInstaller frozen executable, keep the database persistent next to the .exe
if getattr(sys, "frozen", False):
    EXE_DIR = Path(sys.executable).resolve().parent
    DEFAULT_DB_PATH = EXE_DIR / "recall.db"
    load_dotenv(EXE_DIR / ".env")
    load_dotenv(EXE_DIR.parent / ".env")
    load_dotenv(Path.cwd() / ".env")
else:
    DEFAULT_DB_PATH = BASE_DIR / "recall.db"

# Automatically load environment variables from .env
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env")

class AppConfig:
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH.as_posix()}")
    APP_ENV: str = os.getenv("APP_ENV", "development")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # Security & Authentication (Phase 1)
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "youtube-recall-secure-jwt-production-secret-key-2026")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080")) # 7 days
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "*")
    RATE_LIMIT_AUTH_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_AUTH_PER_MINUTE", "60"))
    RATE_LIMIT_INTAKE_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_INTAKE_PER_MINUTE", "30"))

    # AI Configuration (Free tiers supported)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    DEFAULT_AI_PROVIDER: str = os.getenv("DEFAULT_AI_PROVIDER", "gemini" if os.getenv("GEMINI_API_KEY") else "local_offline") # "gemini", "groq", "ollama", "local_offline"
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3")

    # YouTube / Google Account Linking
    YOUTUBE_ACCOUNT_EMAIL: str = os.getenv("YOUTUBE_ACCOUNT_EMAIL", "")
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/youtube/oauth-callback")

    # Spaced Repetition Schedule (Days from PDF specification: 0, 1, 3, 7, 15, 30, 60, 90, 180)
    SPACED_SCHEDULE_DAYS: List[int] = [0, 1, 3, 7, 15, 30, 60, 90, 180]

    # Intake Filters
    MIN_DURATION_SECONDS: int = int(os.getenv("MIN_DURATION_SECONDS", "180")) # 3 minutes
    WATCH_THRESHOLD_PERCENT: float = float(os.getenv("WATCH_THRESHOLD_PERCENT", "50.0"))
    FILTER_ENTERTAINMENT: bool = os.getenv("FILTER_ENTERTAINMENT", "true").lower() == "true"

    # Export integrations
    ANKI_CONNECT_URL: str = os.getenv("ANKI_CONNECT_URL", "http://localhost:8765")
    ANKI_DECK_NAME: str = os.getenv("ANKI_DECK_NAME", "YouTube Micro-Learning")
    OBSIDIAN_VAULT_PATH: str = os.getenv("OBSIDIAN_VAULT_PATH", "")
    NOTION_API_KEY: str = os.getenv("NOTION_API_KEY", "")
    NOTION_DATABASE_ID: str = os.getenv("NOTION_DATABASE_ID", "")

settings = AppConfig()
