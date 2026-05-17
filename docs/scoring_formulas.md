# Scoring Formulas – Addiction Risk & Digital Well-Being

This document describes the Sprint 2 scoring engine implemented in `backend/src/scoring/scoringEngine.ts`. All scores are integers from **0 to 100**.

---

## Input: Daily Usage Statistics

Aggregated per child per calendar day (UTC) from `usage_sessions`:

| Field | Description |
|-------|-------------|
| `totalScreenMinutes` | Sum of session durations |
| `sessionCount` | Number of sessions |
| `nightMinutes` | Minutes in 22:00–06:00 UTC |
| `weekOverWeekChangePercent` | Change vs. same weekday 7 days earlier |
| `physicalActivityMinutes` | Default `0` until wearables / missions integrate |
| `educationalScreenMinutes` | Time in `educational` or `creative` categories |
| `bedtimeVarianceMinutes` | Default `30` until sleep tracking integrates |
| `familyCallsMessages` | Default `0` until comms integration |

---

## Addiction Risk Score (higher = worse)

Weighted sum of five components:

| Component | Weight | Formula (0–100 each) |
|-----------|--------|----------------------|
| **Intensity** | 30% | `min(totalMinutes / 480, 1) × 100` (8h cap) |
| **Compulsivity** | 20% | `min((sessionsPerHour / 6) × 100, 100)` where `sessionsPerHour = sessionCount / 16` |
| **Night usage** | 25% | `(nightMinutes / totalScreenMinutes) × 100` (0 if no screen time) |
| **Escalation** | 15% | 100 if WoW change > 20%; linear 0–100 if 0–20%; else 0 |
| **Real imbalance** | 10% | Penalty if physical activity < `totalMinutes / 10` |

**Final score:** `round(clamp(weighted sum, 0, 100))`

### Example – low risk

- 90 min screen, 4 sessions, 0 night min, 0% WoW change, 30 min activity  
- **Result:** ~15–25 addiction score

### Example – high risk

- 720 min screen, 80 sessions, 360 night min, +25% WoW, 0 activity  
- **Result:** ≥ 85 addiction score

---

## Digital Well-Being Score (higher = better)

| Component | Weight | Formula (0–100 each) |
|-----------|--------|----------------------|
| **Screen balance** | 30% | 100 if under recommended cap (default 180 min); linear drop with excess up to 4h over |
| **Content quality** | 25% | `(educationalMinutes / totalMinutes) × 100` |
| **Real activity** | 20% | `min(100, (physicalMinutes / 60) × 100)` |
| **Sleep consistency** | 15% | 100 if variance ≤ 30 min; 0 if > 120 min; linear between |
| **Family interaction** | 10% | `min(100, familyCallsMessages × 10)` |

**Final score:** `round(clamp(weighted sum, 0, 100))`

---

## Daily Cron Job

- **Schedule:** `01:00` every day (server local time) via `node-cron`
- **Process:** For each row in `children`, aggregate yesterday’s sessions, compute both scores, upsert `daily_scores`
- **Manual re-run:** Call `runDailyScoreJob()` from `backend/src/jobs/dailyScoreJob.ts` in a REPL or add a dev script

---

## API Access

| Role | Endpoint |
|------|----------|
| Child | `POST /api/usage` |
| Parent | `GET /api/usage/:childId?date=` |
| Parent | `GET /api/scores/:childId?date=` |
| Parent | `GET /api/scores/:childId/trend?days=7` |

---

## Future Enhancements

- Age-based `recommendedScreenMinutes` from `children.birth_year`
- UsageStatsManager native module for per-app packages
- Physical activity and bedtime from missions / wearables
- TFLite content quality signal from screen_events categories
