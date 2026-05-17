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

Grant **MediaProjection** when prompted. Screen monitoring starts automatically via `ScreenMonitor`.

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
  "riskScore": 85,
  "category": "toxic"
}
```

**Response:** `201 Created` with stored event.

### `GET /api/screen-events/:childId` (parent)

Returns screen events for the given child (JWT must match parent/child roles as implemented in middleware).

### Planned (Sprint 2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/usage` | Foreground app usage sessions |
| GET | `/api/scores/:childId` | Addiction & well-being scores |
| GET | `/api/usage/:childId` | Usage history for dashboard |

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

| Sprint | Dates | Status | Deliverable |
|--------|-------|--------|-------------|
| 1 | 18 – 31 May 2026 | Complete | Screen monitoring, on-device OCR, keyword filter, JWT API, `screen_events` storage |
| 2 | 1 – 14 June 2026 | Planned | Foreground usage tracking, scoring engine, cron, dashboard endpoints |
| 3 | 15 – 28 June 2026 | Planned | TFLite classification, mission generation |
| 4 | 29 June – 12 July 2026 | Planned | Gamification, parent web dashboard |
| 5 | 13 – 31 July 2026 | Planned | Hardening, tests, final demo & report |

**Current milestone:** Sprint 1 – end-to-end pipeline verified (`screen_events` contains live OCR data).

---

## Next Steps (Sprint 2)

1. **Foreground usage tracker** – React Native module / hook sending app open-close events to `POST /api/usage`.
2. **Scoring engine** – addiction risk and digital well-being formulas on aggregated usage.
3. **Cron job** – daily score computation with `node-cron`.
4. **Parent dashboard API** – `GET /api/scores/:childId`, `GET /api/usage/:childId`.

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
**Last updated:** 17 May 2026  
**Status:** Sprint 1 complete – ready for demonstration and Sprint 2.
