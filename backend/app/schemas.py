from typing import List, Optional, Any, Dict
from datetime import datetime
from pydantic import BaseModel, Field

class VideoIntakeRequest(BaseModel):
    video_url_or_id: str = Field(..., description="YouTube video URL or 11-character video ID")
    watch_time_seconds: Optional[int] = Field(0, description="Seconds watched by the user")
    duration_seconds: Optional[int] = Field(0, description="Total video duration in seconds")
    watch_percent: Optional[float] = Field(0.0, description="Percentage watched (0 - 100)")
    force_process: bool = Field(False, description="Bypass watch-time & entertainment filters")

class TopicNote(BaseModel):
    timestamp_seconds: int
    timestamp_label: str
    title: str
    summary: str
    takeaways: List[str] = []

class FlashcardBase(BaseModel):
    question: str
    answer: str
    timestamp_seconds: Optional[int] = 0
    timestamp_label: Optional[str] = "00:00"

class FlashcardResponse(FlashcardBase):
    id: int
    video_id: int
    video_title: Optional[str] = ""
    step_index: int
    interval_days: int
    ease_factor: float
    repetition_count: int
    next_review_at: datetime
    last_reviewed_at: Optional[datetime] = None
    status: str

    class Config:
        from_attributes = True

class VideoResponse(BaseModel):
    id: int
    video_id: str
    title: str
    channel_title: str
    channel_id: str
    duration_seconds: int
    watch_time_seconds: int
    watch_percent: float
    thumbnail_url: str
    category: str
    is_educational: bool
    relevance_reason: str
    status: str
    error_message: Optional[str] = ""
    summary_bullets: List[str] = []
    key_concepts: List[str] = []
    topic_notes: List[Dict[str, Any]] = []
    final_summary: str
    tags: List[str] = []
    flashcards: List[FlashcardResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ReviewAnswerRequest(BaseModel):
    rating: str = Field(..., description="AGAIN, HARD, GOOD, or EASY")
    time_taken_ms: Optional[int] = 0

class ReviewLogResponse(BaseModel):
    id: int
    flashcard_id: int
    rating: str
    score: int
    interval_days: int
    reviewed_at: datetime

    class Config:
        from_attributes = True

class ExportRequest(BaseModel):
    target: str = Field(..., description="obsidian, anki, or notion")
    video_id: Optional[int] = None
    vault_path: Optional[str] = None
    deck_name: Optional[str] = None

class SettingItem(BaseModel):
    key: str
    value: str
    description: Optional[str] = ""

class SettingsUpdate(BaseModel):
    settings: Dict[str, str]

class SystemStats(BaseModel):
    total_videos: int
    processed_videos: int
    total_flashcards: int
    cards_due_today: int
    cards_mastered: int
    total_reviews_completed: int
