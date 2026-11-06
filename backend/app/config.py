import os
from pathlib import Path
from typing import List
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent

# Automatically load environment variables from .env
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env")

class AppConfig:
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR}/recall.db")
    APP_ENV: str = os.getenv("APP_ENV", "development")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # AI Configuration (Free tiers supported)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    DEFAULT_AI_PROVIDER: str = os.getenv("DEFAULT_AI_PROVIDER", "gemini" if os.getenv("GEMINI_API_KEY") else "local_offline") # "gemini", "groq", "ollama", "local_offline"
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3")

    # YouTube / Google Account Linking
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
