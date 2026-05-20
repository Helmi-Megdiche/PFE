# Sprint 3.8 — NSFW detector training (`train_nsfw.py`)

Fine-tune **EfficientNetV2B0** (ImageNet weights) on the **NSFW Data Scraper** dataset and export a quantized TensorFlow Lite model for on-device inference inside the MobileApp.

> **Target hardware:** Windows 11 + RTX 3050 6 GB.

> **GPU training:** Use **WSL2 Ubuntu** (see [§ GPU training (RTX 3050)](#gpu-training-rtx-3050)). Native Windows `tensorflow==2.15.0` installs **`tensorflow-intel` (CPU only)** — `Built with CUDA: False` and `GPUs: []` even with NVIDIA drivers installed.

---

## GPU training (RTX 3050)

Your RTX 3050 is visible in WSL (`nvidia-smi` works). TensorFlow 2.15 **does not use the GPU on native Windows**; `tensorflow[and-cuda]` also fails there because `nvidia-nccl-cu12` is not published for Windows (NCCL is Linux-only; not needed for a single GPU).

### One-time setup (from PowerShell)

```powershell
cd C:\Users\helmi\OneDrive\Documents\GitHub\PFE\training
wsl -d Ubuntu bash setup_gpu_wsl.sh
```

This installs Miniconda (no `sudo`), creates env `nsfw-gpu` with Python 3.10, and installs `tensorflow[and-cuda]==2.15.0`. First run downloads ~2 GB — allow 10–15 minutes.

### Train on GPU (every session)

```powershell
wsl -d Ubuntu
```

```bash
cd /mnt/c/Users/helmi/OneDrive/Documents/GitHub/PFE/training
source ~/miniconda3/etc/profile.d/conda.sh
conda activate nsfw-gpu

# Confirm GPU (must NOT be empty)
python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"

python train_nsfw.py \
  --data-dir "/mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper" \
  --output-dir ./out \
  --batch-size 32
```

Outputs land in `training/out/` on the Windows drive (same folder from Explorer).

### Pip typo

Use a **space** after `pip`: `python -m pip install` — not `python -m pipinstall`.

---

## 1. Dataset layout

Expected on disk (default path is hard-coded but can be overridden):

```
C:\Users\helmi\OneDrive\Bureau\PFE-Docs\data\nsfw_scraper\
├── raw_data\
│   ├── porn\IMAGES\*.jpg      ← after step 2 download
│   ├── sexy\IMAGES\*.jpg
│   └── ...
└── data\train\                ← after scripts/5_create_train_.sh (optional)
    ├── porn\*.jpg
    └── ...
```

**If you only see `urls_*.txt` files (no images), training will fail with 0 samples.** Run the scraper download step first (below).

The script automatically does an **80 / 20 train/val split** via `ImageDataGenerator(validation_split=0.2)`.

---

## 1b. Download images (required)

The repo ships **URL lists only** until you download images (~100k+ files, many GB, hours).

From WSL (in the `nsfw_scraper` repo root):

```bash
cd /mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper
docker build . -t docker_nsfw_data_scraper
docker run --rm -v "$(pwd):/app" docker_nsfw_data_scraper bash scripts/2_download_from_urls_.sh
```

Optional but recommended — flatten into `data/train/`:

```bash
docker run --rm -v "$(pwd):/app" docker_nsfw_data_scraper bash scripts/5_create_train_.sh
```

Then train with either:

- `--data-dir .../raw_data` (script symlinks `class/IMAGES/` automatically), or  
- `--data-dir .../data/train` (flat layout after step 5).

---

## 2. Environment setup

```powershell
# from the repo root
cd training

# 1) List installed Python versions (you likely have 3.10, not 3.11)
py --list

# 2) Create a venv — use 3.10 (TF 2.15 does NOT support 3.13 yet)
py -3.10 -m venv .venv

# 3) Activate (PowerShell)
.\.venv\Scripts\Activate.ps1

# 4) Install pinned dependencies (skip pip upgrade if you get WinError 5)
python -m pip install -r requirements.txt
# Optional GPU build (RTX 3050) — replaces CPU-only tensorflow-intel:
# python -m pip install "tensorflow[and-cuda]==2.15.0"
```

### Windows `.venv` (CPU only — smoke tests)

The PowerShell `.venv` with `pip install -r requirements.txt` is fine for **testing the script**, but training will be **very slow** (`GPUs: []`). For real training, use [GPU training (RTX 3050)](#gpu-training-rtx-3050) above.

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
| `No suitable Python runtime found` for `py -3.11` | Run `py --list`. Use **`py -3.10 -m venv .venv`** (you have 3.10 + 3.13; do **not** use 3.13 for TF 2.15). |
| `Activate.ps1` not found | The venv was never created — fix Python version first, then re-run `py -3.10 -m venv .venv`. |
| `WinError 5` upgrading pip | Harmless on Windows — pip often ends up at 26.x anyway. **Skip** `pip install --upgrade pip`; use `python -m pip install -r requirements.txt` instead. |
| `python` opens Microsoft Store | Use **`py`** or **`.\.venv\Scripts\python.exe`** instead of bare `python`. |
| `nvidia-nccl-cu12` not found (Windows) | Expected — use **WSL2** + `setup_gpu_wsl.sh`, not `tensorflow[and-cuda]` on native Windows. |
| `GPUs: []` on Windows | Normal for `tensorflow-intel`. Switch to WSL2 conda env `nsfw-gpu`. |
| `Found 0 images belonging to 5 classes` | Only URL lists downloaded — run [§ 1b Download images](#1b-download-images-required). |
| `Sequence has length 0` | Same as above — no `.jpg` files under class folders yet. |
| `Could not load dynamic library 'cudart64_*.dll'` | On WSL, reinstall with `tensorflow[and-cuda]==2.15.0` inside conda env. |
| `ResourceExhaustedError: OOM when allocating ...` | The script retries at batch 16 automatically. If it still fails, lower `--batch-size` to 8 and reduce `--unfreeze-last` to 10. |
| Class imbalance (porn ≫ drawings) | Add `class_weight=...` in `model.fit` or downsample manually. Not enabled by default. |
| `.h5` save fails on Windows OneDrive | Move `--output-dir` outside OneDrive (e.g. `D:\models\nsfw`). |
| Training is too slow on CPU | Drop `--phase1-epochs` to 3 and `--phase2-epochs` to 2 just to validate the pipeline. |

---

**Expected runtime on RTX 3050 6 GB:** roughly **40 – 80 min** total for ~100 k images at batch 32 (≈3 – 5 min/epoch in phase 1, slightly more in phase 2).
