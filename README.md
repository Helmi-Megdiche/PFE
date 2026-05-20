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
3. The hook `useScreenshotCapture` loads the image, runs **ML Kit OCR**, and applies the **keyword filter**.
4. Only extracted text (≤500 chars), risk flag, category, and metadata are sent to `POST /api/screen-events` – the image is deleted immediately.
5. Backend stores metadata in the `screen_events` table.

### Adaptive Capture

Sprint **3.7** replaces a fixed periodic interval with a **risk-based adaptive strategy** so the app reacts quickly after risky content without draining the battery when risk is low.

| Trigger | When it fires |
|---------|----------------|
| **App switch** | Foreground app changes (UsageStats poll every 1s) → immediate `captureNow()` |
| **Follow-up** | 5 seconds after app switch, unless a capture completed within the last 2 seconds |
| **Periodic (adaptive)** | Rolling average of the last **3** `combinedRiskScore` values sets the interval |

| Average risk (last 3 captures) | Periodic interval |
|--------------------------------|-------------------|
| > 70 | 10 seconds |
| 30 – 70 | 30 seconds |
| < 30 | 60 seconds |

**Debounce:** at least **5 seconds** between any two captures (JS + native `captureNow`). **UX:** no extra popups beyond MediaProjection and the foreground-service notification; Usage access is optional but improves `appPackage` / `appLabel` accuracy.

Implementation: `MobileApp/src/hooks/useScreenshotCapture.ts`, `MobileApp/src/utils/adaptiveCapture.ts`, native `ForegroundAppModule` (UsageStats) and `ScreenCaptureModule.captureNow()`.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Mobile frontend | React Native 0.74.5 + TypeScript |
| Native module | Java (MediaProjection API, foreground service) |
| OCR | `@react-native-ml-kit/text-recognition` (Google ML Kit, on-device) |
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
├── MobileApp/                     # Primary React Native app (use this)
│   ├── android/
│   │   └── app/src/main/java/com/mobileapp/
│   │       ├── screencapture/     # ScreenCaptureModule, Package
│   │       └── MediaProjectionForegroundService.java
│   ├── src/
│   │   ├── components/ScreenMonitor.tsx
│   │   ├── hooks/useScreenshotCapture.ts
│   │   ├── services/              # apiClient, screenEventsApi
│   │   ├── config/apiConfig.ts
│   │   └── utils/keywordFilter.ts
│   └── package.json
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

Grant **MediaProjection** when prompted. Screen monitoring starts automatically via `ScreenMonitor`. Usage tracking runs via `UsageTracker` / `useForegroundTracker` (AppState MVP).

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
      "appPackage": "com.mobileapp",
      "appCategory": "unknown"
    }
  ]
}
```

**Response:** `{ "count": 1 }`

### `GET /api/usage/:childId?date=YYYY-MM-DD` (parent)

Returns raw sessions for a calendar day (defaults to today).

### `GET /api/scores/:childId?date=YYYY-MM-DD` (parent)

Returns addiction and well-being scores for a date. Without `date`, returns the latest stored score.

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
- **Minimal permissions:** MediaProjection, foreground service, Internet.
- **Explicit consent** required before monitoring starts (MediaProjection dialog).
- Designed with **GDPR / COPPA** principles: data minimisation, on-device processing.

---

## Sprint Status

| Sprint | Dates | Status | Summary |
|--------|-------|--------|---------|
| **1** | 18 – 31 May 2026 | Complete | **OCR + JWT backend** — MediaProjection capture, on-device ML Kit OCR, keyword filter, `POST /api/screen-events`, JWT auth, `screen_events` storage |
| **2** | 1 – 14 June 2026 | Complete | **Usage-based scoring + cron** — foreground usage sessions (`POST /api/usage`), addiction & well-being scoring engine, `node-cron` daily aggregation, score & trend APIs |
| **3** | 15 – 28 June 2026 | Complete | **Vision model + combined risk** — ML Kit image labeling + nsfwjs-style proxy on device, `combinedRiskScore = OCR×0.3 + vision×0.7`, extended `screen_events` fields |
| **3.5** | — | Complete | **Debug & foreground** — `POST /api/debug/classify` (backend nsfwjs + Tesseract OCR), `demo_dashboard.html`, `ForegroundAppModule` (UsageStats), shared `riskMapping.ts` (mobile + backend), `app_label` migration |
| **3.6** | — | Complete | **Accuracy improvements** — expanded ML Kit mapping (weapons, drugs, gore, adult, hentai proxy), `enforceCategoryConsistency`, explicit OCR boosts & overrides, `nsfwClassifier` proxy (no tfjs on device) |
| **3.7** | — | Complete | **Adaptive capture** — immediate capture on app switch, follow-up after 5s, risk-based dynamic intervals (10s / 30s / 60s from rolling average of last 3 scores), 5s debounce |
| **3.8** | — | Complete | **NSFW model training** — fine-tune EfficientNetV2B0 on the NSFW Data Scraper dataset (5 classes), export quantized `.tflite`. See [`training/README_FINETUNE.md`](training/README_FINETUNE.md) |
| **3.9** | — | Complete | **On-device NSFW TFLite** — Yahoo Open NSFW `nsfw.tflite` via native `NsfwTflite` module (RN 0.74–compatible), replaces ML Kit heuristic proxy for adult score |
| **4** | 29 June – 12 July 2026 | Planned | Gamification, parent web dashboard |
| **5** | 13 – 31 July 2026 | Planned | Hardening, tests, final demo & report |

**Current milestone:** Sprint **3.9** — on-device Yahoo Open NSFW TFLite classification merged with ML Kit + OCR risk pipeline.

---

## Sprint 3 – Image classification (on-device)

After each screenshot, **OCR** and **image classification** run in parallel:

| Step | Module | Output |
|------|--------|--------|
| 1 | ML Kit OCR | Text preview + keyword risk |
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

**Note:** The child app currently ships **Yahoo Open NSFW** `nsfw.tflite` (Sprint 3.9). The trained 5-class model is produced under `training/out/` (gitignored).

---

## Next Steps (Sprint 4)

1. **Real-world missions** – triggered when `combined_risk_score` exceeds thresholds.
2. **Gamification** – points, badges, parent-defined rewards.
3. **Parent web dashboard** – visualize vision + usage + scores.

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
**Last updated:** 20 May 2026  
**Status:** Sprint 3.9 complete – on-device Yahoo Open NSFW TFLite; Sprint 3.8 training pipeline in `training/`.
