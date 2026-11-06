import json
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.database import Base

def utcnow():
    return datetime.now(timezone.utc)

class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(String(32), unique=True, index=True, nullable=False)
    title = Column(String(512), default="Untitled Video")
    channel_title = Column(String(256), default="Unknown Channel")
    channel_id = Column(String(128), default="")
    duration_seconds = Column(Integer, default=0)
    watch_time_seconds = Column(Integer, default=0)
    watch_percent = Column(Float, default=0.0)
    thumbnail_url = Column(String(1024), default="")
    category = Column(String(64), default="General")
    is_educational = Column(Boolean, default=True)
    relevance_reason = Column(Text, default="")
    status = Column(String(32), default="PENDING")  # PENDING, PROCESSING, PROCESSED, DROPPED, FAILED
    error_message = Column(Text, default="")

    # AI Recall Data
    summary_bullets_json = Column(Text, default="[]")  # 3-bullet summary
    key_concepts_json = Column(Text, default="[]")     # List of concepts
    topic_notes_json = Column(Text, default="[]")      # Timestamped sections
    smart_transcript_json = Column(Text, default="[]") # AI-powered crisp sectioned transcript
    final_summary = Column(Text, default="")           # High-level synthesis
    transcript_clean = Column(Text, default="")        # Parsed transcript text
    tags_json = Column(Text, default="[]")

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    last_watched_at = Column(DateTime, default=utcnow, index=True)

    flashcards = relationship("Flashcard", back_populates="video", cascade="all, delete-orphan")

    @property
    def smart_transcript(self):
        try:
            return json.loads(self.smart_transcript_json or "[]")
        except Exception:
            return []

    @smart_transcript.setter
    def smart_transcript(self, value):
        self.smart_transcript_json = json.dumps(value or [])

    @property
    def summary_bullets(self):
        try:
            return json.loads(self.summary_bullets_json or "[]")
        except Exception:
            return []

    @summary_bullets.setter
    def summary_bullets(self, value):
        self.summary_bullets_json = json.dumps(value or [])

    @property
    def key_concepts(self):
        try:
            return json.loads(self.key_concepts_json or "[]")
        except Exception:
            return []

    @key_concepts.setter
    def key_concepts(self, value):
        self.key_concepts_json = json.dumps(value or [])

    @property
    def topic_notes(self):
        try:
            return json.loads(self.topic_notes_json or "[]")
        except Exception:
            return []

    @topic_notes.setter
    def topic_notes(self, value):
        self.topic_notes_json = json.dumps(value or [])

    @property
    def tags(self):
        try:
            return json.loads(self.tags_json or "[]")
        except Exception:
            return []

    @tags.setter
    def tags(self, value):
        self.tags_json = json.dumps(value or [])


class Flashcard(Base):
    __tablename__ = "flashcards"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    timestamp_seconds = Column(Integer, default=0)
    timestamp_label = Column(String(32), default="00:00")
    
    # Spaced Repetition (Schedule index: 0, 1, 3, 7, 15, 30, 60, 90, 180)
    step_index = Column(Integer, default=0)
    interval_days = Column(Integer, default=0)
    ease_factor = Column(Float, default=2.5)
    repetition_count = Column(Integer, default=0)
    next_review_at = Column(DateTime, default=utcnow, index=True)
    last_reviewed_at = Column(DateTime, nullable=True)
    status = Column(String(32), default="NEW")  # NEW, LEARNING, REVIEW, MASTERED

    created_at = Column(DateTime, default=utcnow)

    video = relationship("Video", back_populates="flashcards")
    review_logs = relationship("ReviewLog", back_populates="flashcard", cascade="all, delete-orphan")


class ReviewLog(Base):
    __tablename__ = "review_logs"

    id = Column(Integer, primary_key=True, index=True)
    flashcard_id = Column(Integer, ForeignKey("flashcards.id", ondelete="CASCADE"), nullable=False)
    rating = Column(String(32), nullable=False)  # AGAIN, HARD, GOOD, EASY
    score = Column(Integer, nullable=False)       # 1, 2, 3, 4
    interval_days = Column(Integer, default=0)
    reviewed_at = Column(DateTime, default=utcnow)
    time_taken_ms = Column(Integer, default=0)

    flashcard = relationship("Flashcard", back_populates="review_logs")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(128), primary_key=True)
    value = Column(Text, nullable=False)
    description = Column(String(512), default="")
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

