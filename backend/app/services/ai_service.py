import json
import logging
import re
import os
from typing import Dict, Any, List, Optional
import requests
from backend.app.config import settings

logger = logging.getLogger(__name__)

RECALL_PROMPT_TEMPLATE = """You are an expert AI Micro-Learning and Retrieval Practice tutor.
Analyze the following YouTube video transcript and produce high-retention study assets.

Video Title: {title}
Channel: {channel}
Duration: {duration}

Transcript with Timestamps:
{transcript_with_timestamps}

You must return ONLY a valid JSON object with the exact keys:
{{
  "summary_bullets": [
    "First crisp takeaway with core insight",
    "Second key actionable principle or mechanism",
    "Third concluding takeaway or implication"
  ],
  "key_concepts": [
    "Concept 1: Definition and importance",
    "Concept 2: Definition and importance",
    "Concept 3: Definition and importance",
    "Concept 4: Definition and importance"
  ],
  "topic_notes": [
    {{
      "timestamp_seconds": 0,
      "timestamp_label": "00:00",
      "title": "Topic or Section Title",
      "summary": "Concise summary of this section",
      "takeaways": ["Specific point 1", "Specific point 2"]
    }}
  ],
  "flashcards": [
    {{
      "question": "Clear, active recall question testing a fundamental mechanism or fact",
      "answer": "Direct, accurate, concise answer",
      "timestamp_seconds": 120,
      "timestamp_label": "02:00"
    }}
  ],
  "final_summary": "A cohesive 2-3 paragraph synthesis explaining the 'why', 'how', and practical value of this video."
}}

Generate at least 4-8 high-yield active recall flashcards.
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
        Generates 3-bullet summary, key concepts, topic notes, flashcards, and final summary.
        Tries configured provider, gracefully falling back to local zero-cost NLP heuristics.
        """
        active_provider = provider or settings.DEFAULT_AI_PROVIDER
        
        # Format transcript excerpt with timestamps
        formatted_chunks = []
        for c in chunks[:12]: # Cap context to fit tokens comfortably
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
                    return result
            except Exception as e:
                logger.error(f"Gemini API call failed, falling back: {e}")

        # 2. Try Groq Free Tier
        if active_provider == "groq" or (api_key and api_key.startswith("gsk_")) or settings.GROQ_API_KEY:
            try:
                groq_key = api_key if (api_key and api_key.startswith("gsk_")) else settings.GROQ_API_KEY
                result = cls._call_groq(prompt, groq_key)
                if result:
                    return result
            except Exception as e:
                logger.error(f"Groq API call failed, falling back: {e}")

        # 3. Try Ollama (Local free)
        if active_provider == "ollama":
            try:
                result = cls._call_ollama(prompt)
                if result:
                    return result
            except Exception as e:
                logger.error(f"Ollama local call failed, falling back: {e}")

        # 4. Built-in Local Zero-Cost NLP Heuristic Synthesizer (100% Free, No API Key Required)
        logger.info(f"Using built-in Local Zero-Cost NLP Synthesizer for '{title}'")
        return cls._local_heuristic_synthesis(title, channel, duration_seconds, transcript_text, chunks)

    @classmethod
    def _call_gemini(cls, prompt: str, api_key: str) -> Optional[Dict[str, Any]]:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        # Prefer gemini-2.0-flash or gemini-1.5-flash (free on AI Studio)
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
            "temperature": 0.3
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
            # Clean possible markdown fence blocks
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
        Extracts salient sentences, key terms, creates timestamped topic notes,
        and generates high-yield active recall flashcards directly from content.
        """
        # Split sentences
        sentences = [s.strip() for s in re.split(r'(?<=[.!?]) +', transcript_text) if len(s.strip()) > 25]
        if not sentences:
            sentences = [title]

        # Stopwords for keyword scoring
        stopwords = {
            "the", "and", "a", "an", "in", "to", "of", "is", "that", "it", "this", "for", "with",
            "as", "on", "was", "are", "be", "at", "by", "from", "you", "we", "they", "i", "or",
            "which", "so", "what", "all", "were", "there", "when", "can", "your", "my", "if",
            "about", "how", "just", "like", "into", "then", "more", "also", "some", "other",
            "really", "going", "know", "think", "see", "want", "look", "time", "way"
        }

        # Calculate word frequencies
        word_freq: Dict[str, int] = {}
        for s in sentences:
            for w in re.findall(r'\b[a-zA-Z]{4,}\b', s.lower()):
                if w not in stopwords:
                    word_freq[w] = word_freq.get(w, 0) + 1

        # Score sentences
        def score_sentence(sent: str) -> float:
            words = [w for w in re.findall(r'\b[a-zA-Z]{4,}\b', sent.lower()) if w not in stopwords]
            if not words:
                return 0.0
            return sum(word_freq.get(w, 0) for w in words) / (len(words) ** 0.5)

        scored_sentences = sorted(sentences, key=score_sentence, reverse=True)

        # 1. 3-Bullet Summary
        bullets = []
        for s in scored_sentences:
            if s not in bullets and len(s) > 40:
                bullets.append(s)
            if len(bullets) == 3:
                break
        if len(bullets) < 3:
            bullets.extend([f"Key overview of {title}", f"In-depth discussion by {channel}", "Core concepts and actionable takeaways."][len(bullets):])

        # 2. Key Concepts (Top keywords with context)
        top_terms = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:8]
        key_concepts = []
        for term, freq in top_terms[:5]:
            # find an exemplary sentence using this term
            sample = next((s for s in sentences if re.search(r'\b' + re.escape(term) + r'\b', s, re.IGNORECASE)), "")
            if sample:
                key_concepts.append(f"{term.capitalize()}: {sample[:120]}...")
            else:
                key_concepts.append(f"{term.capitalize()}: Fundamental component highlighted throughout the discussion.")

        # 3. Topic Notes from Chunks
        topic_notes = []
        if chunks:
            for idx, chunk in enumerate(chunks[:8]):
                chunk_sentences = [s.strip() for s in re.split(r'(?<=[.!?]) +', chunk.get("content", "")) if len(s.strip()) > 20]
                summary_line = chunk_sentences[0] if chunk_sentences else f"Key section covering part {idx + 1}"
                topic_notes.append({
                    "timestamp_seconds": int(chunk.get("start", 0)),
                    "timestamp_label": chunk.get("timestamp_label", "00:00"),
                    "title": f"Section {idx + 1} ({chunk.get('timestamp_label', '00:00')})",
                    "summary": summary_line,
                    "takeaways": chunk_sentences[1:3] if len(chunk_sentences) > 1 else [summary_line]
                })
        else:
            topic_notes.append({
                "timestamp_seconds": 0,
                "timestamp_label": "00:00",
                "title": "Introduction & Overview",
                "summary": bullets[0] if bullets else title,
                "takeaways": bullets[1:3] if len(bullets) > 1 else ["Core principles"]
            })

        # 4. High-yield Active Recall Flashcards
        flashcards = []
        # Question 1: Central thesis
        flashcards.append({
            "question": f"What is the primary objective or premise discussed in '{title}'?",
            "answer": bullets[0],
            "timestamp_seconds": topic_notes[0]["timestamp_seconds"] if topic_notes else 0,
            "timestamp_label": topic_notes[0]["timestamp_label"] if topic_notes else "00:00"
        })

        # Question from top concepts
        for idx, (term, _) in enumerate(top_terms[:4]):
            match_chunk = next((c for c in chunks if term.lower() in c.get("content", "").lower()), None)
            ts_sec = int(match_chunk["start"]) if match_chunk else (idx * 60)
            ts_lbl = match_chunk["timestamp_label"] if match_chunk else f"0{idx}:00"
            
            sample_sent = next((s for s in sentences if re.search(r'\b' + re.escape(term) + r'\b', s, re.IGNORECASE)), "")
            if sample_sent:
                flashcards.append({
                    "question": f"How does the speaker explain or apply '{term.capitalize()}' in this context?",
                    "answer": sample_sent,
                    "timestamp_seconds": ts_sec,
                    "timestamp_label": ts_lbl
                })

        # Final question on conclusion/takeaway
        if len(bullets) >= 3:
            flashcards.append({
                "question": "What is the critical takeaway or action item recommended at the end of the video?",
                "answer": bullets[-1],
                "timestamp_seconds": topic_notes[-1]["timestamp_seconds"] if topic_notes else 0,
                "timestamp_label": topic_notes[-1]["timestamp_label"] if topic_notes else "00:00"
            })

        # 5. Final Summary
        final_summary = (
            f"This video, '{title}' by {channel}, provides a structured exploration of key ideas. "
            f"The primary takeaway is: {bullets[0]} "
            f"Key principles discussed include {', '.join(t[0].capitalize() for t in top_terms[:3])}. "
            f"Practically, the concepts culminate in: {bullets[-1]}"
        )

        return {
            "summary_bullets": bullets[:3],
            "key_concepts": key_concepts,
            "topic_notes": topic_notes,
            "flashcards": flashcards,
            "final_summary": final_summary
        }
