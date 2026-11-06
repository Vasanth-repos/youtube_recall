import json
import logging
import re
import os
from typing import Dict, Any, List, Optional
import requests
from backend.app.config import settings

logger = logging.getLogger(__name__)

RECALL_PROMPT_TEMPLATE = """You are a World-Class Technical Editor and Educator (like a senior editor for an MIT textbook or high-end technical publication).
Your task is to transform this raw, conversational YouTube spoken transcript into an exceptionally clean, lucid, authoritative, and easy-to-understand study guide.

Raw spoken language is filled with conversational fluff, hesitations ("um", "uh", "you know"), rhetorical preambles ("well first of all", "so let's look at"), personal tangents, and run-on sentences.
REWRITE and POLISH this content so that it reads like an authoritative, crystal-clear textbook chapter or essay.

Video Title: {title}
Channel: {channel}
Duration: {duration}

Transcript with Timestamps:
{transcript_with_timestamps}

You must return ONLY a valid JSON object with the exact keys:
{{
  "summary_bullets": [
    "Ultra-crisp core takeaway 1: Direct, dense explanation of the central premise or mechanism.",
    "Ultra-crisp core takeaway 2: Essential mathematical, algorithmic, or structural insight.",
    "Ultra-crisp core takeaway 3: Final practical implication, rule, or theorem."
  ],
  "key_concepts": [
    "Concept 1: Clear, concise definition and why it matters",
    "Concept 2: Clear, concise definition and why it matters",
    "Concept 3: Clear, concise definition and why it matters",
    "Concept 4: Clear, concise definition and why it matters"
  ],
  "smart_transcript": [
    {{
      "timestamp_seconds": 0,
      "timestamp_label": "00:00",
      "title": "Clean, Descriptive Chapter Heading (e.g. 'Matching Tangent Slopes & First Derivatives')",
      "crisp_points": [
        "First direct, on-the-point takeaway explaining the exact concept without verbal filler",
        "Second direct, high-value takeaway or rule"
      ],
      "polished_text": "A beautifully written, easy-to-understand explanation of what was taught in this chapter. It must read like an elegant, professionally edited textbook or article."
    }}
  ],
  "topic_notes": [
    {{
      "timestamp_seconds": 0,
      "timestamp_label": "00:00",
      "title": "Clean Chapter Heading",
      "summary": "Crisp one-sentence summary",
      "takeaways": ["Point 1", "Point 2"]
    }}
  ],
  "flashcards": [
    {{
      "question": "Clear, direct recall question testing a fundamental mechanism",
      "answer": "Direct, accurate, concise answer",
      "timestamp_seconds": 0,
      "timestamp_label": "00:00"
    }}
  ],
  "final_summary": "A cohesive, 2-paragraph synthesis explaining the core thesis, mechanics, and value."
}}

Do not wrap in markdown quotes or extra words; output ONLY the raw JSON object.
"""

CONVERSATIONAL_PREAMBLES = [
    r'^(well,?\s*(first of all|basically|you see|actually|obviously|frankly|in fact)?\s*,?\s*)',
    r'^(so,?\s*(let\'s take a look at|let\'s really|what we want to do is|what you want to do is|what we\'re doing here is|now)?\s*)',
    r'^(now,?\s*(it would also be good if|let\'s look at|remember that|working with|if you)?\s*)',
    r'^(and when you work that out,?\s*)',
    r'^(and for that,?\s*)',
    r'^(then,?\s*taking the\s*)',
    r'^(what we\'re going to do here is\s*)',
    r'^(it turns out that\s*)',
    r'^(i think (that )?one of the (first )?times (this clicked for me|we see this)( as a student)? was\s*)',
    r'^(and what (that )?basically means is that\s*)',
    r'^(you know,?\s*(like i said (before)?|as you can see|as you know)?\s*,?\s*)',
    r'^(if you take a look at (the|this|that)?\s*)',
    r'^(let\'s take a look at (that|this)\s*)',
    r'^(so let\'s take a look at\s*)',
    r'^(the thing you have to understand is that\s*)',
    r'^(one thing that\'s really important to keep in mind is that\s*)'
]

INLINE_FILLERS = [
    r'\b(you know|like i said|as you can see|basically|kind of|sort of|right here|make sure to remember that|make sure to subscribe|in this video|let\'s get into|let\'s dive into|so yeah|honestly|actually|obviously|frankly)\b',
    r'\b(um+|uh+|er+|ah+)\b',
    r'\b(and really take a moment to think about)\b',
    r'\b(at the end of the day)\b',
    r'\b(needless to say)\b'
]

PERSONAL_ANECDOTE_PATTERNS = [
    r'\b(when i first learned|clicked for me as a student|in a calculus class i took|we were studying a certain|welcome back to the channel|don\'t forget to like|leave a comment below|let me pull up my)\b'
]

class AIService:
    @classmethod
    def clean_and_distill_sentence(cls, s: str) -> str:
        """Strips spoken preambles, eliminates fillers, and cleans technical/math notation."""
        if not s:
            return ""
        cleaned = s.strip()

        # 1. Strip conversational preambles
        for pat in CONVERSATIONAL_PREAMBLES:
            cleaned = re.sub(pat, '', cleaned, flags=re.IGNORECASE).strip()

        # 2. Strip inline fillers
        for pat in INLINE_FILLERS:
            cleaned = re.sub(pat, '', cleaned, flags=re.IGNORECASE).strip()

        # 3. Clean mathematical and technical notations
        cleaned = re.sub(r'^(that|this) function,?\s*(cos\([a-zA-Z0-9]+\)|sin\([a-zA-Z0-9]+\)|cosine of [a-zA-Z0-9]+|[a-zA-Z0-9()]+)?,?\s*(and really take a moment to think about)?\s*(how (you|one|we) might construct|how to construct|how you construct)?\s*', 'Constructing ', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'^(Constructing\s+)+(construct\s+)?', 'Constructing ', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'^(our|the) approximation (had|should have|must have)\s*', r'Matching ', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'^(so\s+)?our polynomial approximation should (also\s+)?have\s*', r'The polynomial approximation must have ', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\bcosine of ([a-zA-Z]+)\b', r'cos(\1)', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\bsine of ([a-zA-Z]+)\b', r'sin(\1)', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\btangent of ([a-zA-Z]+)\b', r'tan(\1)', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\bcosine\s+X\b', 'cos(x)', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\bcos\(X\)\b', 'cos(x)', cleaned)
        cleaned = re.sub(r'\bsin\(X\)\b', 'sin(x)', cleaned)
        cleaned = re.sub(r'\b([a-zA-Z]+) equals ([0-9]+)\b', r'\1 = \2', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\bX = ([0-9a-zA-Z]+)\b', r'x = \1', cleaned)
        cleaned = re.sub(r'\b([a-zA-Z]+) squared\b', r'\1²', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\b([a-zA-Z]+) cubed\b', r'\1³', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\b([cC])\s*([0-9])\b', r'\1\2', cleaned)

        # 4. Clean spacing & punctuation
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        cleaned = re.sub(r'\s+([,.:;?!])', r'\1', cleaned)
        cleaned = re.sub(r',,+', ',', cleaned)

        if cleaned and not cleaned.endswith(('.', '!', '?')):
            cleaned += '.'

        if cleaned:
            cleaned = cleaned[0].upper() + cleaned[1:]

        return cleaned

    @classmethod
    def is_substantive_sentence(cls, s: str) -> bool:
        """Filters out personal anecdotes, rhetorical questions, and conversational fluff."""
        s_lower = s.lower()
        if len(s.strip()) < 15:
            return False
        for pat in PERSONAL_ANECDOTE_PATTERNS:
            if re.search(pat, s_lower):
                return False
        return True

    @classmethod
    def generate_recall_assets(
        cls,
        title: str,
        channel: str,
        duration_seconds: int,
        transcript_text: str,
        chunks: List[Dict[str, Any]],
        provider: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generates clean, easy-to-understand smart transcript, crisp section takeaways,
        key concepts, and executive summaries.
        """
        active_provider = provider or settings.DEFAULT_AI_PROVIDER
        
        # Format transcript excerpt with timestamps
        formatted_chunks = []
        for c in chunks[:14]:
            formatted_chunks.append(f"[{c.get('timestamp_label', '00:00')}] {c.get('content', '')}")
        transcript_context = "\n\n".join(formatted_chunks) if formatted_chunks else transcript_text[:8000]

        prompt = RECALL_PROMPT_TEMPLATE.format(
            title=title,
            channel=channel,
            duration=f"{duration_seconds // 60}m {duration_seconds % 60}s",
            transcript_with_timestamps=transcript_context
        )

        # 1. Try Gemini Free Tier
        gemini_key = api_key or settings.GEMINI_API_KEY
        if (active_provider == "gemini" or gemini_key) and gemini_key:
            try:
                result = cls._call_gemini(prompt, gemini_key)
                if result:
                    return cls._normalize_result(result, chunks)
            except Exception as e:
                logger.error(f"Gemini API call failed, falling back: {e}")

        # 2. Try Groq Free Tier
        if active_provider == "groq" or (api_key and api_key.startswith("gsk_")) or settings.GROQ_API_KEY:
            try:
                groq_key = api_key if (api_key and api_key.startswith("gsk_")) else settings.GROQ_API_KEY
                result = cls._call_groq(prompt, groq_key)
                if result:
                    return cls._normalize_result(result, chunks)
            except Exception as e:
                logger.error(f"Groq API call failed, falling back: {e}")

        # 3. Try Ollama (Local free)
        if active_provider == "ollama":
            try:
                result = cls._call_ollama(prompt)
                if result:
                    return cls._normalize_result(result, chunks)
            except Exception as e:
                logger.error(f"Ollama local call failed, falling back: {e}")

        # 4. Built-in High-Precision Local Zero-Cost Synthesizer (100% Free, Offline)
        logger.info(f"Using high-precision Local Synthesizer for '{title}'")
        return cls._local_heuristic_synthesis(title, channel, duration_seconds, transcript_text, chunks)

    @classmethod
    def _normalize_result(cls, data: Dict[str, Any], chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Ensures smart_transcript and topic_notes are synced and cleanly formatted."""
        smart_transcript = data.get("smart_transcript") or []
        if not smart_transcript and data.get("topic_notes"):
            smart_transcript = []
            for t in data.get("topic_notes", []):
                smart_transcript.append({
                    "timestamp_seconds": t.get("timestamp_seconds", 0),
                    "timestamp_label": t.get("timestamp_label", "00:00"),
                    "title": t.get("title", "Section"),
                    "crisp_points": t.get("takeaways", [t.get("summary", "")]),
                    "polished_text": t.get("summary", "")
                })
        data["smart_transcript"] = smart_transcript
        if not data.get("topic_notes"):
            data["topic_notes"] = smart_transcript
        return data

    @classmethod
    def _call_gemini(cls, prompt: str, api_key: str) -> Optional[Dict[str, Any]]:
        """Calls Google AI Studio / Gemini API using candidate models with automatic fallback."""
        candidate_models = ["gemini-3.5-flash", "gemini-3.5-flash-lite"]
        for model in candidate_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "response_mime_type": "application/json",
                    "temperature": 0.2
                }
            }
            try:
                resp = requests.post(url, json=payload, timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            text = parts[0].get("text", "")
                            parsed = cls._parse_json_response(text)
                            if parsed:
                                logger.info(f"Successfully synthesized recall notes with Google AI Studio model '{model}'")
                                return parsed
                else:
                    logger.warning(f"Gemini model {model} returned HTTP {resp.status_code}: {resp.text[:180]}")
            except Exception as err:
                logger.warning(f"Error querying Gemini model {model}: {err}")
        return None

    @classmethod
    def _call_groq(cls, prompt: str, api_key: str) -> Optional[Dict[str, Any]]:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            "temperature": 0.2
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        if resp.status_code == 200:
            content = resp.json()["choices"][0]["message"]["content"]
            return cls._parse_json_response(content)
        return None

    @classmethod
    def _call_ollama(cls, prompt: str) -> Optional[Dict[str, Any]]:
        url = f"{settings.OLLAMA_BASE_URL}/api/generate"
        payload = {
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "format": "json"
        }
        resp = requests.post(url, json=payload, timeout=60)
        if resp.status_code == 200:
            return cls._parse_json_response(resp.json().get("response", ""))
        return None

    @staticmethod
    def _parse_json_response(text: str) -> Optional[Dict[str, Any]]:
        if not text:
            return None
        cleaned = text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        # 1. Standard JSON parse
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

        # 2. Repair invalid LaTeX / mathematical notation escapes (e.g. \cos, \frac, \sum, \int, \alpha)
        try:
            repaired = re.sub(r'\\([^"\\/bfnrtu])', r'\\\\\1', cleaned)
            return json.loads(repaired)
        except json.JSONDecodeError:
            pass

        # 3. Non-strict parse for unescaped control characters
        try:
            repaired = re.sub(r'\\([^"\\/bfnrtu])', r'\\\\\1', cleaned)
            return json.loads(repaired, strict=False)
        except Exception as e:
            logger.warning(f"Failed to parse model JSON: {e}. Raw snippet: {text[:200]}")
            return None

    @classmethod
    def _local_heuristic_synthesis(
        cls,
        title: str,
        channel: str,
        duration_seconds: int,
        transcript_text: str,
        chunks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        High-Precision Local Synthesizer:
        Transforms spoken transcripts into clean, lucid, easy-to-understand reading material.
        Eliminates conversational clutter, extracts dense technical points, and structures paragraphs.
        """
        # Split sentences reliably
        raw_sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', transcript_text) if len(s.strip()) > 15]
        if not raw_sentences:
            raw_sentences = [title]

        # Stopwords
        stopwords = {
            "the", "and", "a", "an", "in", "to", "of", "is", "that", "it", "this", "for", "with",
            "as", "on", "was", "are", "be", "at", "by", "from", "you", "we", "they", "i", "or",
            "which", "so", "what", "all", "were", "there", "when", "can", "your", "my", "if",
            "about", "how", "just", "like", "into", "then", "more", "also", "some", "other",
            "really", "going", "know", "think", "see", "want", "look", "time", "way", "subscribe",
            "channel", "video", "today", "show", "first", "well", "now", "here"
        }

        # Calculate informative word frequencies
        word_freq: Dict[str, int] = {}
        for s in raw_sentences:
            if cls.is_substantive_sentence(s):
                for w in re.findall(r'\b[a-zA-Z]{4,}\b', s.lower()):
                    if w not in stopwords:
                        word_freq[w] = word_freq.get(w, 0) + 1

        def score_sentence(sent: str) -> float:
            if not cls.is_substantive_sentence(sent):
                return -10.0
            words = [w for w in re.findall(r'\b[a-zA-Z]{4,}\b', sent.lower()) if w not in stopwords]
            if not words:
                return 0.0
            score = sum(word_freq.get(w, 0) for w in words) / (len(words) ** 0.5)
            # Boost definitions and mathematical statements
            if any(k in sent.lower() for k in ["derivative", "approximation", "equals", "formula", "tangent", "curve", "slope", "algorithm", "because", "therefore"]):
                score *= 1.4
            return score

        scored_sentences = sorted(raw_sentences, key=score_sentence, reverse=True)

        # 1. Executive 3-Bullet Takeaways (Spanning Beginning, Middle & Conclusion)
        n = len(raw_sentences)
        thirds = [
            raw_sentences[:max(1, n // 3)],
            raw_sentences[max(1, n // 3):max(2, 2 * n // 3)],
            raw_sentences[max(2, 2 * n // 3):]
        ]
        
        bullets = []
        for part in thirds:
            part_scored = sorted(part, key=score_sentence, reverse=True)
            for s in part_scored:
                cleaned = cls.clean_and_distill_sentence(s)
                if cleaned and cleaned not in bullets and len(cleaned) > 35:
                    bullets.append(cleaned)
                    break

        if len(bullets) < 3:
            for s in scored_sentences:
                cleaned = cls.clean_and_distill_sentence(s)
                if cleaned and cleaned not in bullets and len(cleaned) > 35:
                    bullets.append(cleaned)
                if len(bullets) == 3:
                    break

        if len(bullets) < 3:
            bullets.extend([
                f"Core mechanism of {title}.",
                "Mathematical and conceptual framework for functional approximation.",
                "Actionable takeaways for modeling and technical application."
            ][len(bullets):])

        # 2. Key Concepts & Definitions
        top_terms = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:8]
        key_concepts = []
        for term, freq in top_terms[:5]:
            match_sentence = next((s for s in raw_sentences if re.search(r'\b' + re.escape(term) + r'\b', s, re.IGNORECASE) and cls.is_substantive_sentence(s)), "")
            if match_sentence:
                cleaned_match = cls.clean_and_distill_sentence(match_sentence)
                key_concepts.append(f"{term.capitalize()}: {cleaned_match}")
            else:
                key_concepts.append(f"{term.capitalize()}: Core concept analyzed in this section.")

        # 3. AI Smart Transcript (Section by Section with Timestamps, Crisp Points, and Polished Prose)
        smart_transcript = []
        topic_notes = []

        if chunks:
            for idx, chunk in enumerate(chunks):
                raw_chunk_text = chunk.get("content", "")
                chunk_raw_sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', raw_chunk_text) if len(s.strip()) > 15]
                
                # Filter & score sentences in this chunk
                substantive_sentences = [s for s in chunk_raw_sentences if cls.is_substantive_sentence(s)]
                if not substantive_sentences:
                    substantive_sentences = chunk_raw_sentences

                sorted_chunk_sentences = sorted(substantive_sentences, key=score_sentence, reverse=True)
                
                # Extract 2-4 clean crisp points
                crisp_points = []
                for cs in sorted_chunk_sentences:
                    cleaned_pt = cls.clean_and_distill_sentence(cs)
                    if cleaned_pt and cleaned_pt not in crisp_points and len(cleaned_pt) > 25:
                        crisp_points.append(cleaned_pt)
                    if len(crisp_points) == 3:
                        break

                if not crisp_points and chunk_raw_sentences:
                    crisp_points = [cls.clean_and_distill_sentence(chunk_raw_sentences[0])]

                # Generate clean readable paragraphs (3-4 cleaned sentences)
                polished_sentences = []
                for cs in chunk_raw_sentences[:5]:
                    if cls.is_substantive_sentence(cs):
                        polished_sentences.append(cls.clean_and_distill_sentence(cs))

                polished_text = " ".join(polished_sentences) if polished_sentences else cls.clean_and_distill_sentence(raw_chunk_text[:300])

                # Descriptive Chapter Heading
                chunk_words = [w for w in re.findall(r'\b[a-zA-Z]{4,}\b', raw_chunk_text.lower()) if w not in stopwords]
                chunk_freq = {}
                for w in chunk_words:
                    chunk_freq[w] = chunk_freq.get(w, 0) + 1
                top_chunk_words = sorted(chunk_freq.items(), key=lambda x: x[1], reverse=True)[:2]
                
                if top_chunk_words:
                    section_title = f"{top_chunk_words[0][0].capitalize()}" + (f" & {top_chunk_words[1][0].capitalize()}" if len(top_chunk_words) > 1 else "")
                else:
                    section_title = f"Topic Overview {idx + 1}"

                ts_sec = int(chunk.get("start", 0))
                ts_lbl = chunk.get("timestamp_label", "00:00")

                entry = {
                    "timestamp_seconds": ts_sec,
                    "timestamp_label": ts_lbl,
                    "jump_url": chunk.get("jump_url", f"https://www.youtube.com/watch?v={title}&t={ts_sec}s"),
                    "title": f"{section_title} ({ts_lbl})",
                    "crisp_points": crisp_points,
                    "polished_text": polished_text
                }
                smart_transcript.append(entry)

                topic_notes.append({
                    "timestamp_seconds": ts_sec,
                    "timestamp_label": ts_lbl,
                    "title": section_title,
                    "summary": crisp_points[0] if crisp_points else polished_text[:120],
                    "takeaways": crisp_points
                })
        else:
            smart_transcript.append({
                "timestamp_seconds": 0,
                "timestamp_label": "00:00",
                "jump_url": "",
                "title": "Complete Overview",
                "crisp_points": bullets,
                "polished_text": cls.clean_and_distill_sentence(transcript_text[:500])
            })
            topic_notes.append({
                "timestamp_seconds": 0,
                "timestamp_label": "00:00",
                "title": "Complete Overview",
                "summary": bullets[0],
                "takeaways": bullets
            })

        # 4. Final Comprehensive Synthesis
        final_summary = (
            f"In '{title}' by {channel}, the content revolves around core mathematical and computational mechanisms. "
            f"Primary Takeaway: {bullets[0]} "
            f"The analysis systematically explores {', '.join(t[0].capitalize() for t in top_terms[:3])}, "
            f"demonstrating that {bullets[-1]}"
        )

        # High-yield Q&A pairs for active recall if requested
        flashcards = [
            {"question": f"What is the primary premise discussed in '{title}'?", "answer": bullets[0], "timestamp_seconds": smart_transcript[0]["timestamp_seconds"] if smart_transcript else 0, "timestamp_label": smart_transcript[0]["timestamp_label"] if smart_transcript else "00:00"},
            {"question": f"What is the key takeaway or conclusion in '{title}'?", "answer": bullets[-1], "timestamp_seconds": smart_transcript[-1]["timestamp_seconds"] if smart_transcript else 0, "timestamp_label": smart_transcript[-1]["timestamp_label"] if smart_transcript else "00:00"}
        ]

        return {
            "summary_bullets": bullets[:3],
            "key_concepts": key_concepts,
            "smart_transcript": smart_transcript,
            "topic_notes": topic_notes,
            "flashcards": flashcards,
            "final_summary": final_summary
        }
