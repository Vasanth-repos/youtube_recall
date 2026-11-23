# -*- mode: python ; coding: utf-8 -*-
import os
from pathlib import Path

block_cipher = None
project_root = os.path.abspath(SPECPATH)

datas = [
    (os.path.join(project_root, 'frontend'), 'frontend'),
]

hiddenimports = [
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.loops.asyncio',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'fastapi',
    'starlette',
    'starlette.middleware',
    'starlette.middleware.cors',
    'starlette.staticfiles',
    'starlette.responses',
    'pydantic',
    'pydantic_core',
    'sqlalchemy',
    'sqlalchemy.dialects.sqlite',
    'sqlalchemy.orm',
    'jwt',
    'bcrypt',
    'httpx',
    'dotenv',
    'youtube_transcript_api',
    'backend',
    'backend.app',
    'backend.app.main',
    'backend.app.database',
    'backend.app.models',
    'backend.app.schemas',
    'backend.app.config',
    'backend.app.routers.videos',
    'backend.app.routers.flashcards',
    'backend.app.routers.export',
    'backend.app.routers.settings',
    'backend.app.routers.youtube_auth',
    'backend.app.routers.auth',
    'backend.app.services.youtube_service',
    'backend.app.services.classifier_service',
    'backend.app.services.ai_service',
    'backend.app.services.auth_service',
    'backend.app.services.spaced_repetition',
    'backend.app.services.export_obsidian',
    'backend.app.services.export_anki',
    'backend.app.services.export_notion',
]

a = Analysis(
    ['desktop_launcher.py'],
    pathex=[project_root],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'scipy', 'pandas'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

icon_path = os.path.join(project_root, 'app_icon.ico')
if not os.path.exists(icon_path):
    icon_path = None

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='YouTubeRecall',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon_path
)

