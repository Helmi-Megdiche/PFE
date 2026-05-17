# MobileApp — React Native project setup

## What worked (May 2026)

| Attempt | Result |
|---------|--------|
| `npx react-native@0.74.5 init` + `--template react-native-template-typescript` | Failed at **Copying template** |
| `npx @react-native-community/cli@latest init` | Prompted to overwrite partial `.git` |
| **`npx @react-native-community/cli@14.1.0 init MobileApp --pm npm --version 0.74.5`** | **Success** |

## Create from scratch (if needed again)

```powershell
cd C:\Users\helmi\OneDrive\Documents\GitHub\PFE
Remove-Item -Recurse -Force MobileApp -ErrorAction SilentlyContinue
npm cache clean --force
npx @react-native-community/cli@14.1.0 init MobileApp --pm npm --version 0.74.5
```

## PFE code merged into this project

- `src/` — ScreenMonitor, useScreenshotCapture, apiClient, JWT bootstrap
- `android/.../com/mobileapp/screencapture/` — Java MediaProjection module
- See `android/NATIVE_SETUP.md` for run instructions

## Legacy folder

The older `../mobile/` folder was a scaffold without a full RN template. Use **`MobileApp/`** as the main React Native app going forward.
