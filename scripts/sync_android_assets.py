import os
import shutil
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
ANDROID_ASSETS_DIR = ROOT_DIR / "android" / "app" / "src" / "main" / "assets"

def sync_assets():
    print(f"Syncing from {FRONTEND_DIR} to {ANDROID_ASSETS_DIR}...")
    if not FRONTEND_DIR.exists():
        raise FileNotFoundError(f"Frontend dir not found: {FRONTEND_DIR}")

    targets = [
        ANDROID_ASSETS_DIR,
        ANDROID_ASSETS_DIR / "static",
        ANDROID_ASSETS_DIR / "web"
    ]

    for target in targets:
        target.mkdir(parents=True, exist_ok=True)
        for item in FRONTEND_DIR.iterdir():
            if item.is_file():
                dest = target / item.name
                shutil.copy2(item, dest)
                print(f"  Copied {item.name} -> {target.relative_to(ROOT_DIR)}")

    print("✓ All frontend assets successfully synced to Android package assets!")

if __name__ == "__main__":
    sync_assets()

