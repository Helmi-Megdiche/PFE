# Sprint 4 - missions / gamification smoke test
# Usage: .\scripts\smoke-missions.ps1
#        .\scripts\smoke-missions.ps1 -BaseUrl http://localhost:3000

param(
    [string]$BaseUrl = 'http://localhost:3000',
    [string]$ChildId = '33333333-3333-3333-3333-333333333333'
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers = @{},
        [object]$Body = $null
    )

    $uri = "$BaseUrl$Path"
    $params = @{
        Method  = $Method
        Uri     = $uri
        Headers = $Headers
    }

    if ($null -ne $Body) {
        $params['ContentType'] = 'application/json'
        $params['Body'] = ($Body | ConvertTo-Json -Depth 6 -Compress)
    }

    try {
        return Invoke-RestMethod @params
    } catch {
        $resp = $_.Exception.Response
        if ($resp) {
            $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $detail = $reader.ReadToEnd()
            throw "HTTP $($resp.StatusCode.value__) $Method $Path`n$detail"
        }
        throw
    }
}

Write-Host 'Sprint 4 missions smoke test' -ForegroundColor Green
Write-Host "Base URL: $BaseUrl"
Write-Host "Child ID: $ChildId"

Write-Step '1. Health check'
$health = Invoke-Api -Method GET -Path '/api/health'
if ($health.status -ne 'ok') {
    throw "Health check failed: $($health | ConvertTo-Json -Compress)"
}
Write-Host 'OK - API is up'

Write-Step '2. Dev tokens'
$childAuth = Invoke-Api -Method GET -Path '/api/dev/child-token'
$parentAuth = Invoke-Api -Method GET -Path '/api/dev/parent-token'
$childToken = $childAuth.token
$parentToken = $parentAuth.token
Write-Host "Child token OK (childId=$($childAuth.childId))"

$childHeaders = @{ Authorization = "Bearer $childToken" }
$parentHeaders = @{ Authorization = "Bearer $parentToken" }

Write-Step '3. Generate mission (risky_content, score 85)'
$gen = Invoke-Api -Method POST -Path '/api/missions/generate' -Headers $childHeaders -Body @{
    childId     = $ChildId
    triggerType = 'risky_content'
    score       = 85
    category    = 'adult'
}
Write-Host ($gen | ConvertTo-Json -Depth 4)

if (-not $gen.created) {
    Write-Host "Generate skipped: $($gen.reason) - continuing with existing pending missions" -ForegroundColor Yellow
}

Write-Step '4. List missions'
$list = Invoke-Api -Method GET -Path "/api/missions/child/$ChildId" -Headers $childHeaders
Write-Host "Pending: $($list.pending.Count) | Completed: $($list.completed.Count) | Expired: $($list.expired.Count)"

$mission = $list.pending | Select-Object -First 1
if (-not $mission) {
    throw 'No pending mission to complete. Try clearing expired missions or delete rows in DB.'
}

Write-Host "Using mission: $($mission.id) - $($mission.title) (type=$($mission.metadata.type))"

Write-Step '5. Complete mission'
$completeBody = @{}
$missionType = [string]$mission.metadata.type

switch ($missionType) {
    'cognitive' {
        $exercise = [string]$mission.metadata.exercise
        switch ($exercise) {
            'nback'    { $completeBody = @{ exerciseScore = 85 } }
            'reaction' { $completeBody = @{ reactionTimeMs = 280 } }
            'hanoi'    { $completeBody = @{ moves = 7 } }
            default    { $completeBody = @{ exerciseScore = 80 } }
        }
    }
    'quiz'       { $completeBody = @{ answers = @('A', 'B', 'A') } }
    'minigame'   { $completeBody = @{ won = $true } }
    'real_world' { $completeBody = @{ confirmed = $true } }
    default      { $completeBody = @{ confirmed = $true } }
}

$complete = Invoke-Api -Method POST -Path "/api/missions/$($mission.id)/complete" -Headers $childHeaders -Body $completeBody
Write-Host ($complete | ConvertTo-Json -Depth 4)

Write-Step '6. Points and badges'
$points = Invoke-Api -Method GET -Path "/api/missions/child/$ChildId/points" -Headers $childHeaders
Write-Host "Total points: $($points.totalPoints)"

$badges = Invoke-Api -Method GET -Path "/api/badges/child/$ChildId" -Headers $childHeaders
Write-Host "Earned badges: $($badges.badges.Count)"
foreach ($b in $badges.badges) {
    Write-Host "  - [$($b.category)] $($b.icon) $($b.name) ($($b.earnedAt))"
}

$allBadges = Invoke-Api -Method GET -Path "/api/badges?childId=$ChildId" -Headers $childHeaders
$ageEarned = @($allBadges.badges | Where-Object { $_.category -eq 'age' -and $_.earned -eq $true })
$pointEarned = @($allBadges.badges | Where-Object { $_.category -eq 'point' -and $_.earned -eq $true })
Write-Host "Age badges earned: $($ageEarned.Count) (seed child birth_year 2014 -> expect Young Adventurer)"
Write-Host "Point badges earned: $($pointEarned.Count)"
if ($ageEarned.Count -gt 0) {
    Write-Host "  Age badge: $($ageEarned[0].name)" -ForegroundColor Green
}

Write-Step '7. Parent creates reward'
$rewardTitle = "Smoke test reward $(Get-Date -Format 'HHmmss')"
$reward = Invoke-Api -Method POST -Path '/api/rewards' -Headers $parentHeaders -Body @{
    title          = $rewardTitle
    description    = 'Created by smoke-missions.ps1'
    pointsRequired = 5
}
Write-Host "Reward created: $($reward.id) ($($reward.pointsRequired) pts)"

Write-Step '8. Child lists unclaimed rewards'
$rewards = Invoke-Api -Method GET -Path '/api/rewards' -Headers $childHeaders
Write-Host "Unclaimed rewards: $($rewards.rewards.Count)"

if ($points.totalPoints -ge $reward.pointsRequired) {
    Write-Step '9. Child claims reward'
    $claim = Invoke-Api -Method POST -Path "/api/rewards/$($reward.id)/claim" -Headers $childHeaders
    Write-Host ($claim | ConvertTo-Json -Compress)
    $pointsAfter = Invoke-Api -Method GET -Path "/api/missions/child/$ChildId/points" -Headers $childHeaders
    Write-Host "Points after claim: $($pointsAfter.totalPoints)"
} else {
    Write-Host "Skip claim - need $($reward.pointsRequired) pts, have $($points.totalPoints)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Smoke test PASSED" -ForegroundColor Green
