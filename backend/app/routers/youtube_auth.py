import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
import requests

from backend.app.database import get_db
from backend.app.models import AppSetting
from backend.app.schemas import YouTubeAccountInfo, YouTubeAccountUpdateRequest
from backend.app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/youtube", tags=["YouTube Account Linking"])

def utcnow():
    return datetime.now(timezone.utc)

@router.get("/status", response_model=YouTubeAccountInfo)
def get_youtube_account_status(db: Session = Depends(get_db)):
    """Returns currently linked YouTube account details, connection method, and sync state."""
    record = db.query(AppSetting).filter(AppSetting.key == "YOUTUBE_ACCOUNT_INFO").first()
    default_email = settings.YOUTUBE_ACCOUNT_EMAIL or ""
    default_name = default_email.split("@")[0].capitalize() if default_email else "YouTube User"

    if not record or not record.value:
        return YouTubeAccountInfo(
            is_linked=False,
            account_name=default_name,
            account_email=default_email,
            avatar_url="",
            channel_id="",
            linked_method="standalone",
            last_synced_at=None
        )
    try:
        data = json.loads(record.value)
        if not data.get("account_email"):
            data["account_email"] = default_email
        return YouTubeAccountInfo(**data)
    except Exception as e:
        logger.warning(f"Failed to parse account setting: {e}")
        return YouTubeAccountInfo(
            is_linked=True,
            account_name=default_name,
            account_email=default_email,
            linked_method="google_account_sync"
        )

@router.post("/browser-account", response_model=YouTubeAccountInfo)
def link_browser_account(payload: YouTubeAccountUpdateRequest, db: Session = Depends(get_db)):
    """Links YouTube account via Chrome Extension browser session detection."""
    email = payload.account_email or settings.YOUTUBE_ACCOUNT_EMAIL or ""
    name = payload.account_name or (email.split("@")[0].capitalize() if email else "YouTube User")
    acc_data = {
        "is_linked": True,
        "account_name": name,
        "account_email": email,
        "avatar_url": payload.avatar_url or "",
        "channel_id": payload.channel_id or "",
        "linked_method": payload.linked_method or "browser_extension",
        "last_synced_at": utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    }
    
    existing = db.query(AppSetting).filter(AppSetting.key == "YOUTUBE_ACCOUNT_INFO").first()
    if existing:
        existing.value = json.dumps(acc_data)
    else:
        db.add(AppSetting(key="YOUTUBE_ACCOUNT_INFO", value=json.dumps(acc_data)))
    db.commit()

    return YouTubeAccountInfo(**acc_data)

@router.post("/link-email", response_model=YouTubeAccountInfo)
def link_youtube_email(payload: Dict[str, str], db: Session = Depends(get_db)):
    """Explicitly links user's YouTube account email address."""
    email = payload.get("email", "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")
    
    name = payload.get("account_name", "").strip() or email.split("@")[0]
    acc_data = {
        "is_linked": True,
        "account_name": name,
        "account_email": email,
        "avatar_url": "",
        "channel_id": "",
        "linked_method": "google_email_linked",
        "last_synced_at": utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    }

    existing = db.query(AppSetting).filter(AppSetting.key == "YOUTUBE_ACCOUNT_INFO").first()
    if existing:
        existing.value = json.dumps(acc_data)
    else:
        db.add(AppSetting(key="YOUTUBE_ACCOUNT_INFO", value=json.dumps(acc_data)))
    db.commit()

    return YouTubeAccountInfo(**acc_data)

@router.post("/disconnect")
def disconnect_youtube_account(db: Session = Depends(get_db)):
    """Unlinks connected YouTube account from the local system."""
    existing = db.query(AppSetting).filter(AppSetting.key == "YOUTUBE_ACCOUNT_INFO").first()
    if existing:
        db.delete(existing)
        db.commit()
    return {"success": True, "message": "YouTube account disconnected."}

@router.get("/auth-url")
def get_google_oauth_url():
    """Generates Google OAuth 2.0 authorization URL for direct YouTube API access."""
    if not settings.GOOGLE_CLIENT_ID:
        return {
            "configured": False,
            "message": "Google Client ID is not configured. Browser Extension Link is available out-of-the-box (100% free with zero configuration)."
        }
    
    scope = "https://www.googleapis.com/auth/youtube.readonly"
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={settings.GOOGLE_CLIENT_ID}&"
        f"redirect_uri={settings.GOOGLE_REDIRECT_URI}&"
        f"response_type=code&"
        f"scope={scope}&"
        f"access_type=offline&"
        f"prompt=consent"
    )
    return {"configured": True, "url": auth_url}

@router.get("/oauth-callback")
def google_oauth_callback(code: str = Query(...), db: Session = Depends(get_db)):
    """Handles OAuth 2.0 exchange and saves YouTube account profile."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=400, detail="Google OAuth credentials not configured on server.")

    token_url = "https://oauth2.googleapis.com/token"
    token_payload = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code"
    }

    resp = requests.post(token_url, data=token_payload, timeout=15)
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Failed to exchange OAuth token: {resp.text}")

    tokens = resp.json()
    access_token = tokens.get("access_token")

    # Fetch user YouTube channel profile
    channel_url = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true"
    headers = {"Authorization": f"Bearer {access_token}"}
    c_resp = requests.get(channel_url, headers=headers, timeout=15)
    
    channel_title = "Google / YouTube User"
    avatar_url = ""
    channel_id = ""
    if c_resp.status_code == 200:
        items = c_resp.json().get("items", [])
        if items:
            snippet = items[0].get("snippet", {})
            channel_title = snippet.get("title", channel_title)
            channel_id = items[0].get("id", "")
            thumbnails = snippet.get("thumbnails", {})
            avatar_url = thumbnails.get("default", {}).get("url", "")

    acc_data = {
        "is_linked": True,
        "account_name": channel_title,
        "avatar_url": avatar_url,
        "channel_id": channel_id,
        "linked_method": "google_oauth",
        "last_synced_at": utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    }

    existing = db.query(AppSetting).filter(AppSetting.key == "YOUTUBE_ACCOUNT_INFO").first()
    if existing:
        existing.value = json.dumps(acc_data)
    else:
        db.add(AppSetting(key="YOUTUBE_ACCOUNT_INFO", value=json.dumps(acc_data)))
    db.commit()

    return RedirectResponse(url="/?account_linked=true")

