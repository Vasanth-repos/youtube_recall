import sys, os
sys.path.insert(0, os.path.abspath("."))
from backend.app.services.classifier_service import ClassifierService

tests = [
    ({"title": "I Spent 24 Hours in a Desert", "channel_title": "MrBeast", "category": "Entertainment"}, False),
    ({"title": "GTA 5 Funny Moments and Glitches", "channel_title": "GamerDude", "category": "Gaming"}, False),
    ({"title": "Taylor series | Chapter 11, Essence of calculus", "channel_title": "3Blue1Brown", "category": "Education"}, True),
    ({"title": "Quantum Mechanics in 30 Minutes", "channel_title": "RandomPhysicsGuy", "category": "Science & Technology"}, True),
    ({"title": "React and FastAPI Full Stack Course", "channel_title": "CodeAcademy", "category": "Education"}, True),
    ({"title": "Reacting to Worst Cooking TikToks", "channel_title": "ComedyGuru", "category": "Comedy"}, False),
    ({"title": "Top 10 Pop Songs of 2024", "channel_title": "MusicChannel", "category": "Music"}, False),
    ({"title": "My Morning Routine in NYC Vlog #42", "channel_title": "DailyVlogger", "category": "People & Blogs"}, False),
    ({"title": "Linear Algebra for Game Developers - Matrix Transformations", "channel_title": "GameMath", "category": "Gaming"}, True),
]

all_pass = True
for meta, expected in tests:
    is_edu, cat, reason = ClassifierService.evaluate_video(meta, "Some long transcript context snippet with words " * 30)
    passed = (is_edu == expected)
    if not passed:
        all_pass = False
    print(f"[{'PASS' if passed else 'FAIL'}] \"{meta['title']}\" -> is_edu={is_edu} (Expected {expected}) | Category: {cat}")

if all_pass:
    print("\n🎉 ALL 9 CLASSIFIER CHECKS PASSED PERFECTLY!")
else:
    raise AssertionError("Classifier tests failed!")
