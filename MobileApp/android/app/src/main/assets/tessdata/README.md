# Tesseract `traineddata` (optional Arabic / mixed-script OCR fallback)

The mobile pipeline uses **ML Kit Text Recognition** as its primary OCR engine
and applies Tunisian Arabizi normalization to catch Derja terms written with
Latin letters and digits (see `MobileApp/src/utils/normalizeArabizi.ts`).

A **secondary Tesseract path** is wired up in
`MobileApp/src/services/mixedScriptOcr.ts` for screenshots that contain Arabic
Unicode characters or strong Arabizi patterns. The Tesseract path is **disabled
at runtime** unless a JS or native Tesseract module is reachable; on
React Native 0.74 the `tesseract.js` web build does not run reliably, so this
folder is reserved for a future native bridge (e.g. `tess-two` or a custom JNI
module) that mmap's `.traineddata` from APK assets.

## Files to drop here (when enabling)

Download the **`tessdata_fast`** variants (≈ 1–5 MB each, good accuracy / speed
trade-off) and place them next to this README:

- `ara.traineddata` — Arabic (script: Arabic)
- `fra.traineddata` — French (script: Latin)
- `eng.traineddata` — English (script: Latin)

Source: https://github.com/tesseract-ocr/tessdata_fast

These files are intentionally **not committed** to keep the repository small.
They are loaded at runtime by the future native Tesseract bridge.

## Build config

`android/app/build.gradle` already declares:

```groovy
android {
    aaptOptions {
        noCompress 'traineddata', 'tflite'
    }
}
```

so the `.traineddata` files stay raw in the APK and can be mmap'd directly
without an extra copy-to-`filesDir` step.
