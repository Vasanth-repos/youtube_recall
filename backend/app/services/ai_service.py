import json
import logging
import re
import os
from typing import Dict, Any, List, Optional
import requests
from backend.app.config import settings

logger = logging.getLogger(__name__)

RECALL_PROMPT_TEMPLATE = """You are an expert AI Video Analyst and Technical Editor.
Transform the following YouTube video transcript into a crisp, high-density, on-to-the-point smart transcript and structured notes. Eliminate all conversational rambling, filler phrases, fluff, and repetitions.

Video Title: {title}
Channel: {channel}
Duration: {duration}

Transcript with Timestamps:
{transcript_with_timestamps}

You must return ONLY a valid JSON object with the exact keys:
{{
  "summary_bullets": [
    "Ultra-crisp core takeaway 1 (direct, dense, on-point)",
    "Ultra-crisp core takeaway 2 (mechanism or practical insight)",
    "Ultra-crisp core takeaway 3 (final conclusion or rule)"
  ],
  "key_concepts": [
    "Concept 1: Definition and core essence",
    "Concept 2: Definition and core essence",
    "Concept 3: Definition and core essence",
    "Concept 4: Definition and core essence"
  ],
  "smart_transcript": [
    {{
      "timestamp_seconds": 0,
      "timestamp_label": "00:00",
      "title": "Clear Topic or Section Heading",
      "crisp_points": [
        "First direct, on-the-point bullet eliminating all verbal filler",
        "Second direct, high-value takeaway or rule"
      ],
      "polished_text": "Clean, cohesive, well-punctuated transcript text capturing what was explained without rambling."
    }}
  ],
  "topic_notes": [
    {{
      "timestamp_seconds": 0,
      "timestamp_label": "00:00",
      "title": "Clear Topic Heading",
      "summary": "Crisp one-sentence summary",
      "takeaways": ["Point 1", "Point 2"]
    }}
  ],
  "flashcards": [
    {{
      "question": "Direct recall question testing a fundamental mechanism",
      "answer": "Direct, accurate, concise answer",
      "timestamp_seconds": 0,
      "timestamp_label": "00:00"
    }}
  ],
  "final_summary": "A tight synthesis explaining the core thesis, mechanics, and value."
}}

Do not wrap in markdown quotes or extra words; output ONLY the raw JSON object.
"""

class AIService:
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
        Generates 3-bullet summary, key concepts, AI crisp smart transcript, topic notes, and final summary.
        Tries configured provider, gracefully falling back to local zero-cost NLP heuristics.
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
        if active_provider == "gemini" or (api_key and "AIza" in api_key) or settings.GEMINI_API_KEY:
            try:
                gemini_key = api_key if (api_key and "AIza" in api_key) else settings.GEMINI_API_KEY
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

        # 4. Built-in Local Zero-Cost NLP Heuristic Synthesizer (100% Free, No API Key Required)
        logger.info(f"Using built-in Local Zero-Cost NLP Synthesizer for '{title}'")
        return cls._local_heuristic_synthesis(title, channel, duration_seconds, transcript_text, chunks)

    @classmethod
    def _normalize_result(cls, data: Dict[str, Any], chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Ensures smart_transcript and topic_notes are synced and formatted properly."""
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
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        return cls._parse_json_response(response.text)

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
        try:
            cleaned = text.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            return json.loads(cleaned.strip())
        except Exception as e:
            logger.warning(f"Failed to parse model JSON: {e}. Raw snippet: {text[:200]}")
            return None

    @classmethod
    def clean_spoken_text(cls, text: str) -> str:
        """Removes verbal filler words, hesitations, and conversational noise."""
        filler_patterns = [
            r'\b(you know|like I said|as you can see|basically|kind of|sort of|right here|make sure to subscribe|in this video|let\'s get into|let\'s dive into|so yeah|honestly|actually|obviously)\b',
            r'\b(um+|uh+|er+|ah+)\b',
            r'\s+',
        ]
        cleaned = text
        for p in filler_patterns[:-1]:
            cleaned = re.sub(p, '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        # Capitalize first letter
        if cleaned:
            cleaned = cleaned[0].upper() + cleaned[1:]
        return cleaned

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
        Robust 100% Free Local NLP Synthesizer.
        Generates a crisp smart transcript, high-density section takeaways,
        key concepts, and executive summaries.
        """
        sentences = [s.strip() for s in re.split(r'(?<=[.!?]) +', transcript_text) if len(s.strip()) > 20]
        if not sentences:
            sentences = [title]

        stopwords = {
            "the", "and", "a", "an", "in", "to", "of", "is", "that", "it", "this", "for", "with",
            "as", "on", "was", "are", "be", "at", "by", "from", "you", "we", "they", "i", "or",
            "which", "so", "what", "all", "were", "there", "when", "can", "your", "my", "if",
            "about", "how", "just", "like", "into", "then", "more", "also", "some", "other",
            "really", "going", "know", "think", "see", "want", "look", "time", "way", "subscribe",
            "channel", "video", "today", "show"
        }

        # Calculate word frequencies for sentence scoring
        word_freq: Dict[str, int] = {}
        for s in sentences:
            for w in re.findall(r'\b[a-zA-Z]{4,}\b', s.lower()):
                if w not in stopwords:
                    word_freq[w] = word_freq.get(w, 0) + 1

        def score_sentence(sent: str) -> float:
            words = [w for w in re.findall(r'\b[a-zA-Z]{4,}\b', sent.lower()) if w not in stopwords]
            if not words:
                return 0.0
            return sum(word_freq.get(w, 0) for w in words) / (len(words) ** 0.5)

        scored_sentences = sorted(sentences, key=score_sentence, reverse=True)

        # 1. 3-Bullet Executive Takeaways (High Signal, No Fluff)
        bullets = []
        for s in scored_sentences:
            cleaned_s = cls.clean_spoken_text(s)
            if cleaned_s and cleaned_s not in bullets and len(cleaned_s) > 35:
                bullets.append(cleaned_s)
            if len(bullets) == 3:
                break
        if len(bullets) < 3:
            bullets.extend([
                f"Core insight from '{title}' by {channel}.",
                "Detailed breakdown of fundamental mechanics and reasoning.",
                "Actionable takeaways and direct practical implications."
            ][len(bullets):])

        # 2. Key Concepts & Definitions
        top_terms = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:8]
        key_concepts = []
        for term, freq in top_terms[:5]:
            sample = next((s for s in sentences if re.search(r'\b' + re.escape(term) + r'\b', s, re.IGNORECASE)), "")
            if sample:
                cleaned_sample = cls.clean_spoken_text(sample)
                key_concepts.append(f"{term.capitalize()}: {cleaned_sample[:130]}...")
            else:
                key_concepts.append(f"{term.capitalize()}: Fundamental concept analyzed in this video.")

        # 3. AI Crisp Smart Transcript (Section by Section with Timestamps & Direct Points)
        smart_transcript = []
        topic_notes = []

        if chunks:
            for idx, chunk in enumerate(chunks):
                raw_chunk_text = chunk.get("content", "")
                chunk_sentences = [cls.clean_spoken_text(s.strip()) for s in re.split(r'(?<=[.!?]) +', raw_chunk_text) if len(s.strip()) > 15]
                
                # Derive crisp points for this section
                chunk_scored = sorted(chunk_sentences, key=score_sentence, reverse=True)
                crisp_points = []
                for cs in chunk_scored:
                    if cs and cs not in crisp_points and len(cs) > 25:
                        crisp_points.append(cs)
                    if len(crisp_points) == 3:
                        break
                if not crisp_points and chunk_sentences:
                    crisp_points = [chunk_sentences[0]]

                # Derive clean section title
                chunk_words = [w for w in re.findall(r'\b[a-zA-Z]{4,}\b', raw_chunk_text.lower()) if w not in stopwords]
                chunk_freq = {}
                for w in chunk_words:
                    chunk_freq[w] = chunk_freq.get(w, 0) + 1
                top_chunk_words = sorted(chunk_freq.items(), key=lambda x: x[1], reverse=True)[:2]
                if top_chunk_words:
                    section_title = f"{top_chunk_words[0][0].capitalize()}" + (f" & {top_chunk_words[1][0].capitalize()}" if len(top_chunk_words) > 1 else "")
                else:
                    section_title = f"Topic Section {idx + 1}"

                ts_sec = int(chunk.get("start", 0))
                ts_lbl = chunk.get("timestamp_label", "00:00")
                polished_text = cls.clean_spoken_text(" ".join(chunk_sentences[:4]))

                section_entry = {
                    "timestamp_seconds": ts_sec,
                    "timestamp_label": ts_lbl,
                    "jump_url": chunk.get("jump_url", f"https://www.youtube.com/watch?v={title}&t={ts_sec}s"),
                    "title": f"{section_title} ({ts_lbl})",
                    "crisp_points": crisp_points,
                    "polished_text": polished_text
                }
                smart_transcript.append(section_entry)

                topic_notes.append({
                    "timestamp_seconds": ts_sec,
                    "timestamp_label": ts_lbl,
                    "title": section_title,
                    "summary": crisp_points[0] if crisp_points else polished_text[:100],
                    "takeaways": crisp_points
                })
        else:
            smart_transcript.append({
                "timestamp_seconds": 0,
                "timestamp_label": "00:00",
                "jump_url": "",
                "title": "Full Overview",
                "crisp_points": bullets,
                "polished_text": cls.clean_spoken_text(transcript_text[:500])
            })
            topic_notes.append({
                "timestamp_seconds": 0,
                "timestamp_label": "00:00",
                "title": "Full Overview",
                "summary": bullets[0],
                "takeaways": bullets
            })

        # 4. Final Crisp Summary
        final_summary = (
            f"This video, '{title}' by {channel}, focuses on core mechanisms. "
            f"Key Takeaway: {bullets[0]} "
            f"Key principles discussed include {', '.join(t[0].capitalize() for t in top_terms[:3])}. "
            f"Practical Conclusion: {bullets[-1]}"
        )

        # High-yield Q&A pairs for active recall if needed
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
