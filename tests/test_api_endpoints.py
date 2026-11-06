import sys
from pathlib import Path
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.app.main import app
from backend.app.database import init_db

client = TestClient(app)

def test_api_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["free_tier_ready"] is True
    print("✓ Health check endpoint verified.")

def test_api_stats():
    res = client.get("/api/flashcards/stats")
    assert res.status_code == 200
    data = res.json()
    assert "total_videos" in data
    assert "cards_due_today" in data
    print("✓ Stats endpoint verified.")

def test_frontend_serving():
    res = client.get("/")
    assert res.status_code == 200
    assert "YouTube Recall" in res.text
    print("✓ Frontend root serving verified.")

def test_video_intake_and_review_lifecycle():
    # Test intake with mock educational video or popular known ID
    # Veritasium: "How Does A Transistor Work?" or 3Blue1Brown
    # e.g., "3d6DsjIBzJ4" (Veritasium) or "Ilg3gGewQ5U"
    payload = {
        "video_url_or_id": "https://www.youtube.com/watch?v=3d6DsjIBzJ4",
        "watch_time_seconds": 300,
        "watch_percent": 80.0,
        "force_process": True
    }
    
    print("Calling /api/videos/intake with real video...")
    res = client.post("/api/videos/intake", json=payload)
    assert res.status_code == 200, f"Intake failed: {res.text}"
    video_data = res.json()
    
    assert video_data["video_id"] == "3d6DsjIBzJ4"
    assert len(video_data["summary_bullets"]) == 3
    assert len(video_data["flashcards"]) > 0
    print(f"✓ Video intake processed: '{video_data['title']}' ({len(video_data['flashcards'])} flashcards generated)")

    # Test list videos
    res_list = client.get("/api/videos")
    assert res_list.status_code == 200
    assert len(res_list.json()) >= 1
    print("✓ List videos verified.")

    # Test due flashcards
    res_due = client.get("/api/flashcards/due")
    assert res_due.status_code == 200
    due_cards = res_due.json()
    assert len(due_cards) > 0
    first_card = due_cards[0]
    print(f"✓ Due flashcard found: Q='{first_card['question'][:40]}...'")

    # Test reviewing the card with GOOD
    review_res = client.post(f"/api/flashcards/{first_card['id']}/review", json={"rating": "GOOD"})
    assert review_res.status_code == 200
    updated_card = review_res.json()
    assert updated_card["step_index"] == 1
    assert updated_card["interval_days"] == 1
    print("✓ Flashcard reviewed and spaced repetition schedule updated to Day 1.")

    # Test Obsidian download
    vid_id = video_data["id"]
    obs_res = client.get(f"/api/export/obsidian/{vid_id}/download")
    assert obs_res.status_code == 200
    assert "---" in obs_res.text
    print("✓ Obsidian .md download endpoint verified.")

    # Test Anki TSV download
    anki_res = client.get(f"/api/export/anki/{vid_id}/download-tsv")
    assert anki_res.status_code == 200
    assert "#separator:tab" in anki_res.text
    print("✓ Anki TSV download endpoint verified.")

if __name__ == "__main__":
    init_db()
    test_api_health()
    test_frontend_serving()
    test_api_stats()
    test_video_intake_and_review_lifecycle()
    print("\n🎉 ALL API & END-TO-END VERIFICATION CHECKS PASSED!")

