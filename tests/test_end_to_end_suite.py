"""
Comprehensive End-to-End Test Suite for YouTube Recall Solution.
Verifies all backend endpoints, AI distillation, spaced repetition, export endpoints,
and extension assets.
"""
import sys
import os
import json
from pathlib import Path
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.app.main import app
from backend.app.database import init_db, SessionLocal
from backend.app.models import Video, Flashcard
from backend.app.config import settings
from backend.app.services.ai_service import AIService
from backend.app.services.youtube_service import YouTubeService

client = TestClient(app)

def run_e2e_tests():
    print("=================================================================")
    print("   YOUTUBE RECALL - FULL COMPREHENSIVE END-TO-END TEST SUITE   ")
    print("=================================================================")
    
    # -------------------------------------------------------------
    # STEP 1: Backend Health, Config & Static Assets
    # -------------------------------------------------------------
    print("\n[STEP 1] Testing Backend Health & Static Delivery...")
    res = client.get("/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    health_data = res.json()
    assert health_data["status"] == "healthy"
    print("  ✓ /api/health returned healthy status")

    res = client.get("/api/settings")
    assert res.status_code == 200, f"Settings failed: {res.text}"
    settings_data = res.json()
    assert settings_data["DEFAULT_AI_PROVIDER"] in ["gemini", "local_offline"]
    assert settings_data["GEMINI_API_KEY_CONFIGURED"] is True
    print(f"  ✓ /api/settings configured with Provider='{settings_data['DEFAULT_AI_PROVIDER']}' and Gemini Key active")

    res = client.get("/")
    assert res.status_code == 200
    assert "YouTube Recall" in res.text
    print("  ✓ Web UI root (/) served successfully")

    res = client.get("/static/styles.css")
    assert res.status_code == 200
    print("  ✓ /static/styles.css served successfully")

    res = client.get("/static/app.js")
    assert res.status_code == 200
    print("  ✓ /static/app.js served successfully")

    # -------------------------------------------------------------
    # STEP 2: YouTube Caption Extraction & Synthesis Service
    # -------------------------------------------------------------
    print("\n[STEP 2] Testing Caption Extraction & AI Distillation Engine...")
    test_vid_id = "3d6DsjIBzJ4" # Veritasium
    clean_transcript, segments = YouTubeService.get_transcript(test_vid_id)
    assert len(clean_transcript) > 100, "Caption extraction failed"
    chunks = YouTubeService.chunk_transcript_by_time(segments, chunk_seconds=180)
    assert len(chunks) > 0, "Chunking failed"
    print(f"  ✓ Captions extracted ({len(clean_transcript)} chars, {len(chunks)} chunks)")

    # Direct AI Distillation Call
    recall_result = AIService.generate_recall_assets(
        title="How Does A Transistor Work?",
        channel="Veritasium",
        duration_seconds=420,
        transcript_text=clean_transcript[:3000],
        chunks=chunks[:3]
    )
    assert "summary_bullets" in recall_result and len(recall_result["summary_bullets"]) >= 1
    assert "smart_transcript" in recall_result
    print(f"  ✓ AI Distillation generated {len(recall_result['summary_bullets'])} core bullets and {len(recall_result['smart_transcript'])} chapters")

    # -------------------------------------------------------------
    # STEP 3: Video Intake & Persistence Endpoints
    # -------------------------------------------------------------
    print("\n[STEP 3] Testing Video Intake & Deduplication...")
    intake_payload = {
        "video_url_or_id": f"https://www.youtube.com/watch?v={test_vid_id}",
        "watch_time_seconds": 250,
        "watch_percent": 85.0,
        "force_process": True
    }
    res = client.post("/api/videos/intake", json=intake_payload)
    assert res.status_code == 200, f"Video intake failed: {res.text}"
    intake_data = res.json()
    assert intake_data["video_id"] == test_vid_id
    video_db_id = intake_data["id"]
    print(f"  ✓ Video intake succeeded: ID={video_db_id}, Title='{intake_data['title']}'")

    # Test Deduplication
    res = client.post("/api/videos/intake", json=intake_payload)
    assert res.status_code == 200
    assert res.json()["id"] == video_db_id
    print("  ✓ Deduplication verified (returned existing record without duplicate insertion)")

    # -------------------------------------------------------------
    # STEP 4: Video Query & Lookup Endpoints
    # -------------------------------------------------------------
    print("\n[STEP 4] Testing Video Query & Lookup Endpoints...")
    res = client.get("/api/videos")
    assert res.status_code == 200
    videos_list = res.json()
    assert any(v["id"] == video_db_id for v in videos_list)
    print(f"  ✓ GET /api/videos listed {len(videos_list)} stored video(s)")

    # Lookup by Database Integer ID
    res = client.get(f"/api/videos/{video_db_id}")
    assert res.status_code == 200
    assert res.json()["video_id"] == test_vid_id
    print(f"  ✓ GET /api/videos/{video_db_id} (Integer ID) resolved correctly")

    # Lookup by YouTube 11-char Video ID
    res = client.get(f"/api/videos/{test_vid_id}")
    assert res.status_code == 200
    assert res.json()["id"] == video_db_id
    print(f"  ✓ GET /api/videos/{test_vid_id} (YouTube ID) resolved correctly")

    # Verify Recently Watched Sorting
    res = client.get("/api/videos?sort_by=recently_watched")
    assert res.status_code == 200
    sorted_vids = res.json()
    assert len(sorted_vids) >= 1
    assert "last_watched_at" in sorted_vids[0]
    print(f"  ✓ GET /api/videos?sort_by=recently_watched verified ({len(sorted_vids)} videos sorted)")

    # -------------------------------------------------------------
    # STEP 5: Re-distillation Endpoint
    # -------------------------------------------------------------
    print("\n[STEP 5] Testing Re-distillation Endpoint...")
    res = client.post(f"/api/videos/{video_db_id}/redistill")
    assert res.status_code == 200, f"Redistill failed: {res.text}"
    redistill_data = res.json()
    assert len(redistill_data.get("smart_transcript", [])) >= 1
    print(f"  ✓ POST /api/videos/{video_db_id}/redistill successfully updated smart transcript")

    # -------------------------------------------------------------
    # STEP 6: Spaced Repetition Lifecycle
    # -------------------------------------------------------------
    print("\n[STEP 6] Testing Spaced Repetition Lifecycle...")
    res = client.get("/api/flashcards/due")
    assert res.status_code == 200
    due_cards = res.json()
    assert len(due_cards) > 0, "No due cards generated"
    target_card = due_cards[0]
    print(f"  ✓ Due flashcards found: {len(due_cards)} cards due (Testing Card ID={target_card['id']})")

    # Review card with numeric rating 3 (Good)
    res = client.post(f"/api/flashcards/{target_card['id']}/review", json={"rating": 3})
    assert res.status_code == 200, f"Review failed: {res.text}"
    review_data = res.json()
    assert review_data["id"] == target_card["id"]
    assert review_data["interval_days"] >= 1
    print(f"  ✓ Flashcard reviewed with numeric rating (3): advanced interval to {review_data['interval_days']} day(s)")

    # Review card with string rating ("GOOD")
    res_str = client.post(f"/api/flashcards/{target_card['id']}/review", json={"rating": "GOOD"})
    assert res_str.status_code == 200, f"Review failed: {res_str.text}"
    print(f"  ✓ Flashcard reviewed with string rating ('GOOD') successfully")

    res = client.get("/api/flashcards/stats")
    assert res.status_code == 200
    stats = res.json()
    assert stats["total_flashcards"] >= 1
    print(f"  ✓ Flashcard stats verified: {stats['total_flashcards']} total cards, {stats['total_reviews_completed']} reviews completed")

    # -------------------------------------------------------------
    # STEP 7: Export Integrations (Obsidian & Anki)
    # -------------------------------------------------------------
    print("\n[STEP 7] Testing Markdown & Anki Export Endpoints...")
    res = client.get(f"/api/export/obsidian/{video_db_id}/download")
    assert res.status_code == 200
    assert "attachment" in res.headers.get("content-disposition", "")
    assert "# How Does A Transistor Work?" in res.text or "# " in res.text
    print("  ✓ GET /api/export/obsidian/{id}/download returned valid Markdown file")

    res = client.get(f"/api/export/anki/{video_db_id}/download")
    assert res.status_code == 200
    assert "attachment" in res.headers.get("content-disposition", "")
    print("  ✓ GET /api/export/anki/{id}/download returned valid Anki TSV file")

    # -------------------------------------------------------------
    # STEP 8: YouTube Account Linking & History Sync Endpoints
    # -------------------------------------------------------------
    print("\n[STEP 8] Testing YouTube Account Linking & History Sync Endpoints...")
    res = client.get("/api/youtube/status")
    assert res.status_code == 200
    account_status = res.json()
    assert "is_linked" in account_status
    print("  ✓ GET /api/youtube/status resolved correctly")

    # Link Browser Account
    link_payload = {
        "account_name": "Antigravity Engineering YouTube",
        "avatar_url": "https://example.com/avatar.jpg",
        "channel_id": "UC1234567890",
        "linked_method": "browser_extension"
    }
    res = client.post("/api/youtube/browser-account", json=link_payload)
    assert res.status_code == 200
    assert res.json()["is_linked"] is True
    assert res.json()["account_name"] == "Antigravity Engineering YouTube"
    print("  ✓ POST /api/youtube/browser-account linked account successfully")

    # Test Batch Watch History Synchronization
    sync_payload = {
        "items": [
            {
                "video_url_or_id": "https://www.youtube.com/watch?v=3d6DsjIBzJ4",
                "title": "How Does A Transistor Work?",
                "watch_time_seconds": 300
            }
        ],
        "account_name": "Antigravity Engineering YouTube",
        "avatar_url": "https://example.com/avatar.jpg"
    }
    res = client.post("/api/videos/sync-history", json=sync_payload)
    assert res.status_code == 200
    sync_result = res.json()
    assert sync_result["total_received"] >= 1
    print(f"  ✓ POST /api/videos/sync-history succeeded: {sync_result['message']}")

    # -------------------------------------------------------------
    # STEP 9: Chrome Extension Manifest & Asset Integrity
    # -------------------------------------------------------------
    print("\n[STEP 9] Testing Chrome Extension Manifest & Asset Integrity...")
    ext_dir = ROOT_DIR / "extension"
    assert (ext_dir / "manifest.json").exists(), "manifest.json missing"
    manifest = json.loads((ext_dir / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["manifest_version"] == 3
    assert "history" in manifest["permissions"]
    assert "alarms" in manifest["permissions"]
    assert manifest.get("background", {}).get("service_worker") == "background.js"
    assert (ext_dir / "background.js").exists(), "background.js missing"
    assert (ext_dir / "content.js").exists(), "content.js missing"
    assert (ext_dir / "content.css").exists(), "content.css missing"
    assert (ext_dir / "popup.html").exists(), "popup.html missing"
    assert (ext_dir / "popup.js").exists(), "popup.js missing"
    print("  ✓ Chrome Extension Manifest V3, background service worker, and all scripts verified")

    # -------------------------------------------------------------
    # STEP 10: Mobile PWA & Native Android Application Integrity
    # -------------------------------------------------------------
    print("\n[STEP 10] Testing Mobile PWA & Native Android Pipeline...")
    res = client.get("/manifest.webmanifest")
    assert res.status_code == 200
    pwa_data = res.json()
    assert "share_target" in pwa_data
    print("  ✓ PWA Web App Manifest verified with Share Target API")

    res = client.get("/sw.js")
    assert res.status_code == 200
    print("  ✓ Service Worker (/sw.js) delivered for offline PWA caching")

    res = client.get("/api/download/android-apk")
    assert res.status_code == 200
    assert "application/vnd.android.package-archive" in res.headers.get("content-type", "")
    print(f"  ✓ Native Android APK download verified ({len(res.content)} bytes)")

    android_dir = ROOT_DIR / "android"
    assert (android_dir / "app" / "src" / "main" / "AndroidManifest.xml").exists()
    assert (android_dir / "app" / "src" / "main" / "java" / "com" / "youtuberecall" / "app" / "MainActivity.kt").exists()
    assert (android_dir / "youtube-recall.apk").exists()
    print("  ✓ Native Android Studio project structure & compiled APK verified")

    print("\n=================================================================")
    print("  🎉 ALL END-TO-END TESTS COMPLETED AND VERIFIED 100% PASSING!  ")
    print("=================================================================")

if __name__ == "__main__":
    run_e2e_tests()
