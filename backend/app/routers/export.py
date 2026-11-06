import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Video, Flashcard
from backend.app.schemas import ExportRequest
from backend.app.services.export_obsidian import ObsidianExporter
from backend.app.services.export_anki import AnkiExporter
from backend.app.services.export_notion import NotionExporter

router = APIRouter(prefix="/api/export", tags=["Routing & Delivery Engine"])

@router.post("/obsidian")
def export_to_obsidian(payload: ExportRequest, db: Session = Depends(get_db)):
    """Generates Obsidian Markdown and saves to vault or exports directory."""
    if not payload.video_id:
        raise HTTPException(status_code=400, detail="video_id is required.")
    
    video = db.query(Video).filter(Video.id == payload.video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found.")

    res = ObsidianExporter.save_to_vault(video, payload.vault_path)
    return res

@router.get("/obsidian/{video_id}/download")
def download_obsidian_markdown(video_id: int, db: Session = Depends(get_db)):
    """Downloads formatted Obsidian Markdown note directly."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found.")

    content = ObsidianExporter.generate_markdown(video)
    safe_title = re.sub(r'[^\w\-_.]', '_', video.title[:50])
    filename = f"{safe_title}.md"
    
    return Response(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.post("/anki")
def export_to_anki(payload: ExportRequest, db: Session = Depends(get_db)):
    """Syncs flashcards to Anki Desktop via AnkiConnect API."""
    if not payload.video_id:
        raise HTTPException(status_code=400, detail="video_id is required.")
    
    video = db.query(Video).filter(Video.id == payload.video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found.")

    return AnkiExporter.sync_to_ankiconnect(video, payload.deck_name)

@router.get("/anki/{video_id}/download-tsv")
def download_anki_tsv(video_id: int, db: Session = Depends(get_db)):
    """Generates and downloads Anki-compatible TSV file for easy card import on desktop or mobile."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found.")

    cards = db.query(Flashcard).filter(Flashcard.video_id == video.id).all()
    tsv_content = AnkiExporter.generate_tsv(cards, video)
    safe_title = re.sub(r'[^\w\-_.]', '_', video.title[:50])
    filename = f"{safe_title}_anki.tsv"

    return Response(
        content=tsv_content,
        media_type="text/tab-separated-values",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.post("/notion")
def export_to_notion(payload: ExportRequest, db: Session = Depends(get_db)):
    """Creates a structured summary & flashcard toggle page in Notion database."""
    if not payload.video_id:
        raise HTTPException(status_code=400, detail="video_id is required.")
    
    video = db.query(Video).filter(Video.id == payload.video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found.")

    res = NotionExporter.sync_to_notion(video)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

