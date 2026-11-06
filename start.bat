@echo off
echo ========================================================
echo   Starting YouTube Recall & Spaced Repetition Engine
echo ========================================================
echo.
echo Dashboard URL: http://localhost:8000
echo (Press Ctrl+C to stop)
echo.
call .\venv\Scripts\python.exe backend\run.py
pause

