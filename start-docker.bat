@echo off
REM VenueVision Docker Startup Script
REM This script starts the entire application using Docker

echo ========================================
echo    VenueVision Docker Launcher
echo ========================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running!
    echo.
    echo Please start Docker Desktop and try again.
    echo.
    pause
    exit /b 1
)

echo [OK] Docker is running
echo.

REM Check if docker-compose exists
docker-compose version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] docker-compose not found!
    echo.
    echo Please install Docker Desktop which includes docker-compose.
    echo.
    pause
    exit /b 1
)

echo [OK] docker-compose is available
echo.

echo Starting VenueVision...
echo.
echo This will:
echo  1. Build the application (first time only)
echo  2. Start PostgreSQL database
echo  3. Set up database schema and demo user
echo  4. Start the Flask server
echo.
echo Please wait, this may take a few minutes on first run...
echo.

REM Start docker-compose
docker-compose up --build

REM If docker-compose exits, pause to show any errors
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to start VenueVision
    echo.
    echo Check the error messages above.
    echo.
    pause
    exit /b 1
)

echo.
echo VenueVision stopped.
echo.
pause
