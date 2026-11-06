@echo off
title YouTube Recall - Online Cloud Mode
echo ================================================================
echo   YouTube Recall - Starting Online Cloud Mode for Mobile & Web
echo ================================================================
echo.
echo [1/2] Launching Backend Server on port 8000...
start "YouTube Recall Server" cmd /k ".\venv\Scripts\python backend\run.py"
timeout /t 3 /nobreak >nul

echo.
echo [2/2] Launching Public HTTPS Cloud Tunnel (Zero-signup, 100% Free)...
echo ================================================================
echo Copy the HTTPS URL printed below and paste it into:
echo   1. Android App: Tap "Change IP / URL" or the cloud icon
echo   2. Mobile Browser: Open on your smartphone anywhere (4G/5G/Wi-Fi)
echo ================================================================
echo.
call npx -y localtunnel --port 8000
