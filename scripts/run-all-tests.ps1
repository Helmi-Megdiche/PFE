# Run MobileApp + backend unit tests (repo root).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "=== PFE: MobileApp Jest ===" -ForegroundColor Cyan
Push-Location (Join-Path $Root "MobileApp")
npm test -- --no-coverage
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

Write-Host "=== PFE: Backend Jest ===" -ForegroundColor Cyan
Push-Location (Join-Path $Root "backend")
if (-not (Test-Path "node_modules")) {
  Write-Host "Installing backend dependencies..."
  npm ci
}
npm test -- --no-coverage
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

Write-Host "=== All tests passed ===" -ForegroundColor Green
