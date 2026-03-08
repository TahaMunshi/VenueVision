# VenueVision Docker Startup (with image-pull retries)
$ErrorActionPreference = "Stop"
$MaxRetries = 5
$RetryDelaySeconds = 15
$Images = @("node:20-alpine", "python:3.11-slim", "postgres:15-alpine")

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   VenueVision Docker Launcher" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

try { docker info 2>$null | Out-Null } catch {
    Write-Host "[ERROR] Docker is not running! Start Docker Desktop and try again." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Docker is running" -ForegroundColor Green
Write-Host ""

Write-Host "Pre-pulling images (with retries)..." -ForegroundColor Cyan
foreach ($img in $Images) {
    $attempt = 0
    $done = $false
    while (-not $done -and $attempt -lt $MaxRetries) {
        $attempt++
        Write-Host "  Pulling $img (attempt $attempt/$MaxRetries)..." -NoNewline
        & docker pull $img 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host " OK" -ForegroundColor Green
            $done = $true
        } else {
            Write-Host " failed" -ForegroundColor Red
            if ($attempt -lt $MaxRetries) {
                Write-Host "  Waiting ${RetryDelaySeconds}s..." -ForegroundColor Yellow
                Start-Sleep -Seconds $RetryDelaySeconds
            } else {
                Write-Host ""
                Write-Host "[ERROR] Could not pull $img. Add a registry mirror: Docker Desktop -> Settings -> Docker Engine -> add " -NoNewline -ForegroundColor Red
                Write-Host '"registry-mirrors": ["https://mirror.gcr.io"]' -ForegroundColor Gray
                Write-Host " then Apply & restart, and run this script again." -ForegroundColor Red
                exit 1
            }
        }
    }
}
Write-Host ""

Write-Host "Starting VenueVision..." -ForegroundColor Cyan
docker-compose up --build
if ($LASTEXITCODE -ne 0) { exit 1 }
