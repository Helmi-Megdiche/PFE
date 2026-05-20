#!/usr/bin/env bash
# Validate NSFW dataset before training.
# Usage: bash inspect_dataset.sh [DATA_DIR]
# Exit 0 = ready; 1 = warnings (low per-class count); 2 = cannot train

set -euo pipefail

DATA_DIR="${1:-/mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper/raw_data}"
MIN_TOTAL="${MIN_TOTAL:-100}"
MIN_PER_CLASS_WARN="${MIN_PER_CLASS_WARN:-500}"

count_images() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    echo 0
    return
  fi
  find "$dir" -type f \( \
    -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \
    -o -iname '*.gif' -o -iname '*.bmp' -o -iname '*.webp' \
  \) ! -path '*/_invalid/*' 2>/dev/null | wc -l | tr -d ' '
}

echo "=== Dataset inspection ==="
echo "Path: $DATA_DIR"
echo ""

total=0
empty=0
min_c=999999999
max_c=0

for c in drawings hentai neutral porn sexy; do
  dir="$DATA_DIR/$c"
  n=$(count_images "$dir")
  total=$((total + n))
  printf "  %-10s %6d images\n" "$c" "$n"
  if [[ "$n" -eq 0 ]]; then
    empty=$((empty + 1))
  fi
  if [[ "$n" -lt "$min_c" ]]; then min_c=$n; fi
  if [[ "$n" -gt "$max_c" ]]; then max_c=$n; fi
done

printf "  %-10s %6d images\n" "TOTAL" "$total"
echo ""

if [[ "$total" -eq 0 ]] || [[ "$empty" -gt 0 ]]; then
  echo "[error] Missing images in one or more class folders." >&2
  if find "$DATA_DIR" -name 'urls_*.txt' 2>/dev/null | head -1 | grep -q .; then
    echo "[error] Found urls_*.txt — run download_images.py first." >&2
  fi
  exit 2
fi

if [[ "$total" -lt "$MIN_TOTAL" ]]; then
  echo "[error] Total images ($total) < MIN_TOTAL ($MIN_TOTAL)." >&2
  exit 2
fi

if [[ "$min_c" -lt "$MIN_PER_CLASS_WARN" ]]; then
  echo "[warn] Smallest class has $min_c images (< $MIN_PER_CLASS_WARN)."
  echo "Dataset ready for training (with warnings)."
  exit 1
fi

echo "Dataset ready for training."
exit 0
