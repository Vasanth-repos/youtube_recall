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

# Private Network Access header support for Chrome
@app.middleware("http")
async def add_private_network_headers(request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

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

    @app.get("/manifest.webmanifest")
    def serve_manifest():
        manifest_file = FRONTEND_DIR / "manifest.webmanifest"
        if manifest_file.exists():
            return FileResponse(manifest_file, media_type="application/manifest+json")
        return {"error": "Manifest not found"}

    @app.get("/sw.js")
    def serve_service_worker():
        sw_file = FRONTEND_DIR / "sw.js"
        if sw_file.exists():
            return FileResponse(sw_file, media_type="application/javascript")
        return {"error": "Service worker not found"}

    @app.get("/api/download/android-apk")
    @app.head("/api/download/android-apk")
    def download_android_apk():
        apk_path = Path(__file__).resolve().parent.parent.parent / "android" / "youtube-recall.apk"
        if apk_path.exists():
            return FileResponse(
                apk_path,
                filename="youtube-recall.apk",
                media_type="application/vnd.android.package-archive"
            )
        return {"error": "APK not found. Please build using gradle."}

