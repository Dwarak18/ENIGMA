# ENIGMA Device Auto-Detector (Windows)
# Runs the listener locally on Windows using pyserial polling to auto-detect
# when the ESP32 (CH343) is plugged in or out.

Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       ENIGMA Windows Auto-Detection Script                   ║" -ForegroundColor Cyan
Write-Host "║       Monitors COM ports for ESP32-S3 plug/unplug events     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Navigate to the listener directory
$ListenerDir = Join-Path -Path $PSScriptRoot -ChildPath "tools\device_listener"
Set-Location -Path $ListenerDir

# Check if Python is installed
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python is not installed or not in your PATH." -ForegroundColor Red
    Write-Host "Please install Python from https://www.python.org/downloads/windows/" -ForegroundColor Yellow
    exit 1
}

# Install dependencies
Write-Host "Checking dependencies..." -ForegroundColor Gray
python -m pip install -r requirements.txt --quiet

# Start the listener (uses pyserial polling on Windows)
$env:BACKEND_URL="http://localhost:3000"
$env:SKIP_HANDSHAKE="true"  # Set to false if you want the full cryptographic challenge

Write-Host "Starting listener..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

python listener.py
