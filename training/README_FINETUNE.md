# NSFW EfficientNetV2B0 — full fine-tuning pipeline

Fine-tune **EfficientNetV2B0** on the [NSFW Data Scraper](https://github.com/alex000kim/nsfw_data_scraper) dataset and export **`nsfw_detector.tflite`** for the React Native child app.

**Environment:** WSL2 Ubuntu + conda `nsfw-gpu` + RTX 3050 6 GB.

**Dataset root (default):**

```text
/mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper/raw_data/
├── porn/urls_porn.txt          # input URL lists
├── porn/img_000001.jpg         # after download_images.py
├── sexy/
├── hentai/
├── neutral/
└── drawings/
```

---

## One-command pipeline

```bash
cd /mnt/c/Users/helmi/OneDrive/Documents/GitHub/PFE/training
chmod +x run_full_pipeline.sh inspect_dataset.sh
bash run_full_pipeline.sh
```

This will:

1. Activate `nsfw-gpu`
2. Run `inspect_dataset.sh` — if images are missing, run `download_images.py`
3. Re-inspect the dataset
4. Run `train_nsfw.py` (8 + 5 epochs, batch 32 → 16 on OOM)
5. Copy `nsfw_detector.tflite` and `labels.txt` to `MobileApp/android/app/src/main/assets/models/`

### Quick test (100 URLs per class)

```bash
DOWNLOAD_LIMIT=100 bash run_full_pipeline.sh
```

Expect ~30–60 minutes download + ~5–15 minutes training on GPU.

### Full dataset (all URLs)

```bash
# WARNING: 50k+ URLs per class — days of download, 100+ GB disk
bash run_full_pipeline.sh
```

---

## Setup (once)

```bash
wsl -d Ubuntu
cd /mnt/c/Users/helmi/OneDrive/Documents/GitHub/PFE/training

# If conda env missing:
bash setup_gpu_wsl.sh

conda activate nsfw-gpu
pip install -r requirements.txt
pip install nvidia-cuda-nvcc-cu12==12.2.140   # GPU libdevice (if not already)
```

Verify GPU:

```bash
python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"
```

---

## Step-by-step (manual)

### 1. Download images

```bash
conda activate nsfw-gpu
cd /mnt/c/Users/helmi/OneDrive/Documents/GitHub/PFE/training

python download_images.py \
  --input_dir /mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper/raw_data \
  --output_dir /mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper/raw_data \
  --workers 16
```

| Flag | Purpose |
|------|---------|
| `--limit 500` | First 500 URLs per class (testing) |
| `--force` | Re-download even if class folder has images |
| `--workers 8` | Fewer parallel threads (gentler on network) |
| `--min-per-class 500` | Warn if class has fewer images after download |

Outputs per class:

- `img_000001.jpg`, …
- `failed_urls.txt` (URLs that failed after retries)

### 2. Validate dataset

```bash
bash inspect_dataset.sh /mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper/raw_data
```

| Exit code | Meaning |
|-----------|---------|
| 0 | Ready for training |
| 1 | OK but some classes &lt; 500 images (warning) |
| 2 | Empty or &lt; 100 total images — do not train |

### 3. Prune corrupt files (optional)

```bash
python run_prune.py
```

### 4. Train

```bash
python train_nsfw.py \
  --data-dir "/mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper/raw_data" \
  --output-dir ./out \
  --batch-size 32 \
  --phase1-epochs 8 \
  --phase2-epochs 5
```

| Flag | Purpose |
|------|---------|
| `--cpu` | Force CPU (slow; bypasses GPU XLA issues) |
| `--no-augment` | Disable flip augmentation |
| `--fallback-batch-size 16` | OOM retry batch size |

**Outputs in `training/out/`:**

| File | Description |
|------|-------------|
| `nsfw_detector.tflite` | Quantized model for Android |
| `nsfw_model.h5` | Full Keras model |
| `nsfw_best.h5` | Best checkpoint (val accuracy) |
| `labels.txt` | Class order for inference |
| `training_history.png` | Accuracy / loss curves |

### 5. Copy to MobileApp

```bash
ASSETS=/mnt/c/Users/helmi/OneDrive/Documents/GitHub/PFE/MobileApp/android/app/src/main/assets/models
mkdir -p "$ASSETS"
cp out/nsfw_detector.tflite "$ASSETS/"
cp out/labels.txt "$ASSETS/"
cd ../MobileApp && npm run android
```

---

## Expected timing (RTX 3050 6 GB)

| Stage | ~100 URLs/class | Full dataset |
|-------|-----------------|--------------|
| Download | 10–30 min | Days |
| Train (8+5 ep, 5k+ images) | — | 40–90 min |
| Train (smoke, 33 images) | 1 min | — |
| TFLite export | &lt; 1 min | &lt; 1 min |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `No images found` / only `urls_*.txt` | Run `download_images.py` first |
| `libdevice.10.bc not found` | `pip install nvidia-cuda-nvcc-cu12==12.2.140` |
| OOM on GPU | Lower `--batch-size 16` or `8` |
| Many `failed_urls.txt` entries | Normal for old Tumblr/blog URLs (404). Download more URLs. |
| `inspect` exit 2 after download | Increase `--limit` or check `failed_urls.txt` |
| Slow download | Reduce `--workers`; many dead links still cost time |
| Docker not needed | This pipeline uses Python only (no Docker) |

---

## Class indices (inference order)

Alphabetical folder names map to indices in `labels.txt`:

```text
drawings  -> 0
hentai    -> 1
neutral   -> 2
porn      -> 3
sexy      -> 4
```

Use the same order in the mobile TFLite module (Sprint 3.9).

---

## Files in `training/`

| File | Role |
|------|------|
| `download_images.py` | Parallel HTTP download from `urls_*.txt` |
| `inspect_dataset.sh` | Pre-flight image counts |
| `train_nsfw.py` | Two-phase EfficientNetV2B0 + TFLite export |
| `run_full_pipeline.sh` | End-to-end orchestration |
| `setup_gpu_wsl.sh` | One-time conda + TF GPU setup |
| `run_prune.py` | Remove corrupt downloads |
| `check_gpu.py` | Quick GPU check |

---

**Sprint 3.8** — after training, integrate `nsfw_detector.tflite` in `MobileApp/src/services/nsfwClassifier.ts` (replace ML Kit proxy).
