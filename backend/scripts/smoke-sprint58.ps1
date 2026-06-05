# Sprint 5.6–5.8 comprehensive smoke test (wellbeing proxies + interests)
# Usage: .\scripts\smoke-sprint58.ps1
#        .\scripts\smoke-sprint58.ps1 -BaseUrl http://localhost:3000

param(
    [string]$BaseUrl = 'http://localhost:3000'
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendRoot = Split-Path -Parent $scriptDir

Push-Location $backendRoot
try {
    npx tsx scripts/smoke-sprint58.ts --base-url $BaseUrl
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
