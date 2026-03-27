@echo off
REM VenueVision Docker Startup Script
REM Uses start-docker.ps1 to pre-pull images with retries (fixes "failed to copy" / EOF errors)

echo ========================================
echo    VenueVision Docker Launcher
echo ========================================
echo.

REM Prefer PowerShell script (has retry logic for image pulls)
where powershell >nul 2>&1
if %errorlevel% equ 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-docker.ps1"
    set SCRIPT_EXIT=%errorlevel%
    if %SCRIPT_EXIT% neq 0 (
        echo.
        pause
        exit /b %SCRIPT_EXIT%
    )
    exit /b 0
)

REM Fallback: no PowerShell, run docker-compose directly
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running! Start Docker Desktop and try again.
    pause
    exit /b 1
)
echo Starting VenueVision...
docker-compose up --build
if %errorlevel% neq 0 (
    echo [ERROR] Failed. If you see "failed to copy" or EOF, run: powershell -File "%~dp0start-docker.ps1"
    pause
    exit /b 1
)
echo.
pause
