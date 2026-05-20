#!/usr/bin/env bash
# Sprint 3.8 — GPU training via WSL2 (Ubuntu) + Miniconda (no sudo required).
# Native Windows tensorflow 2.15 is CPU-only (tensorflow-intel); CUDA GPU works in WSL2.
set -euo pipefail
# head closes the pipe early; do not treat SIGPIPE as failure
set +o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CONDA_DIR="${HOME}/miniconda3"
ENV_NAME="nsfw-gpu"
PYTHON_VER="3.10"

echo "=== NSFW GPU setup (WSL2) ==="
echo "Project: $SCRIPT_DIR"

if ! command -v nvidia-smi &>/dev/null; then
  echo "[error] nvidia-smi not found in WSL. Install/update NVIDIA driver on Windows"
  echo "        and ensure WSL2 GPU support: wsl --update"
  exit 1
fi
nvidia-smi 2>&1 | head -15 || true
set -o pipefail

if [[ ! -x "${CONDA_DIR}/bin/conda" ]]; then
  echo "[conda] Installing Miniconda to ${CONDA_DIR} ..."
  INSTALLER="/tmp/miniconda.sh"
  curl -fsSL "https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh" -o "$INSTALLER"
  bash "$INSTALLER" -b -p "$CONDA_DIR"
  rm -f "$INSTALLER"
fi

# shellcheck source=/dev/null
source "${CONDA_DIR}/etc/profile.d/conda.sh"

# Required on fresh Miniconda (2024+)
conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main 2>/dev/null || true
conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r 2>/dev/null || true

if ! conda env list | grep -q "^${ENV_NAME} "; then
  echo "[conda] Creating env ${ENV_NAME} (Python ${PYTHON_VER}) ..."
  conda create -y -n "${ENV_NAME}" "python=${PYTHON_VER}"
fi

conda activate "${ENV_NAME}"

echo "[pip] Installing TensorFlow 2.15 + NVIDIA CUDA wheels (no tensorrt extra) ..."
pip install --upgrade pip
# tensorflow[and-cuda] often fails on tensorrt-libs pin; manual CUDA wheels work on WSL2.
pip install \
  nvidia-cublas-cu12==12.2.5.6 \
  nvidia-cuda-cupti-cu12==12.2.142 \
  nvidia-cuda-nvrtc-cu12==12.2.140 \
  nvidia-cuda-runtime-cu12==12.2.140 \
  nvidia-cudnn-cu12==8.9.4.25 \
  nvidia-cufft-cu12==11.0.8.103 \
  nvidia-curand-cu12==10.3.3.141 \
  nvidia-cusolver-cu12==11.5.2.141 \
  nvidia-cusparse-cu12==12.1.2.141 \
  nvidia-nccl-cu12==2.16.5 \
  nvidia-nvjitlink-cu12==12.2.140
pip install "tensorflow==2.15.0"
pip install "numpy>=1.23,<2.0" "matplotlib>=3.7,<4" "pillow>=10,<11"

python - <<'PY'
import tensorflow as tf
print("TensorFlow:", tf.__version__)
print("Built with CUDA:", tf.test.is_built_with_cuda())
gpus = tf.config.list_physical_devices("GPU")
print("GPUs:", gpus)
if not gpus:
    raise SystemExit("No GPU detected — fix WSL CUDA before training.")
PY

echo ""
echo "=== Ready ==="
echo "Activate and train:"
echo "  wsl -d Ubuntu"
echo "  cd $(wslpath -a "$SCRIPT_DIR" 2>/dev/null || echo "$SCRIPT_DIR")"
echo "  source ~/miniconda3/etc/profile.d/conda.sh && conda activate ${ENV_NAME}"
echo "  python train_nsfw.py --data-dir '/mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper' --output-dir ./out"
echo ""
