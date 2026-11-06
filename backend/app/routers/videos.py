import logging
import json
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.app.database import get_db
from backend.app.models import Video, Flashcard, AppSetting
from backend.app.schemas import (
    VideoIntakeRequest,
    VideoResponse,
    YouTubeHistorySyncRequest,
    YouTubeHistorySyncResponse
)
from backend.app.services.youtube_service import YouTubeService
from backend.app.services.classifier_service import ClassifierService
from backend.app.services.ai_service import AIService
from backend.app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/videos", tags=["Videos"])

def utcnow():
    return datetime.now(timezone.utc)

def process_video_pipeline(db: Session, video_req: VideoIntakeRequest) -> Video:
    raw_id = YouTubeService.extract_video_id(video_req.video_url_or_id)
    if not raw_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL or Video ID provided.")

    # 1. Deduplication check
    existing = db.query(Video).filter(Video.video_id == raw_id).first()
    if existing and existing.status == "PROCESSED" and not video_req.force_process:
        return existing

    # 2. Fetch metadata
    meta = YouTubeService.get_video_metadata(raw_id)
    duration = meta.get("duration_seconds", 0)
    watch_seconds = video_req.watch_time_seconds or 0
    watch_pct = video_req.watch_percent or ((watch_seconds / duration * 100) if duration > 0 else 0.0)

    # 3. Intake validation threshold (PDF: "The system confirms you watched enough (e.g. > 50%), removes duplicates and filters noise")
    if not video_req.force_process:
        if duration > 0 and duration < settings.MIN_DURATION_SECONDS:
            raise HTTPException(status_code=400, detail=f"Video too short ({duration}s). Minimum is {settings.MIN_DURATION_SECONDS}s.")
        if watch_pct > 0 and watch_pct < settings.WATCH_THRESHOLD_PERCENT:
            raise HTTPException(
                status_code=400,
                detail=f"Watch progress ({watch_pct:.1f}%) is below threshold ({settings.WATCH_THRESHOLD_PERCENT}%). Finish watching or enable Force Save."
            )

    # 4. Fetch Transcript
    clean_transcript, segments = YouTubeService.get_transcript(raw_id)
    chunks = YouTubeService.chunk_transcript_by_time(segments, chunk_seconds=180)

    # 5. Smart Classification (Learn vs Noise)
    is_educational, category, relevance_reason = ClassifierService.evaluate_video(meta, clean_transcript[:1500])
    
    if not is_educational and not video_req.force_process:
        # Drop noise video to save processing cost as specified in PDF
        video_record = existing or Video(video_id=raw_id)
        video_record.title = meta["title"]
        video_record.channel_title = meta["channel_title"]
        video_record.duration_seconds = duration
        video_record.watch_time_seconds = watch_seconds
        video_record.watch_percent = round(watch_pct, 1)
        video_record.thumbnail_url = meta["thumbnail_url"]
        video_record.category = category
        video_record.is_educational = False
        video_record.relevance_reason = relevance_reason
        video_record.status = "DROPPED"
        db.add(video_record)
        db.commit()
        db.refresh(video_record)
        raise HTTPException(
            status_code=422,
            detail=f"Video filtered out as '{category}': {relevance_reason}. Use 'Force Process' to override."
        )

    # 6. AI Recall Generation (3-bullet summary, key concepts, flashcards, topic notes)
    recall_data = AIService.generate_recall_assets(
        title=meta["title"],
        channel=meta["channel_title"],
        duration_seconds=duration,
        transcript_text=clean_transcript or meta["description"],
        chunks=chunks
    )

    # 7. Persist or Update Video in DB
    video_record = existing or Video(video_id=raw_id)
    video_record.title = meta["title"]
    video_record.channel_title = meta["channel_title"]
    video_record.channel_id = meta.get("channel_id", "")
    video_record.duration_seconds = duration
    video_record.watch_time_seconds = watch_seconds
    video_record.watch_percent = round(watch_pct, 1)
    video_record.thumbnail_url = meta["thumbnail_url"]
    video_record.category = category
    video_record.is_educational = True
    video_record.relevance_reason = relevance_reason
    video_record.status = "PROCESSED"
    video_record.transcript_clean = clean_transcript[:10000] if clean_transcript else ""
    video_record.tags = meta.get("tags", [])

    # Set AI properties
    video_record.summary_bullets = recall_data.get("summary_bullets", [])
    video_record.key_concepts = recall_data.get("key_concepts", [])
    video_record.topic_notes = recall_data.get("topic_notes", [])
    video_record.smart_transcript = recall_data.get("smart_transcript", recall_data.get("topic_notes", []))
    video_record.final_summary = recall_data.get("final_summary", "")

    db.add(video_record)
    db.commit()
    db.refresh(video_record)

    # 8. Create Spaced Repetition Flashcards (Initial step = 0, due Immediately)
    # Clear old flashcards if reprocessing
    db.query(Flashcard).filter(Flashcard.video_id == video_record.id).delete()
    
    now = utcnow()
    generated_cards = recall_data.get("flashcards", [])
    for card_data in generated_cards:
        card = Flashcard(
            video_id=video_record.id,
            question=card_data.get("question", "Recall question"),
            answer=card_data.get("answer", "Answer"),
            timestamp_seconds=card_data.get("timestamp_seconds", 0),
            timestamp_label=card_data.get("timestamp_label", "00:00"),
            step_index=0,
            interval_days=0,
            ease_factor=2.5,
            repetition_count=0,
            next_review_at=now,
            status="NEW"
        )
        db.add(card)

    db.commit()
    db.refresh(video_record)
    return video_record

@router.post("/intake", response_model=VideoResponse)
def intake_video(payload: VideoIntakeRequest, db: Session = Depends(get_db)):
    """Receives YouTube video ID/URL, validates, transcribes, classifies, and synthesizes study material."""
    return process_video_pipeline(db, payload)

@router.post("/sync-history", response_model=YouTubeHistorySyncResponse)
def sync_youtube_history(payload: YouTubeHistorySyncRequest, db: Session = Depends(get_db)):
    """
    Batch synchronizes YouTube watch history items from linked account / browser extension.
    Automatically filters duplicates and distills transcripts for new videos.
    """
    # 1. Update linked account metadata if provided
    if payload.account_name:
        acc_data = {
            "is_linked": True,
            "account_name": payload.account_name,
            "avatar_url": payload.avatar_url or "",
            "channel_id": "",
            "linked_method": "browser_extension",
            "last_synced_at": utcnow().isoformat()
        }
        existing = db.query(AppSetting).filter(AppSetting.key == "YOUTUBE_ACCOUNT_INFO").first()
        if existing:
            existing.value = json.dumps(acc_data)
        else:
            db.add(AppSetting(key="YOUTUBE_ACCOUNT_INFO", value=json.dumps(acc_data)))
        db.commit()

    total_received = len(payload.items)
    newly_synced = 0
    already_synced = 0
    synced_titles = []

    for item in payload.items:
        raw_id = YouTubeService.extract_video_id(item.video_url_or_id)
        if not raw_id:
            continue

        existing = db.query(Video).filter(Video.video_id == raw_id).first()
        if existing and existing.status == "PROCESSED":
            already_synced += 1
            continue

        try:
            req = VideoIntakeRequest(
                video_url_or_id=raw_id,
                watch_time_seconds=item.watch_time_seconds or 180,
                watch_percent=100.0,
                force_process=True
            )
            vid = process_video_pipeline(db, req)
            newly_synced += 1
            synced_titles.append(vid.title)
        except Exception as e:
            logger.warning(f"Could not auto-sync video {raw_id}: {e}")

    return YouTubeHistorySyncResponse(
        total_received=total_received,
        newly_synced=newly_synced,
        already_synced=already_synced,
        synced_titles=synced_titles,
        message=f"Synced {newly_synced} new video(s) from your YouTube account history ({already_synced} already saved)."
    )

@router.get("", response_model=List[VideoResponse])
def list_videos(
    status: Optional[str] = None,
    category: Optional[str] = None,
    query: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Lists saved videos with optional filtering and search."""
    q = db.query(Video)
    if status:
        q = q.filter(Video.status == status)
    if category:
        q = q.filter(Video.category.ilike(f"%{category}%"))
    if query:
        q = q.filter((Video.title.ilike(f"%{query}%")) | (Video.channel_title.ilike(f"%{query}%")))
    
    return q.order_by(desc(Video.created_at)).offset(skip).limit(limit).all()

@router.get("/{id_or_video_id}", response_model=VideoResponse)
def get_video(id_or_video_id: str, db: Session = Depends(get_db)):
    """Retrieves a single video by database ID or YouTube 11-char ID."""
    if id_or_video_id.isdigit():
        vid = db.query(Video).filter(Video.id == int(id_or_video_id)).first()
    else:
        vid = db.query(Video).filter(Video.video_id == id_or_video_id).first()
    
    if not vid:
        raise HTTPException(status_code=404, detail="Video not found.")
    return vid

@router.post("/{video_id}/redistill", response_model=VideoResponse)
def redistill_video_transcript(video_id: int, db: Session = Depends(get_db)):
    """Re-distills video transcript with clean AI distillation engine."""
    vid = db.query(Video).filter(Video.id == video_id).first()
    if not vid:
        raise HTTPException(status_code=404, detail="Video not found.")

    # Fetch fresh transcript and chunking
    clean_transcript, segments = YouTubeService.get_transcript(vid.video_id)
    chunks = YouTubeService.chunk_transcript_by_time(segments, chunk_seconds=180)

    recall_data = AIService.generate_recall_assets(
        title=vid.title,
        channel=vid.channel_title,
        duration_seconds=vid.duration_seconds,
        transcript_text=clean_transcript or vid.transcript_clean,
        chunks=chunks
    )

    vid.summary_bullets = recall_data.get("summary_bullets", [])
    vid.key_concepts = recall_data.get("key_concepts", [])
    vid.topic_notes = recall_data.get("topic_notes", [])
    vid.smart_transcript = recall_data.get("smart_transcript", [])
    vid.final_summary = recall_data.get("final_summary", "")

    db.commit()
    db.refresh(vid)
    return vid

@router.delete("/{video_id}")
def delete_video(video_id: int, db: Session = Depends(get_db)):
    """Deletes a video and all associated flashcards from the system."""
    vid = db.query(Video).filter(Video.id == video_id).first()
    if not vid:
        raise HTTPException(status_code=404, detail="Video not found.")
    db.delete(vid)
    db.commit()
    return {"success": True, "message": f"Deleted video '{vid.title}'"}

