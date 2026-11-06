from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from backend.app.database import get_db
from backend.app.models import Flashcard, ReviewLog, Video
from backend.app.schemas import FlashcardResponse, ReviewAnswerRequest, ReviewLogResponse, SystemStats
from backend.app.services.spaced_repetition import SpacedRepetitionService

router = APIRouter(prefix="/api/flashcards", tags=["Flashcards & Spaced Repetition"])

def utcnow():
    return datetime.now(timezone.utc)

@router.get("/due", response_model=List[FlashcardResponse])
def get_due_flashcards(limit: int = 50, db: Session = Depends(get_db)):
    """Fetches all flashcards due for review right now according to the forgetting curve schedule."""
    now = utcnow()
    cards = (
        db.query(Flashcard)
        .join(Video)
        .filter(Flashcard.next_review_at <= now)
        .order_by(Flashcard.next_review_at)
        .limit(limit)
        .all()
    )
    # Populate video_title for convenient display
    for c in cards:
        if c.video:
            c.video_title = c.video.title
    return cards

@router.get("/all", response_model=List[FlashcardResponse])
def get_all_flashcards(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Retrieves all flashcards with pagination."""
    cards = db.query(Flashcard).order_by(desc(Flashcard.created_at)).offset(skip).limit(limit).all()
    for c in cards:
        if c.video:
            c.video_title = c.video.title
    return cards

@router.post("/{card_id}/review", response_model=FlashcardResponse)
def submit_card_review(card_id: int, payload: ReviewAnswerRequest, db: Session = Depends(get_db)):
    """
    Submits user review rating (AGAIN, HARD, GOOD, EASY).
    Updates next revision date according to:
    Immediately (0d) -> 1d -> 3d -> 7d -> 15d -> 30d -> 60d -> 90d -> 180d
    """
    card = db.query(Flashcard).filter(Flashcard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found.")

    raw_rating = str(payload.rating).strip().upper()
    num_to_rating = {"1": "AGAIN", "2": "HARD", "3": "GOOD", "4": "EASY"}
    rating = num_to_rating.get(raw_rating, raw_rating)
    valid_ratings = {"AGAIN": 1, "HARD": 2, "GOOD": 3, "EASY": 4}
    if rating not in valid_ratings:
        raise HTTPException(status_code=400, detail="Invalid rating. Choose AGAIN, HARD, GOOD, or EASY.")

    next_rev, new_step, new_interval, new_ease, new_status = SpacedRepetitionService.calculate_next_review(card, rating)

    # Log review
    log_entry = ReviewLog(
        flashcard_id=card.id,
        rating=rating,
        score=valid_ratings[rating],
        interval_days=new_interval,
        reviewed_at=utcnow(),
        time_taken_ms=payload.time_taken_ms or 0
    )
    db.add(log_entry)

    # Update card
    card.step_index = new_step
    card.interval_days = new_interval
    card.ease_factor = new_ease
    card.repetition_count = (card.repetition_count or 0) + 1
    card.last_reviewed_at = utcnow()
    card.next_review_at = next_rev
    card.status = new_status

    db.commit()
    db.refresh(card)
    if card.video:
        card.video_title = card.video.title

    return card

@router.get("/stats", response_model=SystemStats)
def get_system_stats(db: Session = Depends(get_db)):
    """Computes total videos, total flashcards, due today, mastered, and completed reviews."""
    now = utcnow()
    total_videos = db.query(func.count(Video.id)).scalar() or 0
    processed_videos = db.query(func.count(Video.id)).filter(Video.status == "PROCESSED").scalar() or 0
    total_flashcards = db.query(func.count(Flashcard.id)).scalar() or 0
    cards_due_today = db.query(func.count(Flashcard.id)).filter(Flashcard.next_review_at <= now).scalar() or 0
    cards_mastered = db.query(func.count(Flashcard.id)).filter(Flashcard.status == "MASTERED").scalar() or 0
    total_reviews = db.query(func.count(ReviewLog.id)).scalar() or 0

    return SystemStats(
        total_videos=total_videos,
        processed_videos=processed_videos,
        total_flashcards=total_flashcards,
        cards_due_today=cards_due_today,
        cards_mastered=cards_mastered,
        total_reviews_completed=total_reviews
    )

