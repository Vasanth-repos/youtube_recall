import re
import html
import logging
from typing import Dict, Any, List, Optional, Tuple
import requests
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
import yt_dlp

logger = logging.getLogger(__name__)

class YouTubeService:
    @staticmethod
    def extract_video_id(url_or_id: str) -> Optional[str]:
        """Extracts standard 11-character YouTube video ID from various URL formats."""
        if not url_or_id:
            return None
        text = url_or_id.strip()
        if re.match(r"^[a-zA-Z0-9_-]{11}$", text):
            return text
        
        patterns = [
            r"(?:v=|\/v\/|youtu\.be\/|embed\/|\/watch\?v=|\/shorts\/)([a-zA-Z0-9_-]{11})",
            r"[?&]v=([a-zA-Z0-9_-]{11})"
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        return None

    @staticmethod
    def format_timestamp(seconds: float) -> str:
        """Converts seconds into MM:SS or HH:MM:SS format."""
        s = int(seconds)
        hours = s // 3600
        minutes = (s % 3600) // 60
        remaining_seconds = s % 60
        if hours > 0:
            return f"{hours:02d}:{minutes:02d}:{remaining_seconds:02d}"
        return f"{minutes:02d}:{remaining_seconds:02d}"

    @classmethod
    def get_video_metadata(cls, video_id: str) -> Dict[str, Any]:
        """
        Fetches video metadata (title, channel, duration, thumbnail, tags, category).
        Uses free oEmbed API + yt-dlp metadata extractor. Zero API key needed!
        """
        meta = {
            "video_id": video_id,
            "title": f"YouTube Video ({video_id})",
            "channel_title": "YouTube Creator",
            "channel_id": "",
            "duration_seconds": 0,
            "thumbnail_url": f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
            "category": "Education",
            "tags": [],
            "description": ""
        }

        # 1. Quick free oEmbed fetch
        try:
            oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
            resp = requests.get(oembed_url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                meta["title"] = html.unescape(data.get("title", meta["title"]))
                meta["channel_title"] = html.unescape(data.get("author_name", meta["channel_title"]))
                meta["thumbnail_url"] = data.get("thumbnail_url", meta["thumbnail_url"])
        except Exception as e:
            logger.warning(f"oEmbed fetch error for {video_id}: {e}")

        # 2. yt-dlp metadata fetch (fast extraction without downloading audio/video)
        try:
            ydl_opts = {
                "skip_download": True,
                "extract_flat": False,
                "quiet": True,
                "no_warnings": True
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                if info:
                    meta["title"] = info.get("title") or meta["title"]
                    meta["channel_title"] = info.get("uploader") or info.get("channel") or meta["channel_title"]
                    meta["channel_id"] = info.get("channel_id") or ""
                    meta["duration_seconds"] = int(info.get("duration") or 0)
                    meta["thumbnail_url"] = info.get("thumbnail") or meta["thumbnail_url"]
                    meta["tags"] = info.get("tags") or []
                    meta["description"] = info.get("description", "")[:2000]
                    categories = info.get("categories") or []
                    if categories:
                        meta["category"] = categories[0]
        except Exception as e:
            logger.warning(f"yt-dlp metadata fetch fallback notice for {video_id}: {e}")

        return meta

    @classmethod
    def get_transcript(cls, video_id: str) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Extracts captions/subtitles with timestamps using youtube-transcript-api.
        Returns:
            clean_text (str): Complete clean text transcript.
            segments (list): List of {start, duration, text, timestamp_label, url_jump}.
        """
        raw_segments = []
        try:
            # 1. New API: YouTubeTranscriptApi().fetch(...)
            try:
                api = YouTubeTranscriptApi()
                if hasattr(api, "fetch"):
                    fetched = api.fetch(video_id, languages=['en', 'en-US', 'en-GB'])
                    if hasattr(fetched, "snippets"):
                        raw_segments = [
                            {"text": s.text, "start": s.start, "duration": s.duration}
                            for s in fetched.snippets
                        ]
            except Exception:
                pass

            # 2. Legacy / alternative fallback
            if not raw_segments:
                if hasattr(YouTubeTranscriptApi, "get_transcript"):
                    raw_segments = YouTubeTranscriptApi.get_transcript(video_id, languages=['en', 'en-US', 'en-GB'])
                elif hasattr(YouTubeTranscriptApi, "list_transcripts"):
                    t_list = YouTubeTranscriptApi.list_transcripts(video_id)
                    t = next(iter(t_list))
                    raw_segments = t.fetch()
        except Exception as e:
            logger.warning(f"Transcript extraction notice for {video_id}: {e}")

        # Fallback to metadata description if direct caption extraction is blocked or unavailable
        if not raw_segments:
            try:
                meta = cls.get_video_metadata(video_id)
                desc = meta.get("description", "").strip()
                if desc:
                    lines = [line.strip() for line in desc.split("\n") if len(line.strip()) > 15]
                    raw_segments = [{"text": line, "start": i * 45, "duration": 45} for i, line in enumerate(lines[:12])]
            except Exception:
                pass

        if not raw_segments:
            return "", []

        # Process and clean segments
        segments = []
        full_text_parts = []
        for s in raw_segments:
            text = html.unescape(s.get("text", "")).strip().replace("\n", " ")
            if not text or text == "[Music]" or text == "[Applause]":
                continue
            start_s = float(s.get("start", 0))
            duration_s = float(s.get("duration", 0))
            label = cls.format_timestamp(start_s)
            url_jump = f"https://www.youtube.com/watch?v={video_id}&t={int(start_s)}s"
            
            segments.append({
                "start": start_s,
                "duration": duration_s,
                "timestamp_label": label,
                "text": text,
                "jump_url": url_jump
            })
            full_text_parts.append(text)

        clean_text = " ".join(full_text_parts)
        return clean_text, segments

    @classmethod
    def chunk_transcript_by_time(cls, segments: List[Dict[str, Any]], chunk_seconds: int = 180) -> List[Dict[str, Any]]:
        """
        Groups transcript segments into coherent topical blocks (default: ~3 minute blocks)
        with timestamp jump points for deep linking.
        """
        if not segments:
            return []

        chunks = []
        current_chunk = {
            "start": segments[0]["start"],
            "timestamp_label": segments[0]["timestamp_label"],
            "jump_url": segments[0]["jump_url"],
            "texts": []
        }

        for seg in segments:
            if (seg["start"] - current_chunk["start"]) >= chunk_seconds and current_chunk["texts"]:
                chunks.append({
                    "start": current_chunk["start"],
                    "timestamp_label": current_chunk["timestamp_label"],
                    "jump_url": current_chunk["jump_url"],
                    "content": " ".join(current_chunk["texts"])
                })
                current_chunk = {
                    "start": seg["start"],
                    "timestamp_label": seg["timestamp_label"],
                    "jump_url": seg["jump_url"],
                    "texts": [seg["text"]]
                }
            else:
                current_chunk["texts"].append(seg["text"])

        if current_chunk["texts"]:
            chunks.append({
                "start": current_chunk["start"],
                "timestamp_label": current_chunk["timestamp_label"],
                "jump_url": current_chunk["jump_url"],
                "content": " ".join(current_chunk["texts"])
            })

        return chunks
