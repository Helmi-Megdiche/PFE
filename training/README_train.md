# Sprint 3.8 — NSFW detector training (`train_nsfw.py`)

Fine-tune **EfficientNetV2B0** (ImageNet weights) on the **NSFW Data Scraper** dataset and export a quantized TensorFlow Lite model for on-device inference inside the MobileApp.

> **Target hardware:** Windows 11 + RTX 3050 6 GB + Python 3.10/3.11 + CUDA-enabled TensorFlow.

---

## 1. Dataset layout

Expected on disk (default path is hard-coded but can be overridden):

```
C:\Users\helmi\OneDrive\Bureau\PFE-Docs\data\nsfw_scraper\
├── drawings\
├── hentai\
├── neutral\
├── porn\
└── sexy\
```

Each folder must contain `.jpg` / `.png` images. The script automatically does an **80 / 20 train/val split** via `ImageDataGenerator(validation_split=0.2)`.

---

## 2. Environment setup

```powershell
# from the repo root
cd training

# 1) Create a venv (Python 3.10 or 3.11 — TF 2.15 requires <=3.11)
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2) Install pinned dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

### GPU support (RTX 3050)

TensorFlow 2.15 needs **CUDA 12.2** and **cuDNN 8.9** drivers. The easiest way on Windows is to keep TF on **WSL2 Ubuntu** or use the `tensorflow[and-cuda]` extra:

```powershell
pip install "tensorflow[and-cuda]==2.15.0"
```

Verify the GPU is visible:

```powershell
python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"
```

If the list is empty, training falls back to CPU (works but very slow — keep batch size small).

---

## 3. Run

```powershell
python train_nsfw.py
```

Override anything you want:

```powershell
python train_nsfw.py `
  --data-dir "C:\Users\helmi\OneDrive\Bureau\PFE-Docs\data\nsfw_scraper" `
  --output-dir .\out `
  --batch-size 32 `
  --fallback-batch-size 16 `
  --phase1-epochs 8 `
  --phase2-epochs 5 `
  --unfreeze-last 20
```

### What the script does

1. **GPU memory growth** — avoids preallocating the full 6 GB.
2. **Data generators** — train + val with light augmentation (rotation 15°, shift 10 %, zoom 10 %, horizontal flip).
3. **Phase 1 — head only (8 epochs):** base frozen, `Adam(lr=1e-3)`, head = GAP → Dropout(0.3) → Dense(128, relu) → Dropout(0.2) → Dense(5, softmax).
4. **Phase 2 — fine-tune (5 epochs):** last 20 layers of EfficientNetV2B0 unfrozen, `Adam(lr=1e-5)`.
5. **Callbacks:** `EarlyStopping(patience=3, restore_best_weights=True)`, `ModelCheckpoint(save_best_only=True)`, `ReduceLROnPlateau`.
6. **OOM handling:** if `batch_size=32` raises `ResourceExhaustedError`, retries automatically at `16`.
7. **Export:**
   - `out/nsfw_model.h5` — final Keras model
   - `out/nsfw_best.h5` — best checkpoint by `val_accuracy`
   - `out/nsfw_detector.tflite` — dynamic-range quantized (~4× smaller)
   - `out/training_history.png` — accuracy + loss curves
   - `out/labels.txt` — class names in the index order printed at startup

The console prints `class_indices` (e.g. `{'drawings': 0, 'hentai': 1, 'neutral': 2, 'porn': 3, 'sexy': 4}`) — **save this mapping**; the mobile inference code will need it in the exact same order.

---

## 4. After training

Once `out/nsfw_detector.tflite` exists, copy it into the Android assets folder:

```powershell
$src = ".\out\nsfw_detector.tflite"
$dst = "..\MobileApp\android\app\src\main\assets\models\nsfw_detector.tflite"
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
Copy-Item $src $dst -Force
```

Also commit `labels.txt` next to it so the mobile classifier reads the same order.

The replacement of the heuristic `MobileApp/src/services/nsfwClassifier.ts` with a real TFLite inference module will be done in a follow-up task (Sprint 3.9).

---

## 5. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Could not load dynamic library 'cudart64_*.dll'` | Install matching CUDA 12.2 / cuDNN 8.9 or use `tensorflow[and-cuda]`. |
| `ResourceExhaustedError: OOM when allocating ...` | The script retries at batch 16 automatically. If it still fails, lower `--batch-size` to 8 and reduce `--unfreeze-last` to 10. |
| Class imbalance (porn ≫ drawings) | Add `class_weight=...` in `model.fit` or downsample manually. Not enabled by default. |
| `.h5` save fails on Windows OneDrive | Move `--output-dir` outside OneDrive (e.g. `D:\models\nsfw`). |
| Training is too slow on CPU | Drop `--phase1-epochs` to 3 and `--phase2-epochs` to 2 just to validate the pipeline. |

---

**Expected runtime on RTX 3050 6 GB:** roughly **40 – 80 min** total for ~100 k images at batch 32 (≈3 – 5 min/epoch in phase 1, slightly more in phase 2).
