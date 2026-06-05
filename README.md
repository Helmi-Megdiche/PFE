# AI Parental Control Platform – PFE Project

**Student:** Helmi Megdiche – ESPRIT (5th year)  
**Internship period:** 01/02/2026 – 31/07/2026  
**Repository:** [github.com/Helmi-Megdiche/PFE](https://github.com/Helmi-Megdiche/PFE)  
**Product requirement:** Production-ready, privacy-first, industrial grade

---

## Table of Contents

- [Project Overview](#project-overview)
- [Problem Statement & Objectives](#problem-statement--objectives)
- [System Architecture](#system-architecture)
  - [Adaptive Capture](#adaptive-capture)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Setup & Installation](#setup--installation)
  - [Backend (Node.js + PostgreSQL)](#backend-nodejs--postgresql)
  - [Mobile App (React Native – Android)](#mobile-app-react-native--android)
- [Configuration](#configuration)
  - [JWT Authentication](#jwt-authentication)
  - [API Base URL for Physical Devices](#api-base-url-for-physical-devices)
  - [Firewall & Network](#firewall--network)
- [Running the Application](#running-the-application)
- [API Endpoints (Sprint 1)](#api-endpoints-sprint-1)
- [Testing the Screen Monitoring Pipeline](#testing-the-screen-monitoring-pipeline)
- [Privacy & Security](#privacy--security)
- [Sprint Status](#sprint-status)
- [Next Steps (Sprint 2)](#next-steps-sprint-2)
- [Documentation for Final Report](#documentation-for-final-report)
- [License](#license)

---

## Project Overview

This project adds an **intelligent layer** to a classic parental control application by combining:

- **Usage-based behavioural analysis** – detects early signs of smartphone addiction and calculates a daily digital well-being score (Sprint 2+).
- **Real-time screen content analysis** – uses on-device OCR and lightweight keyword classification to identify risky content (violent, toxic, dangerous challenges) **without sending any screenshot to the cloud**.
- **Gamified real-world missions** – when risk thresholds are reached, the child receives educational missions (physical activity, family interaction, creative tasks). Points and badges unlock real-life rewards defined by parents (later sprints).

The system is built for **Android** (React Native) with a Node.js backend and PostgreSQL database. All sensitive processing (OCR, keyword filtering) happens **on the child's device** to guarantee privacy and align with GDPR / COPPA principles.

---

## Problem Statement & Objectives

**Problem:** Existing parental control apps focus on restriction (blocking apps, limiting screen time) without behavioural intelligence. Children remain exposed to addictive patterns and dangerous content.

**Objectives (merged from two specifications):**

1. **Addiction risk score** – based on intensity, compulsivity, night usage, escalation, and real-world imbalance.
2. **Digital well-being score** – screen balance, content quality, real activity, sleep consistency, family interaction.
3. **Screen content analysis** – OCR + keyword classification (violent, toxic, dangerous challenges, educational).
4. **Real-world missions** – triggered by high-risk content or unhealthy usage patterns.
5. **Gamification** – points, badges, parent-defined rewards.
6. **Parent dashboard** – real-time monitoring of both usage scores and risky content events.

---

## System Architecture

```mermaid
graph TB
    subgraph ChildDevice["Child Device (Android)"]
        A[React Native App] --> B[ScreenCaptureModule<br/>Java MediaProjection]
        B --> C[ML Kit OCR<br/>on-device]
        C --> D[Keyword Filter]
        D --> E[apiClient JWT]
        F[Foreground Tracker<br/>Sprint 2] -.-> E
    end

    subgraph Backend["Backend (Node.js + PostgreSQL)"]
        G[Express API] --> H[verifyToken middleware]
        H --> I[POST /api/screen-events]
        H --> J[POST /api/usage<br/>Sprint 2]
        H --> K[GET /api/scores<br/>Sprint 2]
        I --> L[(screen_events)]
        J --> M[(usage_sessions)]
        K --> N[(daily_scores)]
        O[Cron node-cron<br/>Sprint 2] --> N
    end

    subgraph ParentUI["Parent Dashboard"]
        P[Dashboard UI] --> G
    end

    E --> G
```

### Data flow (Sprint 1)

1. Child grants **MediaProjection** permission (foreground service on Android 14+).
2. Every **30 seconds**, `ScreenCaptureModule` captures a screenshot and saves a temporary JPEG on device.
3. The hook `useScreenshotCapture` loads the image, runs the **hybrid multilingual OCR** (`mixedScriptOcr.ts`: ML Kit + UI noise filter + Arabizi normalization), and applies the **multilingual keyword filter** (English + French + Arabic + Tunisian Derja).
4. Only extracted text (≤500 chars), risk flag, category, and metadata are sent to `POST /api/screen-events` – the image is deleted immediately.
5. Backend stores metadata in the `screen_events` table.

### Adaptive Capture

Sprint **3.7** replaces a fixed periodic interval with a **risk-based adaptive strategy** so the app reacts quickly after risky content without draining the battery when risk is low.

| Trigger | When it fires |
|---------|----------------|
| **App switch** | Foreground app changes (UsageStats poll every 1s) → immediate `captureNow()` |
| **Follow-up** | 5 seconds after app switch, unless a capture completed within the last 2 seconds |
| **Periodic (adaptive)** | Rolling average of the last **3** `combinedRiskScore` values sets the interval |

| Average risk (last 3 captures) | Periodic interval (risk base) |
|--------------------------------|-------------------|
| > 70 | 10 seconds |
| 30 – 70 | 30 seconds |
| < 30 | 60 seconds |

**App-aware periodic interval (JS timer only):** the risk base above is adjusted by foreground app category (`MobileApp/src/utils/appCapturePolicy.ts`). Recomputed on risk change and app switch.

| App category | Packages (examples) | Effective periodic interval |
|--------------|---------------------|----------------------------|
| `browser_social` | Chrome, Instagram, TikTok, YouTube, WhatsApp, Facebook | `min(risk base, 30s)` |
| `game` | Roblox, Minecraft, Clash of Clans | **0** (app-switch + follow-up only) |
| `education` | Khan Academy, Duolingo | `max(risk base, 120s)` |
| `system` | Stock launchers | **0** |
| `default` | Other apps | risk base unchanged |

The native `startCapture(60s)` loop is unchanged; only the **JS** `setTimeout` periodic chain respects app-aware intervals (interval **0** clears that timer). Native frames may still arrive and are debounced/OCR-limited.

**Mission overlay debounce:** the same pending mission is not re-shown within **90s**; **re-surfaced** missions are suppressed for **8s** after monitoring starts (avoids quiz spam on toggle-on). Overlays are skipped when the foreground app is a **launcher/home** package (`com.miui.home`, etc.).

**Launcher recents bleed:** when the foreground app is the home launcher but OCR is from a **Chrome recent card** (pornhub thumbnail on MIUI home), the event is stored as **neutral** — enforcement applies when the child opens Chrome (`com.android.chrome` foreground).

**Filtered SERP cap:** on Google/Bing/DuckDuckGo pages with SafeSearch / **Mode IA** / **Flouter** UI and TFLite &lt; 30, combined risk is capped (~24) unless OCR shows an explicit **search-box** query (`Q porn`, `+ Q nsfw`, etc.). Body-only keywords in result titles (e.g. youporn) do not bypass the cap.

**Post-mission capture:** when a blocking mission ends, foreground package is **snapshotted on pause** and may be reused for **120s** if UsageStats briefly returns `unknown` after resume; `resumeCapture` also **refreshes** the foreground cache. OCR + TFLite are capped at **30s** per frame (`vision_timeout` skip) so `isProcessing` cannot block the pipeline after long overlays.

**Debounce:** at least **5 seconds** between any two captures (JS + native `captureNow`). **UX:** no extra popups beyond MediaProjection and the foreground-service notification; Usage access is optional but improves `appPackage` / `appLabel` accuracy.

Implementation: `MobileApp/src/hooks/useScreenshotCapture.ts`, `MobileApp/src/utils/adaptiveCapture.ts`, `MobileApp/src/utils/appCapturePolicy.ts`, native `ForegroundAppModule` (UsageStats) and `ScreenCaptureModule.captureNow()`. At capture time, `resolveForegroundAppWithRetry()` queries UsageStats (UsageEvents window **120s**, `queryUsageStats` fallback limited to apps used in the last **5s**). If live lookup fails, the 1s poll cache is used only when younger than **15s**; `com.android.systemui` and launcher packages are never reported. **Rebuild required** after native `ForegroundAppModule.java` changes.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Mobile frontend | React Native 0.74.5 + TypeScript |
| Native module | Java (MediaProjection API, foreground service) |
| OCR | `@react-native-ml-kit/text-recognition` (Google ML Kit, Latin script) + `cleanOcrText` UI filter + Arabizi normalization (`MobileApp/src/services/mixedScriptOcr.ts`) |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 (Docker) or local PostgreSQL 14+ |
| Authentication | JWT (AsyncStorage on device) |
| Background jobs | node-cron (planned Sprint 2) |
| Version control | Git + GitHub |

---

## Repository Structure

```text
PFE/
├── backend/
│   ├── src/
│   │   ├── middleware/          # verifyToken, auth, validation
│   │   ├── routes/                # screen-events, dev token
│   │   ├── db/migrations/         # 000_init, 001_screen_events, 002_dev_seed
│   │   └── index.ts
│   ├── .env.example
│   ├── docker-compose.yml         # Postgres on host port 5433
│   └── package.json
├── backend/public/demo.html       # Parent dashboard (also served at /demo.html)
├── MobileApp/                     # Primary React Native app (use this)
│   ├── android/
│   │   └── app/src/main/java/com/mobileapp/
│   │       ├── screencapture/     # ScreenCaptureModule, Package
│   │       ├── overlay/           # OverlayService, OverlayMissionModule (Sprint 5)
│   │       └── MediaProjectionForegroundService.java
│   ├── src/
│   │   ├── navigation/            # React Navigation tabs + MissionScreen stack
│   │   ├── screens/               # Monitor, Missions, Rewards, Badges, Profile
│   │   ├── missions/              # presentMissionFromCapture, missionCompletion
│   │   ├── native/OverlayMission.ts
│   │   ├── hooks/useScreenshotCapture.ts, useMissionOverlayListener.ts
│   │   ├── services/              # apiClient, missionsApi, screenEventsApi
│   │   ├── config/apiConfig.ts
│   │   └── utils/keywordFilter.ts
│   └── package.json
├── demo_dashboard.html            # Parent dashboard source (sync with backend/public/)
├── docs/                          # Report artefacts (to be expanded)
├── README.md
└── .gitignore
```

---

## Prerequisites

- **Node.js** v18 or v20
- **npm** or yarn
- **PostgreSQL** 14+ or **Docker Desktop** (recommended)
- **Android Studio** with SDK (API 29+)
- **Java 17** (Gradle)
- **Physical Android device** (API 29+) or emulator
- **Git**

---

## Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/Helmi-Megdiche/PFE.git
cd PFE
```

### 2. Backend (Node.js + PostgreSQL)

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your database credentials. The example uses Docker on **port 5433**:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pfe_parental_control
JWT_SECRET=your_super_secret_key_change_in_production
PORT=3000
```

**Using Docker (recommended):**

```bash
npm run db:up          # starts PostgreSQL container (host port 5433)
npm run db:migrate     # runs SQL migrations
```

**Using local PostgreSQL:** create database `pfe_parental_control` and run files in `src/db/migrations/` in order.

**Start the API:**

```bash
npm run dev
# Listening on http://localhost:3000
```

### 3. Mobile App (React Native – Android)

```bash
cd ../MobileApp
npm install
```

- Open `MobileApp/android` in Android Studio if SDK components are missing.
- Ensure `minSdkVersion` 29 and `compileSdkVersion` 34 in `android/build.gradle`.
- Enable USB debugging on a physical device, or start an emulator (API 29+).

```bash
npm start          # Terminal 1 – Metro (port 8081)
npm run android    # Terminal 2 – build & install
```

---

## Configuration

### JWT Authentication

Protected routes require `Authorization: Bearer <token>`.

| Route | Auth |
|-------|------|
| `GET /api/health` | Public |
| `GET /api/dev/child-token` | Dev only (`NODE_ENV=development`) |
| `POST /api/screen-events` | Child JWT |
| `GET /api/screen-events/:childId` | Parent JWT |
| `POST /api/usage` | Child JWT |
| `GET /api/usage/:childId` | Parent JWT |
| `GET /api/scores/:childId` | Parent JWT |
| `GET /api/scores/:childId/trend` | Parent JWT |

In development, `AppApiBootstrap` fetches a child token from `/api/dev/child-token` (see migration `002_dev_seed.sql` for test child UUID).

### Mission cooldown (development)

Optional in `backend/.env` (see `backend/.env.example`):

```env
MISSION_RISK_COOLDOWN_MINUTES=2
```

Suppresses duplicate risky-content missions for N minutes after one is created (production default **15**). During cooldown, a further risky capture still returns `newMission` for the **existing pending** mission (`reSurfaced: true`) so the mobile overlay can block again.

### API Base URL for Physical Devices

The emulator uses `http://10.0.2.2:3000` automatically. On a **physical device**, set your PC's Wi-Fi IPv4 in `MobileApp/src/config/apiConfig.ts`:

```typescript
export const DEV_LAN_HOST = '192.168.x.x';  // from ipconfig (Windows) or ifconfig
```

`getApiBaseUrl()` picks `10.0.2.2` on emulators and `DEV_LAN_HOST` on real hardware.

### Firewall & Network

- Allow inbound **TCP 3000** in Windows Firewall.
- Phone and PC must be on the **same Wi-Fi**.
- Test from the phone browser: `http://<YOUR_IP>:3000/api/health`

---

## Running the Application

| Terminal | Directory | Command | Purpose |
|----------|-----------|---------|---------|
| 1 | `backend` | `npm run dev` | API on port 3000 |
| 2 | `MobileApp` | `npm start` | Metro bundler |
| 3 | `MobileApp` | `npm run android` | Install on device |

Grant **MediaProjection** when prompted. Screen monitoring starts via `ScreenMonitor`. Usage tracking now runs via `useRealForegroundTracker` (app-root), polling foreground packages every **5s** while monitoring is active, and batching `POST /api/usage` every **60s**.

Run scoring unit tests:

```bash
cd backend && npm test
```

---

## API Endpoints (Sprint 1)

### `GET /api/health`

Public health check.

### `GET /api/dev/child-token` (development)

Returns a signed JWT for the seeded test child.

### `POST /api/screen-events` (child)

**Body example:**

```json
{
  "timestamp": "2026-05-17T18:30:00.000Z",
  "appPackage": "com.instagram.android",
  "extractedTextPreview": "Sample OCR text from screen...",
  "riskFlag": true,
  "riskScore": 72,
  "imageRiskScore": 81,
  "combinedRiskScore": 78,
  "imageClassificationDetails": {
    "source": "mlkit",
    "violenceScore": 0.12,
    "imageRiskScore": 81
  },
  "category": "violent"
}
```

**Response:** `201 Created` with stored event (includes Sprint 3 vision fields when provided).

### `GET /api/screen-events/:childId` (parent)

Returns screen events for the given child (JWT must match parent/child roles as implemented in middleware).

## API Endpoints (Sprint 2)

### `POST /api/usage` (child)

Batch insert foreground usage sessions.

```json
{
  "sessions": [
    {
      "startTime": "2026-05-17T10:00:00.000Z",
      "endTime": "2026-05-17T10:15:00.000Z",
      "appPackage": "com.android.chrome",
      "appCategory": "browser_social"
    }
  ]
}
```

**Response:** `{ "count": 1 }`

### `GET /api/usage/:childId?date=YYYY-MM-DD` (parent)

Returns raw sessions for a calendar day (defaults to today).

### `GET /api/scores/:childId?date=YYYY-MM-DD` (parent)

Returns addiction and well-being scores for a date. Without `date`, returns the latest stored score. Response also includes `totalPoints` and `level` (`floor(totalPoints / 500) + 1`).

**Addiction score note:** the stored `addictionScore` includes a weekly **exposure penalty** (up to +20) from risky `screen_events` in the last 7 days (`2` points per event, capped at `20`). See [docs/scoring_formulas.md](docs/scoring_formulas.md).

### `GET /api/scores/:childId/trend?days=7` (parent)

Returns daily scores for the last N days (1–90).

### Scoring formulas

See [docs/scoring_formulas.md](docs/scoring_formulas.md) for component weights, examples, and cron behaviour.

**Verify usage & scores in PostgreSQL:**

```sql
SELECT start_time, end_time, app_package, app_category
FROM usage_sessions
ORDER BY start_time DESC
LIMIT 10;

SELECT score_date, addiction_score, wellbeing_score
FROM daily_scores
ORDER BY score_date DESC;
```

---

## Testing the Screen Monitoring Pipeline

1. Run backend and mobile app; grant MediaProjection.
2. Open an app with visible text (Chrome, Notes, social apps).
3. Wait ~30 seconds.
4. Backend logs should show successful `POST /api/screen-events`.

**Verify in PostgreSQL:**

```sql
SELECT timestamp,
       LEFT(extracted_text_preview, 80) AS preview,
       risk_flag,
       category
FROM screen_events
ORDER BY timestamp DESC
LIMIT 10;
```

**Common issues:**

| Symptom | Fix |
|---------|-----|
| Network error on device | Update `DEV_LAN_HOST`, check firewall & same Wi-Fi |
| MediaProjection denied | Ensure foreground service in manifest; do not duplicate `onActivityResult` in `MainActivity` |
| OCR empty | Use screens with larger, clear text |
| HTTP 400 on preview | Preview must be ≤500 characters (no trailing ellipsis beyond limit) |
| Gradle / OneDrive locks | Clean `.gradle`, avoid syncing `android/build` via OneDrive |

See also `MobileApp/TESTING.md` if present in the repo.

---

## Privacy & Security

- **No screenshots leave the device.** JPEG is temporary; only text metadata is transmitted.
- **JWT** secures API routes; use strong `JWT_SECRET` in production.
- **Minimal permissions:** MediaProjection, foreground service, Internet, **Display over other apps** (mission overlay on Android only).
- **Explicit consent** required before monitoring starts (MediaProjection dialog).
- Designed with **GDPR / COPPA** principles: data minimisation, on-device processing.

---

## Sprint Status

| Sprint | Dates | Status | Summary |
|--------|-------|--------|---------|
| **1** | 18 – 31 May 2026 | Complete | **OCR + JWT backend** — MediaProjection capture, on-device ML Kit OCR, keyword filter, `POST /api/screen-events`, JWT auth, `screen_events` storage |
| **2** | 1 – 14 June 2026 | Complete | **Usage-based scoring + cron** — real foreground app sessions (`POST /api/usage`, JS poll 5s while monitoring), addiction & well-being scoring engine, `node-cron` daily aggregation, score & trend APIs |
| **3** | 15 – 28 June 2026 | Complete | **Vision model + combined risk** — ML Kit image labeling + nsfwjs-style proxy on device, `combinedRiskScore = OCR×0.3 + vision×0.7`, extended `screen_events` fields |
| **3.5** | — | Complete | **Debug & foreground** — `POST /api/debug/classify` (backend nsfwjs + Tesseract OCR), `demo_dashboard.html`, `ForegroundAppModule` (UsageStats), shared `riskMapping.ts` (mobile + backend), `app_label` migration |
| **3.6** | — | Complete | **Accuracy improvements** — expanded ML Kit mapping (weapons, drugs, gore, adult, hentai proxy), `enforceCategoryConsistency`, explicit OCR boosts & overrides, `nsfwClassifier` proxy (no tfjs on device) |
| **3.7** | — | Complete | **Adaptive capture** — immediate capture on app switch, follow-up after 5s, risk-based dynamic intervals (10s / 30s / 60s from rolling average of last 3 scores), 5s debounce |
| **3.8** | — | Complete | **NSFW model training** — fine-tune EfficientNetV2B0 on the NSFW Data Scraper dataset (5 classes), export quantized `.tflite`. See [`training/README_FINETUNE.md`](training/README_FINETUNE.md) |
| **3.9** | — | Complete | **On-device NSFW TFLite** — Yahoo Open NSFW `nsfw.tflite` via native `NsfwTflite` module (RN 0.74–compatible), replaces ML Kit heuristic proxy for adult score |
| **3.10** | — | Complete | **Multilingual OCR (FR / AR / Derja)** — French + Arabic + Tunisian Derja Arabizi keyword lists, `normalizeArabizi.ts` (digit-letter → quasi-Arabic), `mixedScriptOcr.ts` (ML Kit primary + graceful Tesseract `ara+fra+eng` fallback), normalized-text channel in `keywordFilter` |
| **3.11** | — | Complete | **Foreground app accuracy** — UsageEvents window 15s→120s, UsageStats recency filter (5s), capture-time 3× retry (200ms), 15s cache TTL, skip System UI / launcher; fixes Instagram sticking when switching to Messenger |
| **3.12** | — | Complete | **OCR noise reduction** — `cleanOcrText` strips UI timestamps/counts/phrases; stricter Arabizi gating (≥2 transformation digits, UI number exclusion); documented ML Kit Arabic limitation (no Tesseract on RN 0.74) |
| **3.13** | — | Complete | **Debug Arabic OCR** — `POST /api/debug/arabic-ocr` (server Tesseract `ara`); backend keyword lists synced with mobile; Arabic script demo path added for supervisor validation |
| **3.14** | — | Complete | **On-device Arabic OCR (Android)** — integrated `@devinikhiya/react-native-tesseractocr` with lazy initialization, sequential ML Kit→Tesseract fallback, no OCR concurrency, and `ara.traineddata` assets |
| **4** | 29 June – 12 July 2026 | Complete | **Missions & gamification (backend)** — mission generation from risk/scores, points, badges, parent rewards, cognitive remediation validation |
| **4.5** | — | Complete | **Smart mission generation** — adaptive risk threshold, cumulative burst detection, category-specific templates, escalation points, 15-min cooldown |
| **5** | — | Complete | **Gamification frontend** — React Navigation UI, parent approval / reject / bonus, escape penalty, `SYSTEM_ALERT_WINDOW` mission overlay + notification fallback, dashboard at `/demo.html`, `fetchWithAuth` POST fix |
| **5.6** | — | Complete | **Exposure penalty + player levels** — weekly risky-event count adds up to +20 to daily addiction score; `GET /api/scores/:childId` returns `level`; Profile shows level from points |
| **5.7** | — | Complete | **Parent dashboard enhancement** — Monitoring vs Parent tabs; child profile, latest scores/level/points, earned badges, mission history (completed+expired, last 20 with dates), claimed rewards history, toast feedback on actions |
| **5.8** | — | Complete | **Dynamic wellbeing proxies + interests** — physical activity / bedtime / family interaction from missions & usage; age-based screen cap; `children.interests` JSONB; interest tie-breaker in mission selection; parent dashboard interests editor |
| **6** | 13 – 31 July 2026 | Planned | Hardening, tests, final demo & report |

---

## Sprint 3 – Image classification (on-device)

After each screenshot, **OCR** and **image classification** run in parallel:

| Step | Module | Output |
|------|--------|--------|
| 1 | **Multilingual OCR** (`mixedScriptOcr.ts`) | ML Kit text + Arabizi-normalized text → multilingual keyword risk (EN / FR / AR / Derja) |
| 2 | **TFLite NSFW** (`nsfw.tflite`) + ML Kit labels | `imageRiskScore`, `adultScore`, `tfliteOutputs` |
| 3 | `riskCombination.ts` | `combinedRiskScore = OCR×0.3 + image×0.7` |

**Pipeline order (RN 0.74.5):** native `NsfwTflite` (Yahoo Open NSFW, 224×224) + ML Kit Image Labeling for violence/gore/educational cues. Model: `MobileApp/android/app/src/main/assets/models/nsfw.tflite`. Rebuild required after model changes (`npm run android`). In `__DEV__`, use the **NSFW TFLite debug** panel to re-classify the last capture.

**New API fields** on `POST /api/screen-events`: `imageRiskScore`, `imageClassificationDetails`, `combinedRiskScore`.

**Replace mock with a real model:** see [MobileApp/assets/models/README.md](MobileApp/assets/models/README.md).

**Rebuild required** after adding native deps:

```bash
cd MobileApp
npm install
npm run android
```

**Verify vision fields:**

```sql
SELECT timestamp, image_risk_score, combined_risk_score, category,
       image_classification_json->>'source' AS classifier
FROM screen_events
ORDER BY timestamp DESC
LIMIT 10;
```

---

## NSFW model training (WSL2, Sprint 3.8)

Fine-tune **EfficientNetV2B0** on the [NSFW Data Scraper](https://github.com/alex000kim/nsfw_data_scraper) dataset and export a quantized `.tflite` (optional replacement for the bundled Yahoo model on device).

| Script | Purpose |
|--------|---------|
| [`training/README_FINETUNE.md`](training/README_FINETUNE.md) | Full pipeline guide |
| [`training/run_full_pipeline.sh`](training/run_full_pipeline.sh) | Download → inspect → train → copy to `MobileApp` assets |
| [`training/download_images.py`](training/download_images.py) | Parallel download from `urls_*.txt` |
| [`training/train_nsfw.py`](training/train_nsfw.py) | Two-phase training + TFLite export |

```bash
# WSL Ubuntu — conda env nsfw-gpu, GPU recommended
cd /mnt/c/Users/helmi/OneDrive/Documents/GitHub/PFE/training
bash run_full_pipeline.sh
# Quick test: DOWNLOAD_LIMIT=100 bash run_full_pipeline.sh
```

**Note:** The child app currently ships **Yahoo Open NSFW** `nsfw.tflite` (Sprint 3.9). The trained 5-class model is produced under `training/out/` (gitignored via `training/.gitignore`).

**Debug upload vs device:** `POST /api/debug/classify` and `demo_dashboard.html` use **backend nsfwjs + Tesseract** — not the on-device TFLite pipeline. Use `screen_events` / Metro `[NSFW] TFLite` logs for real monitoring scores.

---

## Multilingual OCR (Sprint 3.10 – 3.14)

The on-device OCR path now covers **English + French + Arabic + Tunisian Derja Arabizi** without sending screenshots off-device.

### On-device (production child app)

| Layer | File | Responsibility |
|-------|------|----------------|
| Primary OCR | `MobileApp/src/services/mixedScriptOcr.ts` | ML Kit `TextRecognition.recognize` (fast path, FR/EN/Arabizi) |
| UI noise filter | `MobileApp/src/utils/cleanOcrText.ts` | Strips timestamps, like counts (`308K`), social UI strings |
| Script detection | `MobileApp/src/utils/normalizeArabizi.ts` | `containsArabicScript` + stricter Arabizi gating (Sprint 3.12) |
| Arabizi normalization | `normalizeArabizi(text)` | Digit/digraph mapping for Derja keyword matching |
| Arabic fallback (Android) | `MobileApp/src/services/mobileArabicOcr.ts` | `@devinikhiya/react-native-tesseractocr` + `ara.traineddata` (lazy init, sequential fallback only when Arabic is detected) |
| Multilingual keyword filter | `MobileApp/src/utils/keywordFilter.ts` | EN / FR / AR / Derja lists; `keywordFilter(text, normalizedText?)` |

**Android OCR flow:** ML Kit runs first on every frame. Tesseract (`ara`) runs **after** ML Kit only when `arabicOcrTrigger.ts` detects Arabic script or garbled Latin from Arabic pages — **not** on English-dominant screens (e.g. Chrome on adult sites). If Tesseract hallucinates Arabic over substantial Latin ML Kit text, the pipeline keeps ML Kit output for keyword matching. Messaging apps skip Tesseract unless ML Kit already saw Arabic Unicode (Latin Derja stays on ML Kit + normalisation).

**Platform note:** on-device Arabic Tesseract is currently enabled on **Android only**. iOS gracefully falls back to ML Kit-only OCR.

### Debug only (server — demo / supervisor)

| Endpoint | Stack | Purpose |
|----------|-------|---------|
| `POST /api/debug/classify` | nsfwjs + Tesseract `eng` | Vision + English OCR combined risk |
| `POST /api/debug/arabic-ocr` | Tesseract `ara` + synced keyword filter | **Arabic Unicode extraction** for demo; images leave device only in this debug tool |

Use **Arabic OCR Debug Tool** in `demo_dashboard.html` to upload a screenshot with Arabic text and verify `سكس` / `قحبة` trigger `category: adult`. Production monitoring still uses on-device pipeline only.

**Arabic OCR accuracy:** Debug endpoint uses Arabic-only Tesseract (`ara`) with 1600px upscale and PSM block/auto. On-device Android fallback also uses Tesseract and may still produce spacing/diacritic noise on low-res social screenshots; keyword filtering remains robust against short OCR artifacts.

**Tests:** Mobile — `normalizeArabizi.test.ts`, `cleanOcrText.test.ts`, `keywordFilterMultilingual.test.ts`. Backend — `arabicOcr.test.ts`, `debugPipeline.test.ts`.

---

**Current milestone:** Sprint **5.8** — dynamic wellbeing proxies (missions + usage), child interests API, interest-based mission tie-breaker; Sprint 5.7 parent dashboard tabs.

---

## Missions & Gamification (Sprint 4–5)

When risk or usage scores cross thresholds, the backend generates age-adapted missions (real-world, quiz, minigame, cognitive). Completing missions awards points; badges unlock automatically; parents define redeemable rewards.

**Note:** All gamification `child_id` values reference `children.id` (same as JWT `childId`), not `users.id`.

### Mission generation triggers

| Trigger | Condition | Source |
|---------|-----------|--------|
| Risky content (single) | `combinedRiskScore > adaptiveThreshold` (7-day avg + 10, clamped 50–80) | `POST /api/screen-events` → `generateMissionFromRisk` |
| Risky content (cumulative) | Sum of last **5** events in 30 min **> 300** (min 3 events) | Same path — allows moderate singles to trigger via burst |
| Low wellbeing | `wellbeingScore < 40` | Daily cron (`dailyScoreJob.ts`) |
| High addiction | `addictionScore > 70` | Daily cron (`dailyScoreJob.ts`) |
| Mobile suggest | Client calls `POST /api/missions/suggest` | Same smart rules as risky content (score defaults to 75) |

**Screen events route:** `POST /api/screen-events` calls `generateMissionFromRisk` for **every** event where `combinedRiskScore != null` (not only scores above a fixed 70), so cumulative burst detection can fire when individual scores are below the adaptive threshold.

**Skip reasons:** `below_risk_threshold`, `cooldown_active`, `pending_limit_reached`.

Rules: max **3 pending** missions per child; missions expire after **24 hours**; cooldown between risky-content missions is `MISSION_RISK_COOLDOWN_MINUTES` (dev **2 min**, prod **15 min**); age from `children.birth_year` adapts template difficulty.

### Smart mission generation (Sprint 4.5)

| Feature | Behaviour |
|---------|-----------|
| **Adaptive threshold** | `AVG(combined_risk_score)` over 7 days + 10, clamped 50–80; defaults to 50 for new children |
| **Cumulative risk** | Last 5 non-null scores in 30 min; trigger if sum > 300 and count ≥ 3 |
| **Category mapping** | `adult` → safety quiz / games / digital detox; `violent`/`gore` → **media & violence quiz** / conflict quiz / kindness / games; `toxic` → kind words / empathy quiz; `dangerous`/`dangerous_challenge` → safety talk / parent chat; unknown → safety quiz / tic-tac-toe |
| **Escalation** | After every 3 `risky_content` missions in 24 h, +30% points per level (max +60% at level 2); applied after template selection |
| **Cooldown** | No new risky mission within 15 min of the last `risky_content` mission |

Addiction/wellbeing daily-score triggers still take priority inside `pickMissionTemplate` over category mapping.

**Migration:** `009_add_screen_events_child_created_idx.sql` — index on `screen_events (child_id, created_at DESC)`.

### Mission types & cognitive validation

| Type | Examples | Completion payload |
|------|----------|-------------------|
| `real_world` | Jumping jacks, family board game, screen-free break | `{ confirmed: true }` |
| `quiz` | Online safety / conflict / empathy quiz | `{ answers: ['A','B','A'] }` — pass if ≥2/3 correct |
| `minigame` | Tic-tac-toe (AI), mini sudoku (4×4) | `{ won: true }` or `{ completed: true }` |
| `cognitive` | N-back, reaction time, Tower of Hanoi | `{ exerciseScore }`, `{ reactionTimeMs }`, `{ moves }` |

Cognitive scoring: N-back proportional to `%` correct; reaction ≤300ms full points; Hanoi optimal (7 moves for 3 disks) = base + 10 bonus.

**Playable mini-games (Sprint 5):** each mission now renders a real interactive component in `MobileApp/src/screens/missions/` instead of a demo button:

| Game | Component | Notes |
|------|-----------|-------|
| Tic-Tac-Toe | `TicTacToeGame.tsx` | Child = X; AI = O with `easy` (random), `medium` (win/block + center), `hard` (minimax, unbeatable) |
| Mini Sudoku 4×4 | `SudokuGame.tsx` | Pre-validated solutions; clue count by difficulty (easy 10 / medium 8 / hard 6) |
| N-back | `NBackGame.tsx` | 20 trials, 1.8s/step; level from `metadata.level`; accuracy 0–100; level rises after ≥80% |
| Reaction time | `ReactionGame.tsx` | Grey→green after random delay; "too soon" guard; average of 3 attempts |
| Tower of Hanoi | `TowerOfHanoiGame.tsx` | Tap-to-select pegs with legality checks; bonus for optimal 7 moves |
| Quiz | `QuizScreen.tsx` | One question at a time; questions from `metadata.questions` or built-in bank (`quizBank.ts`); selected option letters sent as `answers` |

Pure game logic lives in `MobileApp/src/missions/games/gameLogic.ts` (unit-tested in `__tests__/gameLogic.test.ts`).

### Backend API (JWT required except `/health`, `/dev/*`, `/debug/*`)

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/api/missions/suggest` | Child | Mobile compat — create mission from category |
| POST | `/api/missions/generate` | Dev | Manual trigger (non-production) |
| GET | `/api/missions/child/:childId` | Child / Parent | List `pending`, `pendingApproval`, `completed`, `expired`, `failed` |
| GET | `/api/missions/child/:childId/points` | Child / Parent | Total points |
| POST | `/api/missions/:missionId/complete` | Child | Complete mission (`real_world` → `pending_approval`) |
| POST | `/api/missions/:missionId/approve` | Parent | Approve real-world mission, award points |
| POST | `/api/missions/:missionId/reject` | Parent | Reject pending approval → `expired` |
| POST | `/api/missions/:missionId/abandon` | Child | Escape penalty (−10 pts, `failed`) |
| POST | `/api/bonus/child/:childId` | Parent | Award bonus points |
| GET | `/api/custom-missions` | Parent | List custom real-world missions |
| POST | `/api/custom-missions` | Parent | Create custom mission |
| PUT | `/api/custom-missions/:id` | Parent | Update custom mission |
| DELETE | `/api/custom-missions/:id` | Parent | Delete custom mission |
| GET | `/api/rewards` | Parent / Child | List rewards (child sees unclaimed only) |
| POST | `/api/rewards` | Parent | Create reward |
| PUT | `/api/rewards/:rewardId` | Parent | Update reward |
| DELETE | `/api/rewards/:rewardId` | Parent | Delete reward |
| POST | `/api/rewards/:rewardId/claim` | Child | Spend points to claim |
| GET | `/api/badges` | Any | All badges; `?childId=` adds earned status |
| GET | `/api/badges/child/:childId` | Child / Parent | Earned badges |
| GET | `/api/child/profile/:childId` | Parent | Read child display name and `birth_year` |
| PUT | `/api/child/profile` | Parent | Update `birth_year` (re-checks age badges); parent must own child |
| GET | `/api/child/interests/:childId` | Parent | Read child interests (`sports`, `art`, `reading`, `family`, `brain`) |
| PUT | `/api/child/interests` | Parent | Update child interests (parent must own child) |

**Migrations:** `007`–`015` — run `npm run db:migrate` from `backend/` (`010` parent approval/escape; `011` quiz bank; `012` custom missions; `014` child interests; `015` badge cleanup).

**Screen events:** `POST /api/screen-events` response includes `newMission` when a mission is created or **re-surfaced** during cooldown (`missionGeneration` explains `cooldown_active`, etc.). Mobile calls `presentMissionFromCapture()` → native overlay or notification + `MissionScreen`.

**Tests:** `missionGenerator.test.ts`, `missionHelpers.test.ts`, `gamificationService.test.ts`, `missionCompletion.test.ts`, `missionsApproval.test.ts`, `resurface.test.ts`, `quizService.test.ts`, `customMissionService.test.ts`. Mobile game logic: `MobileApp/__tests__/gameLogic.test.ts`.

### Gamification frontend (Sprint 5)

**Mobile app** (`MobileApp/`): React Navigation bottom tabs — Monitor, Missions, Rewards, Badges, Profile. Blocking `MissionScreen` on high-risk capture or when opening an active mission.

| Feature | Behaviour |
|---------|-----------|
| **Parent approval** | Real-world complete → `pending_approval`; parent approves via dashboard |
| **Escape penalty** | Home / app switch during active mission → `POST .../abandon`, −10 points |
| **Bonus points** | Parent awards via dashboard → `POST /api/bonus/child/:childId` |
| **Auto-mission** | `newMission` in screen-event response → **SYSTEM_ALERT_WINDOW overlay** on Android (blocks Instagram/other apps); fallback: notification + `MissionScreen` |
| **Smart difficulty** | Age baseline (`<10` easy, `≥13` hard) + on-device performance store (`gameStats.ts`); strong runs escalate one step; N-back level persists across missions |
| **Points refresh** | Pull on focus / pull-to-refresh; optional 60s poll on Missions & Profile (no push) |

**Parent dashboard:** [`http://localhost:3000/demo.html`](http://localhost:3000/demo.html) (served from `backend/public/demo.html`). Root [`demo_dashboard.html`](demo_dashboard.html) is kept in sync. **For browser notifications, use the backend URL** — `file://` may block notifications.

Two tabs:

| Tab | Contents |
|-----|----------|
| **Monitoring** | Vision model debug, Arabic OCR debug, summary cards, 7-day scores chart, recent screen events, API activity log |
| **Parent Dashboard** | Child profile from API (`GET/PUT /api/child/profile` — editable birth year), **child interests editor** (`GET/PUT /api/child/interests`), latest addiction/wellbeing scores, total points & level (`GET /api/scores/:childId`), pending approvals (approve/reject with toasts), mission history (completed + expired, last 20 with dates), earned badges (`GET /api/badges/child/:childId`), active rewards + claimed history, bonus points, escape log, custom missions |

All actions use `fetchWithAuth(path, { method, body })` with the parent JWT from `GET /api/dev/parent-token`.

**Mission overlay (Android):** grant **Settings → Display over other apps** for the child app. Native `OverlayService` shows a full-screen card on Chrome/Instagram/etc.; see [`MobileApp/android/NATIVE_SETUP.md`](MobileApp/android/NATIVE_SETUP.md). **Rebuild required** after native overlay changes (`npm run android`).

**Limitations (Sprint 5):**

- Quiz/cognitive games are **fully playable** with real scoring. The quiz question bank (`quizBank.ts`) is curated for the existing categories; production should expand it and/or store questions in mission metadata.
- **Smart difficulty** is stored **on-device** (`AsyncStorage`) rather than a server `child_game_stats` table — adaptive per device; server-side persistence is future work.
- **Escape penalty** applies when `AppState` goes to background (Home) **and** when the child quits/leaves `MissionScreen`. **Force-closing the app does not trigger a penalty.**
- **Future:** server-side inactivity timeout to auto-fail abandoned missions.
- **No FCM** — parent uses dashboard browser notifications (30s poll). FCM wiring is documented as optional; the mobile app already uses a native high-priority notification fallback for missions, so no extra RN push package is required.
- **Overlay permission** — child must grant **Display over other apps** (`Settings.canDrawOverlays`) for auto-block on third-party apps. Without it, a high-priority notification opens `MissionScreen` when the user returns to SafeGuard.
- **Risky-mission cooldown** — after a risky-content mission is created, new ones are suppressed for `MISSION_RISK_COOLDOWN_MINUTES` (dev default **2 min**, prod **15 min**). During cooldown, a further risky capture **re-surfaces the existing pending mission**: its `expires_at` is extended by **24 h** and its points increase by **+5** (capped at **+50%** of the base value) so it cannot be ignored (`bumpResurfacedMission`).

### Badge categories (Sprint 4.1)

| Category | `requirement_type` | Examples | How earned |
|----------|-------------------|----------|------------|
| **Point badges** | `total_points` | Rising Star (100), Explorer (500), Legend (10,000) | Lifetime `child_points.total_points` threshold |
| **Mission badges** | `missions_completed` | First Steps (1), Helper (10), Guardian Angel (500) | Count of completed missions |
| **Age badges** | `age_range` | Little Explorer (6-9), Young Adventurer (10-12), Teen Champion (13-17) | Auto-awarded from `children.birth_year` on `checkAndAwardBadges` |
| **Special badges** | `wellbeing_score_streak`, `cognitive_exercises_done`, `trigger_reason_count` | Well-being Warrior, Brain Trainer, Risk Buster | Legacy Sprint 4 rules |

Age ranges are stored in `badges.requirement_config` JSONB (`{"min":10,"max":12}`). Only **one** age badge per child is kept — `PUT /api/child/profile` revokes mismatched age bands (and deducts their bonus points) before re-awarding the matching band.

**Badge cleanup (`015_badge_cleanup.sql`):** Removes legacy duplicate definitions (`First Mission`, `Mission Master`) and cleans existing `child_badges` rows that no longer match the child's age. Superseded by **First Steps** / **Helper**.

**Badge ranks guide (UX):** Parent dashboard **Badge ranks** button (earned-badges card) and child app **Ranks** header action open a progress view: all tiers grouped by category, current points/missions, progress bars toward the next point/mission badge, and locked special badges with requirement text.

**Migration:** `008_add_smart_badges.sql` adds tiered point/mission badges and age badges.

**Smoke test (API running on port 3000):**

```powershell
cd backend
npm run dev          # separate terminal
npm run smoke:missions
```

Script: [`backend/scripts/smoke-missions.ps1`](backend/scripts/smoke-missions.ps1) — health, dev tokens, generate/list/complete mission, points, badges, parent reward + child claim.

**Sprint 5.8 smoke (wellbeing proxies + interests):**

```powershell
cd backend
npm run dev          # separate terminal
npm run smoke:sprint58
```

Script: [`backend/scripts/smoke-sprint58.ts`](backend/scripts/smoke-sprint58.ts) — interests API, age-based screen caps, mission tie-breaker (multiple ages/interests), wellbeing proxy seeding, daily score job, scores/level API, parent approval → physical proxy increment.

**Sprint 5.9 backend tests (birth year, badge ranks data, screen caps):**

```powershell
cd backend
npm run dev          # separate terminal
npm run test:sprint59
```

Script: [`backend/scripts/test-sprint59.ts`](backend/scripts/test-sprint59.ts) — `GET/PUT /api/child/profile`, age badge re-award (`POST /api/dev/reward-age-badges/:childId`), `fetchRecommendedScreenMinutes` caps (120/150/180), ranks source data (`/api/badges?childId=`, points, mission count, level). Prints a manual UI checklist on success.

---

## Sprint 5.5 – Dynamic quiz bank & custom missions

| Feature | Details |
|---------|---------|
| **Quiz bank** | Table `quiz_questions` (`011_quiz_questions.sql`, `013_quiz_media_violence.sql`) — types `safety`, `media_violence`, `conflict`, `empathy`; filtered by child age (`age_min` / `age_max`). `quizService.getRandomQuestions` + `enrichQuizMetadata` attach questions to quiz missions at generation time. Mobile `QuizScreen` reads `metadata.questions` (falls back to `quizBank.ts` if empty). |
| **Custom missions** | Table `custom_missions` (`012_custom_missions.sql`) — parent CRUD via `GET/POST/PUT/DELETE /api/custom-missions`. Active missions are merged into real-world template pools in `pickMissionTemplate`. |
| **Dashboard** | **Custom real-world missions** section on [`demo_dashboard.html`](demo_dashboard.html) and [`backend/public/demo.html`](backend/public/demo.html) — create, edit, delete. |
| **OCR false positives** | `benignRiskContext` filters `nsfw` / `adult` on SafeSearch/Fiverr parental UI and parent-dashboard OCR; wired in mobile + backend `keywordFilter`. |
| **Risky web search** | `riskySearchContext` boosts `nsfw` / `adult` when OCR shows an explicit query on Google/Bing/DuckDuckGo search URLs (complements benign filters). |
| **Native overlay games** | `OverlayQuizHelper` / `OverlayMissionLauncher` — quiz and minigame/cognitive missions open in-app from overlay; `missionCaptureSession` dedupes capture while a mission is active. |
| **Risky cooldown** | New risky missions are blocked only while a **pending** risky mission exists (completed missions no longer suppress the next capture). Re-surface still bumps pending missions during cooldown. |
| **Adult mission pool** | `adult` category includes quizzes and minigames, not only real-world templates. |
| **Overlay → game** | Quiz / minigame / cognitive overlay primary button emits `start` and opens `MissionScreen` (no API auto-complete from overlay). |

**Add quiz questions (SQL example):**

```sql
INSERT INTO quiz_questions (quiz_type, question_text, options, correct_answer_index, age_min, age_max)
VALUES ('safety', 'Your question?', ARRAY['Wrong', 'Correct', 'Wrong2', 'Wrong3'], 1, 6, 12);
```

**Migrations:** run `npm run db:migrate` from `backend/` after pulling (applies `011` and `012`).

**Tests:** `quizService.test.ts`, `customMissionService.test.ts`, `benignRiskContext.test.ts`, `riskySearchContext.test.ts` (mobile + backend), extended `missionGenerator.test.ts` and `missionHelpers.test.ts`.

---

## Next Steps (post Sprint 5.5)

1. **Server-side game stats** – persist `child_game_stats` so smart difficulty follows the child across devices.
2. **Parent dashboard polish** – multi-child list (`GET /api/children`), mission history charts.
3. **FCM push** (optional) – replace dashboard polling for approvals.
4. **Quiz admin UI** – web form to add/edit questions without raw SQL.

---

## Documentation for Final Report

Planned artefacts under `docs/`:

| Document | Purpose |
|----------|---------|
| `SRS.md` | Software requirements (from cahiers des charges) |
| `architecture.md` | Component diagrams and deployment views |
| `scoring_formulas.md` | Mathematical definitions for scores |
| `testing_strategy.md` | Unit, integration, manual test plans |
| `deployment.md` | Production deployment guide |
| `scrum_artifacts.md` | Sprint planning, retrospectives |

The final PFE report (PDF) will reference this repository and README.

---

## License

This project is developed for **educational purposes** as part of the ESPRIT PFE (final year project). All rights reserved by the author and the internship host organisation.

**Maintainer:** [Helmi Megdiche](https://github.com/Helmi-Megdiche)  
**Last updated:** 5 June 2026  
**Status:** Sprint 5.8 complete — dynamic wellbeing proxies, child interests, mission personalization; Sprint 5.7 parent dashboard; on-device OCR + TFLite NSFW (Sprint 3.14).
