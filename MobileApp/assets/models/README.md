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

## TFLite on React Native 0.74.5

`react-native-fast-tflite` requires **react-native-nitro-modules**, which targets newer React Native (0.76+). This project uses **RN 0.74.5**, so vision runs on:

1. **ML Kit Image Labeling** (primary)
2. **Development mock** (filename heuristics)

To add TFLite later: upgrade React Native or use a TF Lite bridge compatible with 0.74, then bundle `nsfw_violence.tflite` under `android/app/src/main/assets/models/`.

## Install a real model (after RN / TFLite upgrade)

1. Obtain or train a MobileNet-based NSFW / violence detector exported to `.tflite`.
2. Copy to `MobileApp/android/app/src/main/assets/models/nsfw_violence.tflite`.
3. Rebuild: `cd MobileApp && npm run android`.

## Development mock

Without a `.tflite` file, `imageClassifier.ts` uses filename/path keywords (`violence`, `blood`, `adult`, `education`, …) so you can test the API pipeline without a trained model.
