# Android native setup — ScreenCapture

Package: `com.mobileapp.screencapture` (matches `applicationId` `com.mobileapp`).

## Already configured

- `ScreenCapturePackage` registered in `MainApplication.kt`
- `MainActivity.kt` forwards `onActivityResult`
- `minSdkVersion` 29, MediaProjection permissions in `AndroidManifest.xml`

## Install JS dependencies

```bash
cd MobileApp
npm install @react-native-ml-kit/text-recognition @react-native-async-storage/async-storage
```

## Run

```bash
npm start
npm run android
```

## JWT

Set a child JWT in AsyncStorage before testing API sync:

```ts
import { tokenStorage } from './src/auth/tokenStorage';
await tokenStorage.setToken('YOUR_CHILD_JWT');
```

## Troubleshooting project creation

If `npx react-native init` fails with `template.config.js` errors:

```bash
npm cache clean --force
npx @react-native-community/cli@14.1.0 init MobileApp --pm npm --version 0.74.5
```

This project was created with **CLI 14.1.0 + RN 0.74.5** (Option 1 failed on template copy; pinned CLI version worked).
