import os
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import AppSetting
from backend.app.schemas import SettingsUpdate
from backend.app.config import settings
from backend.app.services.ai_service import AIService

router = APIRouter(prefix="/api/settings", tags=["Settings & Integrations"])

@router.get("")
def get_current_settings(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Returns runtime settings with sensitive tokens partially masked."""
    db_settings = {s.key: s.value for s in db.query(AppSetting).all()}

    def get_val(key: str, default: str) -> str:
        return db_settings.get(key, default)

    gemini_key = AIService.get_gemini_key()
    groq_key = get_val("GROQ_API_KEY", settings.GROQ_API_KEY)
    notion_key = get_val("NOTION_API_KEY", settings.NOTION_API_KEY)

    return {
        "DEFAULT_AI_PROVIDER": get_val("DEFAULT_AI_PROVIDER", settings.DEFAULT_AI_PROVIDER),
        "GEMINI_API_KEY_CONFIGURED": bool(gemini_key),
        "GROQ_API_KEY_CONFIGURED": bool(groq_key),
        "NOTION_API_KEY_CONFIGURED": bool(notion_key),
        "NOTION_DATABASE_ID": get_val("NOTION_DATABASE_ID", settings.NOTION_DATABASE_ID),
        "OLLAMA_BASE_URL": get_val("OLLAMA_BASE_URL", settings.OLLAMA_BASE_URL),
        "OLLAMA_MODEL": get_val("OLLAMA_MODEL", settings.OLLAMA_MODEL),
        "OBSIDIAN_VAULT_PATH": get_val("OBSIDIAN_VAULT_PATH", settings.OBSIDIAN_VAULT_PATH),
        "ANKI_CONNECT_URL": get_val("ANKI_CONNECT_URL", settings.ANKI_CONNECT_URL),
        "ANKI_DECK_NAME": get_val("ANKI_DECK_NAME", settings.ANKI_DECK_NAME),
        "WATCH_THRESHOLD_PERCENT": float(get_val("WATCH_THRESHOLD_PERCENT", str(settings.WATCH_THRESHOLD_PERCENT))),
        "MIN_DURATION_SECONDS": int(get_val("MIN_DURATION_SECONDS", str(settings.MIN_DURATION_SECONDS))),
        "SPACED_SCHEDULE_DAYS": settings.SPACED_SCHEDULE_DAYS
    }

@router.post("")
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    """Updates runtime configuration in SQLite database."""
    for key, value in payload.settings.items():
        existing = db.query(AppSetting).filter(AppSetting.key == key).first()
        if existing:
            existing.value = str(value)
        else:
            db.add(AppSetting(key=key, value=str(value)))
        if key in ["GEMINI_API_KEY", "gemini_api_key"]:
            os.environ["GEMINI_API_KEY"] = str(value)
    db.commit()
    return {"success": True, "message": "Settings updated successfully."}

@router.post("/test-gemini")
def test_gemini(payload: Optional[Dict[str, Any]] = Body(None), db: Session = Depends(get_db)):
    """Tests live connection to Google Gemini API using provided or stored key."""
    key = None
    if payload and payload.get("api_key"):
        key = str(payload["api_key"]).strip()
    if not key:
        key = AIService.get_gemini_key()
    if not key:
        return {"valid": False, "error": "No Gemini API key provided or found in settings."}
    
    return AIService.test_gemini_key(key)


