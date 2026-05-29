# Tesseract `traineddata` (on-device Arabic OCR fallback)

Sprint 3.14 enables Android on-device Arabic OCR through
`@devinikhiya/react-native-tesseractocr` in
`MobileApp/src/services/mobileArabicOcr.ts`.

The capture pipeline is ML Kit-first, then optional Tesseract fallback:

1. ML Kit runs on every screenshot (fast path)
2. If Arabic Unicode is detected, Android fallback calls Tesseract (`ara@eng`)
3. OCR remains sequential (no ML Kit/Tesseract concurrency)

## Required file

- `ara.traineddata` — Arabic model (required for fallback)

Recommended source: https://github.com/tesseract-ocr/tessdata_best

Keep file name exact and place at:
`android/app/src/main/assets/tessdata/ara.traineddata`

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
