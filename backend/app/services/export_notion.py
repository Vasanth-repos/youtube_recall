import logging
from typing import Dict, Any, Optional
import requests
from backend.app.config import settings
from backend.app.models import Video

logger = logging.getLogger(__name__)

class NotionExporter:
    NOTION_API_URL = "https://api.notion.com/v1"
    NOTION_VERSION = "2022-06-28"

    @classmethod
    def sync_to_notion(
        cls,
        video: Video,
        api_key: Optional[str] = None,
        database_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Syncs video recall notes and flashcards into a Notion Database as structured blocks.
        """
        token = api_key or settings.NOTION_API_KEY
        db_id = database_id or settings.NOTION_DATABASE_ID

        if not token or not db_id:
            return {
                "success": False,
                "message": "Notion API Key or Database ID is missing. Configure them in Settings or .env"
            }

        headers = {
            "Authorization": f"Bearer {token}",
            "Notion-Version": cls.NOTION_VERSION,
            "Content-Type": "application/json"
        }

        # Build block children for Notion page
        children_blocks = [
            {
                "object": "block",
                "type": "callout",
                "callout": {
                    "rich_text": [{
                        "type": "text",
                        "text": {"content": f"📺 {video.channel_title} • Duration: {video.duration_seconds // 60}m"}
                    }],
                    "icon": {"emoji": "🧠"}
                }
            },
            {
                "object": "block",
                "type": "heading_2",
                "heading_2": {
                    "rich_text": [{"type": "text", "text": {"content": "📌 3-Bullet Summary"}}]
                }
            }
        ]

        for bullet in video.summary_bullets:
            children_blocks.append({
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": {
                    "rich_text": [{"type": "text", "text": {"content": bullet}}]
                }
            })

        if video.key_concepts:
            children_blocks.append({
                "object": "block",
                "type": "heading_2",
                "heading_2": {
                    "rich_text": [{"type": "text", "text": {"content": "💡 Key Concepts"}}]
                }
            })
            for concept in video.key_concepts:
                children_blocks.append({
                    "object": "block",
                    "type": "bulleted_list_item",
                    "bulleted_list_item": {
                        "rich_text": [{"type": "text", "text": {"content": concept}}]
                    }
                })

        if video.flashcards:
            children_blocks.append({
                "object": "block",
                "type": "heading_2",
                "heading_2": {
                    "rich_text": [{"type": "text", "text": {"content": "🃏 Active Recall Q&A"}}]
                }
            })
            for card in video.flashcards:
                ts_label = card.timestamp_label or "00:00"
                # Use Notion toggle block for active recall practice!
                children_blocks.append({
                    "object": "block",
                    "type": "toggle",
                    "toggle": {
                        "rich_text": [{
                            "type": "text",
                            "text": {"content": f"Q: {card.question} [{ts_label}]"}
                        }],
                        "children": [{
                            "object": "block",
                            "type": "paragraph",
                            "paragraph": {
                                "rich_text": [{
                                    "type": "text",
                                    "text": {"content": f"A: {card.answer}"}
                                }]
                            }
                        }]
                    }
                })

        # Create page payload
        payload = {
            "parent": {"database_id": db_id},
            "properties": {
                "Name": {
                    "title": [{"text": {"content": video.title[:100]}}]
                }
            },
            "children": children_blocks[:95]  # Notion API limit per request
        }

        try:
            resp = requests.post(f"{cls.NOTION_API_URL}/pages", headers=headers, json=payload, timeout=10)
            if resp.status_code in [200, 201]:
                res_data = resp.json()
                page_url = res_data.get("url", "")
                return {
                    "success": True,
                    "message": "Successfully created page in Notion database",
                    "page_url": page_url
                }
            else:
                return {
                    "success": False,
                    "message": f"Notion API error ({resp.status_code}): {resp.text}"
                }
        except Exception as e:
            logger.error(f"Notion export exception: {e}")
            return {
                "success": False,
                "message": f"Failed to connect to Notion API: {str(e)}"
            }

