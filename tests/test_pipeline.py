import sys
from pathlib import Path
from datetime import datetime, timezone

# Ensure root in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.app.services.youtube_service import YouTubeService
from backend.app.services.classifier_service import ClassifierService
from backend.app.services.ai_service import AIService
from backend.app.services.spaced_repetition import SpacedRepetitionService
from backend.app.services.export_obsidian import ObsidianExporter
from backend.app.services.export_anki import AnkiExporter
from backend.app.models import Video, Flashcard
from backend.app.database import SessionLocal, init_db

def test_video_id_extraction():
    print("Testing Video ID extraction...")
    urls = [
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1", "dQw4w9WgXcQ"),
        ("dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://m.youtube.com/watch?v=kJQP7kiw5Fk&t=42s", "kJQP7kiw5Fk")
    ]
    for url, expected in urls:
        extracted = YouTubeService.extract_video_id(url)
        assert extracted == expected, f"Failed on {url}: expected {expected}, got {extracted}"
    print("✓ Video ID extraction passed.")

def test_timestamp_formatting():
    print("Testing Timestamp formatting...")
    assert YouTubeService.format_timestamp(45) == "00:45"
    assert YouTubeService.format_timestamp(125) == "02:05"
    assert YouTubeService.format_timestamp(3665) == "01:01:05"
    print("✓ Timestamp formatting passed.")

def test_classifier_service():
    print("Testing Classifier Service...")
    # 1. Whitelisted channel
    meta_edu = {
        "title": "Neural Networks Demystified",
        "channel_title": "3Blue1Brown",
        "tags": ["math", "ai"],
        "category": "Education"
    }
    is_edu, cat, reason = ClassifierService.evaluate_video(meta_edu)
    assert is_edu is True
    assert "3Blue1Brown" in reason

    # 2. Strict noise filter
    meta_noise = {
        "title": "GTA V Funniest Moments Gameplay Walkthrough",
        "channel_title": "Gamer123",
        "tags": ["gaming", "funny"],
        "category": "Gaming"
    }
    is_edu, cat, reason = ClassifierService.evaluate_video(meta_noise)
    assert is_edu is False
    assert "Noise" in cat

    print("✓ Classifier service passed.")

def test_ai_synthesis_local():
    print("Testing Local Zero-Cost NLP AI Synthesizer...")
    sample_transcript = (
        "Spaced repetition is an evidence-based learning technique that is usually performed with flashcards. "
        "Newly introduced and more difficult flashcards are shown more frequently, while older and less difficult "
        "flashcards are shown less frequently in order to exploit the psychological spacing effect. "
        "Active recall is a principle of efficient learning, which claims the need to actively stimulate memory "
        "during the learning process. It contrasts with passive review, in which the learning material is processed "
        "passively. Retrieval practice strengthens neural pathways and produces significant long-term retention benefits."
    )
    chunks = [
        {"start": 0, "timestamp_label": "00:00", "jump_url": "https://youtu.be/test&t=0s", "content": sample_transcript[:180]},
        {"start": 120, "timestamp_label": "02:00", "jump_url": "https://youtu.be/test&t=120s", "content": sample_transcript[180:]}
    ]

    assets = AIService._local_heuristic_synthesis(
        title="Evidence-Based Learning Strategies",
        channel="Learning Science Lab",
        duration_seconds=300,
        transcript_text=sample_transcript,
        chunks=chunks
    )

    assert len(assets["summary_bullets"]) == 3, f"Expected 3 bullets, got {len(assets['summary_bullets'])}"
    assert len(assets["key_concepts"]) > 0, "Expected key concepts"
    assert len(assets["flashcards"]) >= 2, f"Expected at least 2 flashcards, got {len(assets['flashcards'])}"
    assert len(assets["final_summary"]) > 50, "Expected substantive final summary"
    print("✓ Local Zero-Cost NLP AI synthesis passed.")

def test_spaced_repetition_schedule():
    print("Testing Spaced Repetition (Forgetting Curve Schedule: [0, 1, 3, 7, 15, 30, 60, 90, 180])...")
    card = Flashcard(
        id=1,
        video_id=1,
        question="What is active recall?",
        answer="Actively stimulating memory during learning.",
        step_index=0,
        interval_days=0,
        ease_factor=2.5,
        repetition_count=0,
        status="NEW"
    )

    # Review 1: GOOD -> advance from step 0 (0d) to step 1 (1d)
    next_rev, step, interval, ease, status = SpacedRepetitionService.calculate_next_review(card, "GOOD")
    assert step == 1
    assert interval == 1
    assert status == "REVIEW"

    # Review 2: GOOD -> advance from step 1 (1d) to step 2 (3d)
    card.step_index = step
    card.interval_days = interval
    next_rev, step, interval, ease, status = SpacedRepetitionService.calculate_next_review(card, "GOOD")
    assert step == 2
    assert interval == 3

    # Review 3: AGAIN -> demotes back to step 0
    next_rev, step, interval, ease, status = SpacedRepetitionService.calculate_next_review(card, "AGAIN")
    assert step == 0
    assert interval == 0
    assert status == "LEARNING"

    # Review 4: EASY -> skips 2 steps ahead from step 0 to step 2 (3d)
    card.step_index = step
    card.interval_days = interval
    next_rev, step, interval, ease, status = SpacedRepetitionService.calculate_next_review(card, "EASY")
    assert step == 2
    assert interval == 3

    print("✓ Spaced Repetition scheduling passed.")

def test_obsidian_and_anki_exports():
    print("Testing Obsidian and Anki exporters...")
    vid = Video(
        id=1,
        video_id="dQw4w9WgXcQ",
        title="Spaced Repetition Deep Dive",
        channel_title="Study Lab",
        duration_seconds=600,
        category="Education",
        final_summary="A masterclass on memory."
    )
    vid.summary_bullets = ["Bullet 1", "Bullet 2", "Bullet 3"]
    vid.key_concepts = ["Memory: The faculty by which data is retained"]
    vid.topic_notes = [{"timestamp_seconds": 0, "timestamp_label": "00:00", "title": "Intro", "summary": "Welcome"}]

    card = Flashcard(
        id=10,
        video_id=1,
        question="What is the spacing effect?",
        answer="Greater memory retention when study sessions are spaced out.",
        timestamp_seconds=45,
        timestamp_label="00:45"
    )
    vid.flashcards = [card]

    # Test Obsidian markdown
    md = ObsidianExporter.generate_markdown(vid)
    assert "---" in md
    assert "title: \"Spaced Repetition Deep Dive\"" in md
    assert "## 📌 3-Bullet Summary" in md
    assert "What is the spacing effect?" in md
    assert "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45s" in md

    # Test Anki TSV
    tsv = AnkiExporter.generate_tsv([card], vid)
    assert "#separator:tab" in tsv
    assert "What is the spacing effect?" in tsv
    assert "youtube-recall" in tsv

    print("✓ Obsidian and Anki exporters passed.")

if __name__ == "__main__":
    init_db()
    test_video_id_extraction()
    test_timestamp_formatting()
    test_classifier_service()
    test_ai_synthesis_local()
    test_spaced_repetition_schedule()
    test_obsidian_and_anki_exports()
    print("\n🎉 ALL PIPELINE TESTS PASSED COMPLETELY AND FLAWLESSLY!")
