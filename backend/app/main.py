import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.app.database import init_db
from backend.app.routers import videos, flashcards, export, settings, youtube_auth
from backend.app.config import settings as app_settings

# Initialize DB tables
init_db()

app = FastAPI(
    title="AI Micro-Learning & Spaced Repetition Ecosystem for YouTube",
    description="Automated capture, transcript chunking, AI flashcards, and spaced repetition practice.",
    version="1.0.0"
)

# CORS enabled for Chrome Extension (chrome-extension://*) and local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(videos.router)
app.include_router(flashcards.router)
app.include_router(export.router)
app.include_router(settings.router)
app.include_router(youtube_auth.router)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "YouTube Recall & Spaced Repetition Engine",
        "default_ai_provider": app_settings.DEFAULT_AI_PROVIDER,
        "free_tier_ready": True
    }

# Serve Frontend static directory if exists
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    def serve_frontend_root():
        index_file = FRONTEND_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return {"message": "Frontend index.html not found"}

