# Install pdf2pptx with Visual Studio environment
# This script sets up Visual Studio environment variables and installs pdf2pptx

Write-Host "Setting up Visual Studio environment..." -ForegroundColor Green

# Visual Studio path
$vsPath = "C:\Program Files\Microsoft Visual Studio\18\Enterprise"
$vcvarsPath = "$vsPath\VC\Auxiliary\Build\vcvarsall.bat"

if (-not (Test-Path $vcvarsPath)) {
    Write-Host "Error: Cannot find vcvarsall.bat" -ForegroundColor Red
    Write-Host "Path: $vcvarsPath" -ForegroundColor Yellow
    exit 1
}

# Use cmd to call vcvarsall.bat and run pip install
Write-Host "Installing pdf2pptx (this may take a few minutes)..." -ForegroundColor Green
Write-Host ""

# Run in cmd, set environment variables and install
cmd /c "`"$vcvarsPath`" x64 && python -m pip install pdf2pptx"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Success! pdf2pptx installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verifying installation..." -ForegroundColor Green
    python -c "import pdf2docx; import pdf2pptx; print('All conversion libraries installed successfully!')"
} else {
    Write-Host ""
    Write-Host "Installation failed, error code: $LASTEXITCODE" -ForegroundColor Red
    exit 1
}
