# On-device NSFW TFLite model

## Production model (Sprint 3.9)

| File | Source |
|------|--------|
| `android/app/src/main/assets/models/nsfw.tflite` | [flutter_nude_checker release](https://github.com/xeron56/flutter_nude_checker/releases/download/1.0.0/nsfw.tflite) (Yahoo Open NSFW) |

The React Native bridge loads this asset via native module `NsfwTflite` (not `react-native-fast-tflite`, which requires RN 0.76+ / Nitro Modules).

**Output:** `[sfw, nsfw]` probabilities — use index `1` as `nsfwScore` (0 = safe, 1 = explicit).

**Input:** 224×224 RGB, mean-subtracted BGR channels (104, 117, 123) — same as `flutter_nude_checker`.

## Rebuild after adding/changing models

```bash
cd MobileApp
npm run android
```

## Debug

In `__DEV__`, the app shows **NSFW TFLite debug** — tap **Classify last capture** after a screen capture to log `riskScore` and TFLite outputs.
