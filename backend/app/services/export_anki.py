import logging
from typing import Dict, Any, List, Optional
import requests
from backend.app.config import settings
from backend.app.models import Video, Flashcard

logger = logging.getLogger(__name__)

class AnkiExporter:
    @classmethod
    def test_ankiconnect(cls, url: Optional[str] = None) -> bool:
        """Checks if AnkiConnect HTTP server is active."""
        target_url = url or settings.ANKI_CONNECT_URL
        try:
            resp = requests.post(target_url, json={"action": "version", "version": 6}, timeout=2)
            return resp.status_code == 200
        except Exception:
            return False

    @classmethod
    def sync_to_ankiconnect(cls, video: Video, deck_name: Optional[str] = None, url: Optional[str] = None) -> Dict[str, Any]:
        """
        Injects flashcards directly into running Anki desktop instance via AnkiConnect API.
        """
        target_url = url or settings.ANKI_CONNECT_URL
        deck = deck_name or settings.ANKI_DECK_NAME

        try:
            # 1. Ensure deck exists
            requests.post(target_url, json={
                "action": "createDeck",
                "version": 6,
                "params": {"deck": deck}
            }, timeout=3)

            # 2. Prepare notes
            notes = []
            for card in video.flashcards:
                ts_label = card.timestamp_label or "00:00"
                jump_url = f"https://www.youtube.com/watch?v={video.video_id}&t={card.timestamp_seconds or 0}s"
                
                front_html = (
                    f"<div style='font-family: sans-serif; font-size: 18px; line-height: 1.5;'>"
                    f"<div style='font-size: 12px; color: #888; margin-bottom: 6px;'>📺 {video.title}</div>"
                    f"<div><strong>{card.question}</strong></div>"
                    f"<div style='margin-top: 8px;'><a href='{jump_url}' style='font-size: 12px; color: #2563eb; text-decoration: none;'>▶ Jump to {ts_label}</a></div>"
                    f"</div>"
                )
                back_html = (
                    f"<div style='font-family: sans-serif; font-size: 18px; line-height: 1.5; color: #1e293b;'>"
                    f"<div>{card.answer}</div>"
                    f"</div>"
                )

                notes.append({
                    "deckName": deck,
                    "modelName": "Basic",
                    "fields": {
                        "Front": front_html,
                        "Back": back_html
                    },
                    "tags": ["youtube-recall", video.category.lower().replace(" ", "-"), video.video_id]
                })

            # 3. Add notes to Anki
            resp = requests.post(target_url, json={
                "action": "addNotes",
                "version": 6,
                "params": {"notes": notes}
            }, timeout=5)

            data = resp.json()
            return {
                "success": True,
                "message": f"Successfully injected {len(notes)} flashcards into Anki deck '{deck}'",
                "anki_result": data.get("result")
            }
        except Exception as e:
            logger.warning(f"AnkiConnect injection failed: {e}")
            return {
                "success": False,
                "message": f"AnkiConnect is not reachable at {target_url}. Ensure Anki is open with AnkiConnect installed, or use TSV export."
            }

    @classmethod
    def generate_tsv(cls, flashcards: List[Flashcard], video: Video) -> str:
        """
        Generates standard Anki TSV format for instant manual import into Anki / AnkiDroid / AnkiMobile.
        Format: Front <TAB> Back <TAB> Tags
        """
        lines = ["#separator:tab", "#html:true", "#tags column:3"]
        for card in flashcards:
            ts_label = card.timestamp_label or "00:00"
            jump_url = f"https://www.youtube.com/watch?v={video.video_id}&t={card.timestamp_seconds or 0}s"
            
            front = f"<b>{card.question}</b><br><small><a href='{jump_url}'>Jump to {ts_label}</a></small>"
            back = card.answer
            tags = f"youtube-recall {video.category.lower().replace(' ', '-')}"
            
            # Escape tabs and newlines for TSV
            clean_front = front.replace("\t", " ").replace("\n", "<br>")
            clean_back = back.replace("\t", " ").replace("\n", "<br>")
            lines.append(f"{clean_front}\t{clean_back}\t{tags}")

        return "\n".join(lines)

