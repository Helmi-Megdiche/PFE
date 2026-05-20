#!/usr/bin/env bash
# Full NSFW fine-tuning pipeline: download -> inspect -> train -> copy TFLite to MobileApp
#
# Usage (WSL Ubuntu):
#   cd /mnt/c/Users/helmi/OneDrive/Documents/GitHub/PFE/training
#   bash run_full_pipeline.sh
#
# Quick test (100 URLs per class):
#   DOWNLOAD_LIMIT=100 bash run_full_pipeline.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- Paths (edit if your clone lives elsewhere) ---
SCRAPER_ROOT="${SCRAPER_ROOT:-/mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper}"
DATA_DIR="${DATA_DIR:-$SCRAPER_ROOT/raw_data}"
TRAINING_OUT="${TRAINING_OUT:-$SCRIPT_DIR/out}"
MOBILE_ASSETS="${MOBILE_ASSETS:-/mnt/c/Users/helmi/OneDrive/Documents/GitHub/PFE/MobileApp/android/app/src/main/assets/models}"

WORKERS="${WORKERS:-16}"
DOWNLOAD_LIMIT="${DOWNLOAD_LIMIT:-0}"   # 0 = all URLs (very long)
BATCH_SIZE="${BATCH_SIZE:-32}"
PHASE1="${PHASE1_EPOCHS:-8}"
PHASE2="${PHASE2_EPOCHS:-5}"

echo "=============================================="
echo " PFE — NSFW EfficientNetV2B0 full pipeline"
echo "=============================================="
echo "  DATA_DIR     : $DATA_DIR"
echo "  TRAINING_OUT : $TRAINING_OUT"
echo "  MOBILE_ASSETS: $MOBILE_ASSETS"
echo "  WORKERS      : $WORKERS"
echo "  LIMIT/class  : ${DOWNLOAD_LIMIT:-all}"
echo ""

# --- Conda ---
if [[ -f "$HOME/miniconda3/etc/profile.d/conda.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/miniconda3/etc/profile.d/conda.sh"
  conda activate nsfw-gpu
else
  echo "[warn] conda not found — assuming nsfw-gpu is already active"
fi

python -c "import tensorflow as tf; print('[check] TensorFlow', tf.__version__)" || {
  echo "[error] Activate nsfw-gpu and install deps: pip install -r requirements.txt"
  exit 1
}

# --- Step 1: Inspect / download ---
echo ""
echo ">>> Step 1: Dataset check"
set +e
bash "$SCRIPT_DIR/inspect_dataset.sh" "$DATA_DIR"
INSPECT_RC=$?
set -e

if [[ "$INSPECT_RC" -eq 2 ]]; then
  echo ""
  echo ">>> Step 2: Download images (parallel)"
  LIMIT_ARGS=()
  if [[ -n "$DOWNLOAD_LIMIT" && "$DOWNLOAD_LIMIT" != "0" ]]; then
    LIMIT_ARGS=(--limit "$DOWNLOAD_LIMIT")
  fi
  python "$SCRIPT_DIR/download_images.py" \
    --input_dir "$DATA_DIR" \
    --output_dir "$DATA_DIR" \
    --workers "$WORKERS" \
    "${LIMIT_ARGS[@]}"

  echo ""
  echo ">>> Re-check dataset"
  set +e
  bash "$SCRIPT_DIR/inspect_dataset.sh" "$DATA_DIR"
  INSPECT_RC=$?
  set -e
  if [[ "$INSPECT_RC" -eq 2 ]]; then
    echo "[error] Dataset still insufficient after download"
    exit 1
  fi
else
  echo ">>> Step 2: Skipped download (dataset already sufficient)"
fi

# --- Step 3: Train ---
echo ""
echo ">>> Step 3: Fine-tune EfficientNetV2B0"
python "$SCRIPT_DIR/train_nsfw.py" \
  --data-dir "$DATA_DIR" \
  --output-dir "$TRAINING_OUT" \
  --batch-size "$BATCH_SIZE" \
  --fallback-batch-size 16 \
  --phase1-epochs "$PHASE1" \
  --phase2-epochs "$PHASE2"

TFLITE_SRC="$TRAINING_OUT/nsfw_detector.tflite"
LABELS_SRC="$TRAINING_OUT/labels.txt"

if [[ ! -f "$TFLITE_SRC" ]]; then
  echo "[error] Missing $TFLITE_SRC after training"
  exit 1
fi

# --- Step 4: Copy to React Native ---
echo ""
echo ">>> Step 4: Copy model to MobileApp assets"
mkdir -p "$MOBILE_ASSETS"
cp -f "$TFLITE_SRC" "$MOBILE_ASSETS/nsfw_detector.tflite"
cp -f "$LABELS_SRC" "$MOBILE_ASSETS/labels.txt"

echo ""
echo "=============================================="
echo " SUCCESS"
echo "=============================================="
echo "  TFLite model : $MOBILE_ASSETS/nsfw_detector.tflite"
echo "  Labels       : $MOBILE_ASSETS/labels.txt"
echo "  Training out : $TRAINING_OUT"
echo ""
echo "Next steps:"
echo "  1. cd MobileApp && npm run android   (rebuild native app)"
echo "  2. Wire TFLite inference in nsfwClassifier (Sprint 3.9)"
echo "  3. Test on device with ScreenMonitor enabled"
echo ""
