# Download images (`download_images.py`)

Use this script in **WSL Ubuntu** when you have `urls_*.txt` files and need images on disk before training.

## Install

```bash
conda activate nsfw-gpu   # or any Python 3.10+ venv
pip install gdown tqdm requests
```

## Standard NSFW Data Scraper (HTTP URLs)

The official scraper `urls_porn.txt` files contain **direct image URLs** (Tumblr, blogs, etc.), not Google Drive IDs. The script detects each line automatically:

```bash
cd /mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper/raw_data

python /mnt/c/Users/helmi/OneDrive/Documents/GitHub/PFE/training/download_images.py \
  --input_dir . \
  --output_dir .
```

This writes images into `./porn/`, `./sexy/`, etc. (same layout as `raw_data`).

**Smoke test** (10 URLs per class):

```bash
python .../training/download_images.py --input_dir . --output_dir . --limit 10 --no-skip-existing
```

Full download (~57k+ URLs per class for porn alone) takes **many hours** and **tens of GB**. Prefer the upstream Docker script for bulk downloads:

```bash
cd /mnt/c/.../nsfw_scraper
docker build . -t docker_nsfw_data_scraper
docker run --rm -v "$(pwd):/app" docker_nsfw_data_scraper bash scripts/2_download_from_urls_.sh
```

That stores files under `raw_data/<class>/IMAGES/`.

## Google Drive file IDs

If your `.txt` files contain **one Drive ID per line** (or full `drive.google.com/...` links):

```bash
python download_images.py \
  --input_dir /path/to/txt_folder \
  --output_dir raw_data \
  --gdrive-only
```

## Zip archives

If `gdown` (or HTTP) returns a `.zip`, the script extracts it, moves `.jpg`/`.png` into the class folder, and deletes the zip.

## Train after download

```bash
cd /mnt/c/Users/helmi/OneDrive/Documents/GitHub/PFE/training
python train_nsfw.py \
  --data-dir "/mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper/raw_data" \
  --output-dir ./out
```

Verify counts:

```bash
bash inspect_dataset.sh /mnt/c/.../raw_data
```
