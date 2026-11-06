# YouTube Recall - Online Cloud Launcher
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   YouTube Recall - Starting Online Cloud Mode for Mobile & Web" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Launching Backend Server on port 8000..." -ForegroundColor Yellow
Start-Process -FilePath ".\venv\Scripts\python.exe" -ArgumentList "backend\run.py" -WindowStyle Minimized
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "[2/2] Launching Public HTTPS Cloud Tunnel (Zero-signup, 100% Free)..." -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Green
Write-Host "Copy the HTTPS URL printed below and paste it into:" -ForegroundColor Green
Write-Host "  1. Android App: Tap 'Change IP / URL' or the cloud icon" -ForegroundColor Green
Write-Host "  2. Mobile Browser: Open on your smartphone anywhere (4G/5G/Wi-Fi)" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""

& npx -y localtunnel --port 8000
