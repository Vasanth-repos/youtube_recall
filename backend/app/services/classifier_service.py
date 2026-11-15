import re
from typing import Dict, Any, Tuple

# Verified High-Quality Academic & Technical Channels
EDUCATIONAL_CHANNELS = {
    "3blue1brown", "veritasium", "kurzgesagt – in a nutshell", "kurzgesagt",
    "freecodecamp.org", "freecodecamp", "mit opencourseware", "stanford",
    "khan academy", "fireship", "lex fridman", "andrew ng", "huberman lab",
    "ali abdaal", "statquest with josh starmer", "computerphile", "numberphile",
    "crashcourse", "ted-ed", "ted", "cs50", "traversy media", "kevin stratvert",
    "networkchuck", "jeff su", "thomas frank", "mkbhd", "clever programmer",
    "physics girl", "real engineering", "practical engineering", "minutephysics",
    "smarter everyday", "two minute papers", "sentdex", "corey schafer", "academind",
    "arvin ash", "tibees", "welch labs", "stand-up maths", "mathologer"
}

# Explicit Entertainment / Clickbait Channel Blocklist
ENTERTAINMENT_CHANNELS = {
    "pewdiepie", "mrbeast", "mrbeast gaming", "dude perfect", "t-series", "cocomelon",
    "set india", "sony sab", "wwe", "sidemen", "logan paul", "jake paul", "ishowspeed",
    "kai cenat", "xqc", "pokimane", "vlad and niki", "like nastya", "five minute crafts",
    "5-minute crafts", "bright side", "troom troom", "smosh", "markiplier", "jacksepticeye",
    "dantdm", "ninja", "shroud", "vanossgaming", "ssundee", "lazarbeam", "daily dose of internet"
}

# Strong Noise & Entertainment Signatures (Checked across Title, Tags & Channel)
NOISE_KEYWORDS = [
    # Music & Audio
    "music video", "official music video", "official audio", "lyric video", "remix", "vevo",
    "karaoke", "live concert", "acoustic version", "audio track", "visualizer",
    # Gaming & Walkthroughs
    "gameplay", "walkthrough", "let's play", "speedrun", "roblox", "minecraft", "fortnite",
    "gta v", "gta 5", "gta 6", "apex legends", "valorant", "warzone", "call of duty",
    "twitch clips", "stream highlights", "funny moments", "highlight reel", "boss fight",
    # Casual / Gossip / Entertainment Formats
    "prank", "reaction video", "reacting to", "reacts to", "meme", "memes", "try not to laugh",
    "daily vlog", "vlog #", "vlogs", "drama", "unboxing toys", "tiktok compilation", "tiktok trend",
    "asmr eating", "mukbang", "trailer #", "teaser trailer", "movie clips", "film clip",
    "skit", "standup comedy", "stand up comedy", "comedy central", "parody", "satire",
    "top 10 worst", "speed dating", "blind dating", "dating show", "reality show", "episode review",
    "exposed", "conspiracy theory", "creepypasta", "roasting", "unhinged", "tier list",
    "storytime", "relationship advice", "celebrity gossip", "hollywood", "paparazzi"
]

# Regex patterns for sensationalized viral / entertainment titles
CLICKBAIT_PATTERNS = [
    re.compile(r"^\s*i\s+(spent|tried|bought|survived|ate|tested|visited|stayed|challenged)\b", re.IGNORECASE),
    re.compile(r"\b(try not to laugh|blind date|speed dating|giving \$\d+|spending \$\d+|won \$\d+)\b", re.IGNORECASE),
    re.compile(r"\b(24 hours in|overnight in|last to leave|i trapped|caught on camera|caught cheating)\b", re.IGNORECASE),
    re.compile(r"\b(why i quit|why we broke up|the truth about|addressing the rumors)\b", re.IGNORECASE),
    re.compile(r"^\s*reacting to\b", re.IGNORECASE)
]

# Domain-specific academic & educational signals
DOMAIN_KEYWORDS = {
    "Science & Mathematics": [
        "calculus", "linear algebra", "derivative", "derivative of", "integral", "integrals",
        "differential equation", "differential equations", "taylor series", "fourier transform",
        "matrix multiplication", "eigenvalues", "eigenvectors", "theorem", "mathematical proof",
        "geometry", "trigonometry", "statistics", "probability distribution", "combinatorics",
        "discrete mathematics", "laplace transform", "vector calculus", "limit of", "quadratic formula",
        "quantum mechanics", "thermodynamics", "electromagnetism", "astrophysics", "general relativity",
        "special relativity", "cellular respiration", "molecular biology", "organic chemistry",
        "photosynthesis", "genetics", "dna replication", "neuroscience", "periodic table",
        "chemical reaction", "newton's laws", "conservation of energy", "optics", "fluid dynamics",
        "physics", "chemistry", "biology", "mathematics", "essence of calculus", "essence of linear algebra"
    ],
    "Tech & Engineering": [
        "programming", "tutorial", "crash course", "architecture", "data structures", "algorithms",
        "system design", "microservices", "machine learning", "deep learning", "neural network",
        "transformer model", "large language model", "fastapi", "docker", "kubernetes", "database indexing",
        "operating system", "compiler", "cryptography", "distributed systems", "python tutorial",
        "javascript", "typescript", "c++", "rust", "golang", "react tutorial", "backend development",
        "frontend development", "api design", "sql query", "nosql", "cloud computing", "devops"
    ],
    "Personal Growth & Productivity": [
        "spaced repetition", "retrieval practice", "active recall", "anki deck", "memory retention",
        "cognitive science", "deliberate practice", "study techniques", "feynman technique",
        "book summary", "atomic habits", "learning how to learn", "productivity system"
    ]
}

class ClassifierService:
    @classmethod
    def evaluate_video(cls, metadata: Dict[str, Any], transcript_snippet: str = "") -> Tuple[bool, str, str]:
        """
        Robustly classifies video into Educational (Learn) vs Noise (Entertainment)
        using multi-tier analysis:
        1. Whitelisted channels (automatic pass)
        2. Blacklisted entertainment channels & clickbait patterns (automatic reject)
        3. Noise keyword detection across title, tags, and channel
        4. YouTube category evaluation (Entertainment, Music, Gaming, Comedy default to reject)
        5. Deep domain scoring across Mathematics, Natural Sciences, Tech, and Meta-Learning
        
        Returns:
            is_educational (bool): True if genuine learning/academic content, False if entertainment.
            category (str): E.g. "Science & Mathematics", "Tech & Engineering", "Entertainment / Noise"
            reason (str): Human-readable explanation.
        """
        title = (metadata.get("title") or "").strip().lower()
        channel = (metadata.get("channel_title") or "").strip().lower()
        tags = [str(t).strip().lower() for t in (metadata.get("tags") or [])]
        category_meta = (metadata.get("category") or "").strip().lower()
        description = (metadata.get("description") or "").strip().lower()
        snippet = (transcript_snippet or "").lower()

        combined_text = f"{title} {' '.join(tags)} {channel} {description[:400]} {snippet[:1200]}"

        # -------------------------------------------------------------
        # TIER 1: Whitelist of verified educational channels
        # -------------------------------------------------------------
        for trusted in EDUCATIONAL_CHANNELS:
            if trusted in channel:
                # Detect specific category
                if any(k in combined_text for k in DOMAIN_KEYWORDS["Science & Mathematics"]):
                    cat = "Science & Mathematics"
                elif any(k in combined_text for k in DOMAIN_KEYWORDS["Tech & Engineering"]):
                    cat = "Tech & Engineering"
                else:
                    cat = "Trusted Educational Channel"
                return True, cat, f"Channel '{metadata.get('channel_title')}' is in verified educational whitelist."

        # -------------------------------------------------------------
        # TIER 2: Channel Blacklist & Sensational Clickbait Formats
        # -------------------------------------------------------------
        for bad_channel in ENTERTAINMENT_CHANNELS:
            if bad_channel in channel:
                return False, "Entertainment / Noise", f"Channel '{metadata.get('channel_title')}' is an entertainment/gaming creator."

        for pattern in CLICKBAIT_PATTERNS:
            if pattern.search(title):
                return False, "Entertainment / Clickbait", f"Title matches entertainment/clickbait format: '{title}'."

        # -------------------------------------------------------------
        # TIER 3: Noise Keyword Scan (Title, Tags, Channel)
        # -------------------------------------------------------------
        title_tags_channel = f"{title} {' '.join(tags)} {channel}"
        for noise in NOISE_KEYWORDS:
            # Match whole phrase or word boundary in title or tags
            if re.search(r"\b" + re.escape(noise) + r"\b", title_tags_channel):
                # Only allow override if title explicitly contains an intense academic marker (e.g. "Linear Algebra for Game Dev")
                academic_override = any(re.search(r"\b" + re.escape(acad) + r"\b", title) for acad in [
                    "calculus", "linear algebra", "differential equation", "mathematical proof",
                    "deep learning", "system design", "neural network", "quantum mechanics"
                ])
                if not academic_override:
                    return False, "Entertainment / Noise", f"Detected entertainment/gaming noise signature: '{noise}'."

        # -------------------------------------------------------------
        # TIER 4: Native YouTube Category Filter
        # -------------------------------------------------------------
        non_edu_categories = {
            "entertainment", "music", "gaming", "comedy", "film & animation",
            "sports", "autos & vehicles", "pets & animals", "travel & events", "people & blogs"
        }
        if category_meta in non_edu_categories:
            strong_edu_title = any(re.search(r"\b" + re.escape(kw) + r"\b", title) for kw in [
                "tutorial", "course", "lecture", "explained", "calculus", "linear algebra", "matrix",
                "physics", "proof", "architecture", "programming", "mathematics", "system design", "algorithms"
            ])
            if not strong_edu_title:
                return False, "Entertainment / Casual", f"Video categorized as YouTube '{metadata.get('category')}' without strong academic signals."

        # -------------------------------------------------------------
        # TIER 5: Deep Academic & Educational Domain Analysis
        # -------------------------------------------------------------
        math_matches = [k for k in DOMAIN_KEYWORDS["Science & Mathematics"] if re.search(r"\b" + re.escape(k) + r"\b", combined_text)]
        tech_matches = [k for k in DOMAIN_KEYWORDS["Tech & Engineering"] if re.search(r"\b" + re.escape(k) + r"\b", combined_text)]
        growth_matches = [k for k in DOMAIN_KEYWORDS["Personal Growth & Productivity"] if re.search(r"\b" + re.escape(k) + r"\b", combined_text)]

        total_domain_hits = len(math_matches) + len(tech_matches) + len(growth_matches)

        # High-precision classification
        if len(math_matches) >= 2 or (len(math_matches) >= 1 and any(re.search(r"\b" + re.escape(m) + r"\b", title) for m in DOMAIN_KEYWORDS["Science & Mathematics"])):
            return True, "Science & Mathematics", f"Detected {len(math_matches)} mathematics/science signals: {', '.join(math_matches[:3])}."

        if len(tech_matches) >= 2 or (len(tech_matches) >= 1 and any(re.search(r"\b" + re.escape(t) + r"\b", title) for t in DOMAIN_KEYWORDS["Tech & Engineering"])):
            return True, "Tech & Engineering", f"Detected {len(tech_matches)} engineering/code signals: {', '.join(tech_matches[:3])}."

        if len(growth_matches) >= 2 or (len(growth_matches) >= 1 and any(re.search(r"\b" + re.escape(g) + r"\b", title) for g in DOMAIN_KEYWORDS["Personal Growth & Productivity"])):
            return True, "Personal Growth & Productivity", f"Detected {len(growth_matches)} meta-learning/productivity signals."

        if category_meta in ["education", "science & technology"] and total_domain_hits >= 1:
            return True, "General Education", f"Verified YouTube category '{metadata.get('category')}' with relevant topic signal."

        # -------------------------------------------------------------
        # DEFAULT: Strict Drop (Do NOT let casual videos pass merely due to transcript length!)
        # -------------------------------------------------------------
        return False, "Entertainment / Casual", "Video lacks substantive academic, technical, or educational domain signals."
