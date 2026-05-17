# MobileApp — end-to-end test

## Prerequisites

- Backend: `npm run dev` in `backend/` (port 3000)
- Docker Postgres: `npm run db:up` in `backend/`
- Android emulator (API 29+) or USB device

## 1. Apply dev seed (once)

```powershell
cd backend
npm run db:migrate
```

## 2. Start Metro

```powershell
cd MobileApp
npm start
```

## 3. Fix Gradle + OneDrive (if build fails)

OneDrive can lock `.gradle` files. Run:

```powershell
cd MobileApp\android
.\gradlew.bat --stop
Remove-Item -Recurse -Force .gradle -ErrorAction SilentlyContinue
.\gradlew.bat clean
cd ..
npm run android
```

**Better long-term:** move the repo outside OneDrive, or exclude `MobileApp/android/.gradle` from sync.

## 4. Run Android (second terminal)

```powershell
cd MobileApp
npm run android
```

## 5. JWT (automatic in dev)

`App.tsx` calls `GET http://10.0.2.2:3000/api/dev/child-token` on first launch.

Manual check in browser: http://localhost:3000/api/dev/child-token

## Debug logs in Metro

All steps are prefixed with `[ScreenCapture]` in the Metro terminal.

Native Android logs are forwarded as `[ScreenCapture] [Native] …`.

Optional logcat filter:

```powershell
adb logcat -s ScreenCaptureModule
```

## 6. Verify pipeline

1. Enable monitoring in the app
2. Accept MediaProjection
3. Backend logs + `screen_events` rows with `extracted_text_preview`

Real device: set `DEV_LAN_HOST` in `src/config/apiConfig.ts` to your PC Wi‑Fi IP (`ipconfig`). Phone and PC must be on the same network. Allow port 3000 in Windows Firewall.
