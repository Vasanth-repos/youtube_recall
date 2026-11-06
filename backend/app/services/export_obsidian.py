import os
import re
from pathlib import Path
from typing import Dict, Any, Optional
from backend.app.models import Video

class ObsidianExporter:
    @classmethod
    def generate_markdown(cls, video: Video) -> str:
        """
        Generates Obsidian-compatible Markdown note with YAML frontmatter,
        tags, timestamp deep links, callout blocks, and Spaced Repetition flashcards.
        """
        safe_title = video.title.replace('"', '\\"')
        tags_yaml = "\n  - ".join(["micro-learning", "youtube", video.category.lower().replace(" ", "-")])
        
        md_lines = [
            "---",
            f'title: "{safe_title}"',
            f'channel: "{video.channel_title}"',
            f'source: "https://www.youtube.com/watch?v={video.video_id}"',
            f'category: "{video.category}"',
            f'processed_at: "{video.created_at.strftime("%Y-%m-%d %H:%M:%S") if video.created_at else ""}"',
            "tags:",
            f"  - {tags_yaml}",
            "---\n",
            f"# 🧠 {video.title}",
            f"> **Channel:** [{video.channel_title}](https://www.youtube.com/watch?v={video.video_id}) | "
            f"**Duration:** {video.duration_seconds // 60}m {video.duration_seconds % 60}s | "
            f"**Category:** `{video.category}`\n",
            "## 📌 3-Bullet Summary"
        ]

        for bullet in video.summary_bullets:
            md_lines.append(f"- {bullet}")
        md_lines.append("")

        if video.key_concepts:
            md_lines.append("## 💡 Key Concepts")
            for concept in video.key_concepts:
                md_lines.append(f"- **{concept}**")
            md_lines.append("")

        if video.topic_notes:
            md_lines.append("## ⏱️ Timestamped Breakdown")
            for topic in video.topic_notes:
                ts_label = topic.get("timestamp_label", "00:00")
                ts_sec = topic.get("timestamp_seconds", 0)
                jump_url = f"https://www.youtube.com/watch?v={video.video_id}&t={ts_sec}s"
                title = topic.get("title", f"Section at {ts_label}")
                summary = topic.get("summary", "")
                md_lines.append(f"### [{ts_label}]({jump_url}) - {title}")
                md_lines.append(f"{summary}\n")
                takeaways = topic.get("takeaways", [])
                if takeaways:
                    for t in takeaways:
                        md_lines.append(f"  * {t}")
                    md_lines.append("")

        if video.flashcards:
            md_lines.append("## 🃏 Active Recall Flashcards")
            md_lines.append("> Compatible with Obsidian Spaced Repetition plugin (`#flashcards`)\n")
            for card in video.flashcards:
                ts_label = card.timestamp_label or "00:00"
                jump_url = f"https://www.youtube.com/watch?v={video.video_id}&t={card.timestamp_seconds or 0}s"
                # Obsidian Spaced Repetition inline format: Question::Answer
                md_lines.append(f"**Q:** {card.question} ([{ts_label}]({jump_url}))")
                md_lines.append(f"?\n**A:** {card.answer}\n")

        if video.final_summary:
            md_lines.append("## 📝 Comprehensive Synthesis")
            md_lines.append(f"{video.final_summary}\n")

        return "\n".join(md_lines)

    @classmethod
    def save_to_vault(cls, video: Video, vault_path: Optional[str] = None) -> Dict[str, Any]:
        """Saves note directly into user's Obsidian Vault if specified."""
        content = cls.generate_markdown(video)
        
        # Clean title for filesystem filename
        clean_name = re.sub(r'[\\/*?:"<>|]', "", video.title).strip()
        filename = f"{clean_name[:80]} ({video.video_id}).md"

        target_dir = Path(vault_path) if vault_path else Path("exports/obsidian")
        target_dir.mkdir(parents=True, exist_ok=True)
        file_path = target_dir / filename

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        return {
            "success": True,
            "filename": filename,
            "path": str(file_path),
            "content": content
        }
