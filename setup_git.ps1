# Quick Git Setup Script
# Run this script to initialize Git and prepare for GitHub

Write-Host "=== Git Repository Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if git is installed
try {
    $gitVersion = git --version
    Write-Host "✓ Git is installed: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Git is not installed. Please install from https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

# Initialize repository (if not already initialized)
if (Test-Path .git) {
    Write-Host "✓ Git repository already initialized" -ForegroundColor Green
} else {
    Write-Host "Initializing Git repository..." -ForegroundColor Yellow
    git init
    Write-Host "✓ Repository initialized" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Create a GitHub repository:" -ForegroundColor Yellow
Write-Host "   - Go to: https://github.com/new" -ForegroundColor White
Write-Host "   - Choose a name (e.g., 'event-space-visualizer')" -ForegroundColor White
Write-Host "   - Choose Public or Private" -ForegroundColor White
Write-Host "   - DO NOT initialize with README" -ForegroundColor White
Write-Host ""
Write-Host "2. Add and commit your files:" -ForegroundColor Yellow
Write-Host "   git add ." -ForegroundColor White
Write-Host "   git commit -m 'Initial commit'" -ForegroundColor White
Write-Host ""
Write-Host "3. Connect to GitHub (replace YOUR_USERNAME and REPO_NAME):" -ForegroundColor Yellow
Write-Host "   git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git" -ForegroundColor White
Write-Host "   git branch -M main" -ForegroundColor White
Write-Host "   git push -u origin main" -ForegroundColor White
Write-Host ""
Write-Host "4. Share with friends:" -ForegroundColor Yellow
Write-Host "   - Public repo: Give them the GitHub URL" -ForegroundColor White
Write-Host "   - Private repo: Invite them via Settings > Collaborators" -ForegroundColor White
Write-Host ""
Write-Host "For detailed instructions, see GIT_SETUP.md" -ForegroundColor Cyan
Write-Host ""

