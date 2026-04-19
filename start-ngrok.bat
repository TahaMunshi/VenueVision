@echo off
REM Start ngrok tunnel to port 5000 for mobile capture and Tripo3D.
REM Start the app first (e.g. docker-compose up), then run from project root.
REM In PowerShell run:  .\start-ngrok.bat
cd /d "%~dp0"

echo Starting ngrok tunnel to http://localhost:5000 ...
start "ngrok" ngrok http 5000
echo.
echo Waiting for ngrok to register tunnel...
timeout /t 5 /nobreak > nul
echo Writing public URL to .ngrok/public_url for the app...
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 5; $t = $r.tunnels | Where-Object { $_.public_url -match '^https://' } | Select-Object -First 1; if ($t) { $dir = Join-Path (Get-Location) '.ngrok'; New-Item -ItemType Directory -Force -Path $dir | Out-Null; $t.public_url.TrimEnd('/') | Set-Content -Path (Join-Path $dir 'public_url') -Encoding utf8 -NoNewline; Write-Host ('URL saved: ' + $t.public_url) } else { Write-Host 'No HTTPS tunnel found.' } } catch { Write-Host 'Could not read ngrok URL. Is ngrok running? Run this script again after ngrok shows the URL.' }"
echo.
echo Ngrok is running in the other window. The app will use the URL above for Tripo3D and share links.
pause
