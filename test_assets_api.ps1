# VenueVision Assets API Test Script
# Run this in PowerShell to test the InstantMesh integration

$baseUrl = "http://localhost:5000/api/v1"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "VenueVision Assets API Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Health Check
Write-Host "`n[1] Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
    Write-Host "   Status: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "   Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2. Login
Write-Host "`n[2] Logging in as 'demo'..." -ForegroundColor Yellow
try {
    $loginBody = @{ username = "demo"; password = "demo123" } | ConvertTo-Json
    $login = Invoke-RestMethod -Uri "$baseUrl/login" -Method Post -ContentType "application/json" -Body $loginBody
    $token = $login.token
    $userId = $login.user.user_id
    Write-Host "   Logged in! User ID: $userId" -ForegroundColor Green
} catch {
    Write-Host "   Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$headers = @{ Authorization = "Bearer $token" }

# 3. Get Current Assets
Write-Host "`n[3] Fetching current assets..." -ForegroundColor Yellow
try {
    $assets = Invoke-RestMethod -Uri "$baseUrl/assets" -Method Get -Headers $headers
    Write-Host "   Total assets: $($assets.total_count)" -ForegroundColor Green
    foreach ($asset in $assets.assets) {
        Write-Host "   - [$($asset.asset_id)] $($asset.asset_name) ($($asset.generation_status))" -ForegroundColor Gray
    }
} catch {
    Write-Host "   Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Generate New Asset (create test image)
Write-Host "`n[4] Generating new 3D asset from test image..." -ForegroundColor Yellow
try {
    # Create a simple test image using .NET
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap(256, 256)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.Clear([System.Drawing.Color]::Blue)
    $graphics.FillEllipse([System.Drawing.Brushes]::Red, 50, 50, 156, 156)
    $graphics.Dispose()
    
    $testImagePath = "$env:TEMP\venuevision_test.png"
    $bmp.Save($testImagePath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    
    Write-Host "   Created test image: $testImagePath" -ForegroundColor Gray
    
    # Upload using multipart form
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    
    $fileBytes = [System.IO.File]::ReadAllBytes($testImagePath)
    $fileEnc = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($fileBytes)
    
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"test.png`"",
        "Content-Type: image/png$LF",
        $fileEnc,
        "--$boundary",
        "Content-Disposition: form-data; name=`"asset_name`"$LF",
        "PowerShell Test Asset",
        "--$boundary--$LF"
    ) -join $LF
    
    $response = Invoke-RestMethod -Uri "$baseUrl/assets/generate" -Method Post -Headers $headers -ContentType "multipart/form-data; boundary=$boundary" -Body $bodyLines
    
    Write-Host "   Asset generated!" -ForegroundColor Green
    Write-Host "   Asset ID: $($response.asset.asset_id)" -ForegroundColor Gray
    Write-Host "   File URL: $($response.asset.file_url)" -ForegroundColor Gray
    
    # Cleanup
    Remove-Item $testImagePath -ErrorAction SilentlyContinue
} catch {
    Write-Host "   Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Get Updated Assets
Write-Host "`n[5] Fetching updated assets..." -ForegroundColor Yellow
try {
    $assets = Invoke-RestMethod -Uri "$baseUrl/assets" -Method Get -Headers $headers
    Write-Host "   Total assets: $($assets.total_count)" -ForegroundColor Green
    foreach ($asset in $assets.assets) {
        Write-Host "   - [$($asset.asset_id)] $($asset.asset_name)" -ForegroundColor Gray
        Write-Host "     File: $($asset.file_url)" -ForegroundColor DarkGray
    }
} catch {
    Write-Host "   Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Get Asset Count
Write-Host "`n[6] Getting asset count..." -ForegroundColor Yellow
try {
    $count = Invoke-RestMethod -Uri "$baseUrl/assets/count" -Method Get -Headers $headers
    Write-Host "   Count: $($count.count)" -ForegroundColor Green
} catch {
    Write-Host "   Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nView your assets at: http://localhost:5000/static/user_assets/1/" -ForegroundColor White
Write-Host "Access the app at: http://localhost:5000/mobile" -ForegroundColor White
