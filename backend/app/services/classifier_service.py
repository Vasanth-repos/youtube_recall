import re
from typing import Dict, Any, Tuple

EDUCATIONAL_CHANNELS = {
    "3blue1brown", "veritasium", "kurzgesagt – in a nutshell", "kurzgesagt",
    "freecodecamp.org", "freecodecamp", "mit opencourseware", "stanford",
    "khan academy", "fireship", "lex fridman", "andrew ng", "huberman lab",
    "ali abdaal", "statquest with josh starmer", "computerphile", "numberphile",
    "crashcourse", "ted-ed", "ted", "cs50", "traversy media", "kevin stratvert",
    "networkchuck", "jeff su", "thomas frank", "mKBHD", "clever programmer"
}

EDUCATIONAL_KEYWORDS = [
    "tutorial", "course", "how to", "guide", "explained", "deep dive", "crash course",
    "architecture", "programming", "python", "javascript", "react", "fastapi", "docker",
    "machine learning", "deep learning", "neural network", "system design", "data structures",
    "algorithms", "physics", "math", "calculus", "linear algebra", "biology", "chemistry",
    "history", "philosophy", "economics", "finance", "investing", "productivity", "study tips",
    "spaced repetition", "retrieval practice", "summary", "lecture", "book summary", "key concepts"
]

NOISE_KEYWORDS = [
    "music video", "official music video", "official audio", "lyric video", "remix", "vevo",
    "gameplay", "walkthrough", "let's play", "speedrun", "roblox", "minecraft", "fortnite",
    "gta v", "prank", "reaction video", "meme", "funny moments", "highlight reel", "vlog #",
    "drama", "unboxing toys", "tiktok compilation", "asmr eating", "trailer #", "teaser"
]

class ClassifierService:
    @classmethod
    def evaluate_video(cls, metadata: Dict[str, Any], transcript_snippet: str = "") -> Tuple[bool, str, str]:
        """
        Classifies video into Learn vs Noise using tiered rules and keyword analysis.
        Returns:
            is_educational (bool): True if suitable for learning/revision, False if noise/entertainment.
            category (str): E.g. "Tech & Programming", "Science & Math", "Productivity & Growth", "Noise"
            reason (str): Human-readable explanation.
        """
        title = (metadata.get("title") or "").lower()
        channel = (metadata.get("channel_title") or "").lower()
        tags = [str(t).lower() for t in (metadata.get("tags") or [])]
        category_meta = (metadata.get("category") or "").lower()
        combined_text = f"{title} {' '.join(tags)} {channel} {transcript_snippet[:1000].lower()}"

        # 1. Channel Whitelist Check
        for trusted in EDUCATIONAL_CHANNELS:
            if trusted in channel:
                return True, "Trusted Educational Channel", f"Channel '{metadata.get('channel_title')}' is in the verified learning whitelist."

        # 2. Strict Noise / Entertainment Blocklist
        for noise in NOISE_KEYWORDS:
            if re.search(r"\b" + re.escape(noise) + r"\b", title):
                return False, "Entertainment / Noise", f"Detected entertainment/gaming noise signature: '{noise}' in title."

        # 3. Native YouTube category check
        if category_meta in ["music", "gaming", "comedy", "entertainment"]:
            # Check if there is an explicit override keyword in title (e.g., "game engine tutorial" under Gaming)
            has_strong_edu = any(kw in title for kw in ["tutorial", "how to build", "course", "architecture", "explained"])
            if not has_strong_edu:
                return False, "Entertainment / Noise", f"Video belongs to YouTube '{metadata.get('category')}' category without educational markers."

        # 4. Educational Keyword Score
        edu_score = sum(1 for kw in EDUCATIONAL_KEYWORDS if kw in combined_text)
        
        if edu_score >= 2 or category_meta in ["education", "science & technology", "howto & style"]:
            if any(k in combined_text for k in ["code", "programming", "software", "python", "developer", "system design"]):
                cat = "Tech & Engineering"
            elif any(k in combined_text for k in ["science", "physics", "math", "biology", "chemistry"]):
                cat = "Science & Mathematics"
            elif any(k in combined_text for k in ["productivity", "habit", "study", "retention", "book summary", "psychology"]):
                cat = "Personal Growth & Productivity"
            else:
                cat = "General Education"
            return True, cat, f"Matched {edu_score} educational signals and learning domain criteria."

        # 5. Fallback for moderately educational content
        if edu_score == 1 or len(transcript_snippet) > 1000:
            return True, "General Learning", "Transcript and metadata contain informative educational structure."

        # Default drop if no learning signals detected
        return False, "Entertainment / Casual", "Video lacked educational keywords, structured topics, or tutorial content."
