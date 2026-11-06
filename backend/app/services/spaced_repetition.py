from datetime import datetime, timedelta, timezone
from typing import Tuple, Any
from backend.app.config import settings
from backend.app.models import Flashcard

def utcnow():
    return datetime.now(timezone.utc)

class SpacedRepetitionService:
    SCHEDULE = settings.SPACED_SCHEDULE_DAYS  # [0, 1, 3, 7, 15, 30, 60, 90, 180]

    @classmethod
    def calculate_next_review(cls, card: Flashcard, rating: Any) -> Tuple[datetime, int, int, float, str]:
        """
        Calculates the next review schedule based on the exact PDF forgetting curve milestones:
        Immediately (0d) -> 1d -> 3d -> 7d -> 15d -> 30d -> 60d -> 90d -> 180d
        Ratings: AGAIN (1), HARD (2), GOOD (3), EASY (4)
        """
        rating_str = str(rating).strip().upper()
        rating_map = {"1": "AGAIN", "2": "HARD", "3": "GOOD", "4": "EASY"}
        rating_upper = rating_map.get(rating_str, rating_str)

        current_step = card.step_index
        ease_factor = card.ease_factor or 2.5
        reps = (card.repetition_count or 0) + 1
        now = utcnow()

        if rating_upper == "AGAIN":
            # Demote back to Day 0 (Immediate) or Day 1
            new_step = 0
            new_interval = 0
            ease_factor = max(1.3, ease_factor - 0.2)
            new_status = "LEARNING"
            # Due again in 10 minutes for immediate re-test, or today
            next_review = now + timedelta(minutes=10)

        elif rating_upper == "HARD":
            # Advance cautiously or keep current milestone with slight delay
            new_step = min(len(cls.SCHEDULE) - 1, current_step + 1)
            # HARD gets current or slightly shorter interval
            new_interval = cls.SCHEDULE[current_step] if current_step < len(cls.SCHEDULE) else int(card.interval_days * 1.2)
            ease_factor = max(1.3, ease_factor - 0.15)
            new_status = "REVIEW"
            next_review = now + timedelta(days=max(1, new_interval))

        elif rating_upper == "GOOD":
            # Normal advance along the schedule curve
            new_step = min(len(cls.SCHEDULE) - 1, current_step + 1)
            new_interval = cls.SCHEDULE[new_step]
            new_status = "MASTERED" if new_step >= len(cls.SCHEDULE) - 1 else "REVIEW"
            next_review = now + timedelta(days=new_interval if new_interval > 0 else 1)

        elif rating_upper == "EASY":
            # Advance two steps along schedule or scale by ease factor
            new_step = min(len(cls.SCHEDULE) - 1, current_step + 2)
            new_interval = cls.SCHEDULE[new_step]
            ease_factor = min(3.0, ease_factor + 0.15)
            new_status = "MASTERED" if new_step >= len(cls.SCHEDULE) - 1 else "REVIEW"
            next_review = now + timedelta(days=new_interval if new_interval > 0 else 2)

        else:
            # Default to GOOD
            new_step = min(len(cls.SCHEDULE) - 1, current_step + 1)
            new_interval = cls.SCHEDULE[new_step]
            new_status = "REVIEW"
            next_review = now + timedelta(days=max(1, new_interval))

        return next_review, new_step, new_interval, round(ease_factor, 2), new_status

