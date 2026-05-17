# TFLite image classifier model

## Expected layout

| File | Purpose |
|------|---------|
| `nsfw_violence.tflite` | 5-class classifier (see `labels.txt`) |
| `labels.txt` | One class name per line (already provided) |

## Class order (output index)

0. `safe`
1. `violent`
2. `adult`
3. `gore`
4. `dangerous_challenge`

The model must output a **5-float probability vector** (softmax), input typically **224×224×3** RGB normalized to `[0, 1]`.

## Install a real model (production)

1. Obtain or train a MobileNet-based NSFW / violence detector exported to `.tflite`.
2. Copy the file to **both**:
   - `MobileApp/assets/models/nsfw_violence.tflite` (Metro bundle), and
   - `MobileApp/android/app/src/main/assets/models/nsfw_violence.tflite` (runtime load on Android).
3. Rebuild the app: `cd MobileApp && npm run android`.

Until the file exists, the app uses the **development mock** (path heuristics) and **ML Kit Image Labeling** as fallback.

## Development mock

Without a `.tflite` file, `imageClassifier.ts` uses filename/path keywords (`violence`, `blood`, `adult`, `education`, …) so you can test the API pipeline without a trained model.
