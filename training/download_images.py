#!/usr/bin/env python3
"""
Download NSFW Data Scraper images from urls_*.txt (HTTP URLs).

Expected input layout (NSFW Data Scraper repo):
    raw_data/porn/urls_porn.txt
    raw_data/sexy/urls_sexy.txt
    ...

Output layout:
    output_dir/porn/img_000001.jpg
    output_dir/sexy/img_000002.jpg
    ...

Features: parallel downloads, resume, retries, failed_urls logs, post-download stats.

WSL example:
    conda activate nsfw-gpu
    pip install tqdm requests pillow
    python download_images.py \\
        --input_dir /mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper/raw_data \\
        --output_dir /mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper/raw_data \\
        --workers 16
"""

from __future__ import annotations

import argparse
import re
import sys
import threading
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import NamedTuple
from urllib.parse import urlparse

import requests
from PIL import Image
from tqdm import tqdm

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
ARCHIVE_EXTS = {".zip"}
URLS_PATTERN = re.compile(r"urls_(.+)\.txt$", re.IGNORECASE)
CLASS_NAMES = ("drawings", "hentai", "neutral", "porn", "sexy")
IMG_NAME_PATTERN = re.compile(r"^img_(\d+)\.", re.IGNORECASE)
MIN_BYTES = 512
REQUEST_DELAY_SEC = 0.1


class DownloadJob(NamedTuple):
    class_name: str
    url: str
    index: int


class DownloadResult(NamedTuple):
    class_name: str
    url: str
    success: bool
    path: str | None
    error: str | None


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Parallel download of NSFW Data Scraper image URLs",
    )
    p.add_argument(
        "--input_dir",
        type=str,
        required=True,
        help="Directory containing urls_*.txt or class/urls_*.txt",
    )
    p.add_argument(
        "--output_dir",
        type=str,
        required=True,
        help="Root for class subfolders (porn/, sexy/, ...)",
    )
    p.add_argument("--workers", type=int, default=16, help="Parallel download threads")
    p.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max URLs per class (0 = all lines in file)",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if class folder already has images",
    )
    p.add_argument(
        "--min-per-class",
        type=int,
        default=500,
        help="Warn if any class has fewer images after download (0 = disable)",
    )
    p.add_argument("--timeout", type=int, default=30, help="HTTP timeout seconds")
    p.add_argument("--retries", type=int, default=3, help="Retries per URL")
    p.add_argument(
        "--delay",
        type=float,
        default=REQUEST_DELAY_SEC,
        help="Seconds to wait after each request (rate limit)",
    )
    return p.parse_args()


def discover_url_files(input_dir: Path) -> list[tuple[str, Path]]:
    found: list[tuple[str, Path]] = []
    for path in sorted(input_dir.rglob("urls_*.txt")):
        match = URLS_PATTERN.match(path.name)
        if match:
            found.append((match.group(1).lower(), path))
    if found:
        return found
    for path in sorted(input_dir.glob("urls_*.txt")):
        match = URLS_PATTERN.match(path.name)
        if match:
            found.append((match.group(1).lower(), path))
    return found


def read_urls(path: Path, limit: int) -> list[str]:
    lines: list[str] = []
    with path.open(encoding="utf-8", errors="ignore") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.lower().startswith("http://") or line.lower().startswith("https://"):
                lines.append(line)
            if limit and len(lines) >= limit:
                break
    return lines


def next_image_index(class_dir: Path) -> int:
    """Resume numbering: max(img_NNN.ext) + 1."""
    max_idx = 0
    if not class_dir.is_dir():
        return 1
    for path in class_dir.iterdir():
        if not path.is_file():
            continue
        m = IMG_NAME_PATTERN.match(path.name)
        if m:
            max_idx = max(max_idx, int(m.group(1)))
    return max_idx + 1


def count_images_in_dir(class_dir: Path) -> int:
    if not class_dir.is_dir():
        return 0
    return sum(
        1
        for p in class_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    )


def guess_extension(url: str, content_type: str | None) -> str:
    path = urlparse(url).path
    ext = Path(path).suffix.lower()
    if ext in IMAGE_EXTS:
        return ext
    if content_type:
        ct = content_type.split(";")[0].strip().lower()
        mapping = {
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",
            "image/bmp": ".bmp",
        }
        if ct in mapping:
            return mapping[ct]
    return ".jpg"


def is_valid_image_bytes(data: bytes) -> bool:
    if len(data) < MIN_BYTES:
        return False
    head = data[:512].lower()
    if b"<html" in head or b"<!doctype" in head:
        return False
    try:
        from io import BytesIO

        with Image.open(BytesIO(data)) as img:
            rgb = img.convert("RGB")
            rgb.load()
            w, h = rgb.size
            return w >= 32 and h >= 32
    except Exception:  # noqa: BLE001
        return False


def extract_zip_if_needed(path: Path, class_dir: Path) -> None:
    if path.suffix.lower() != ".zip":
        return
    try:
        with zipfile.ZipFile(path, "r") as zf:
            zf.extractall(class_dir)
        path.unlink(missing_ok=True)
    except zipfile.BadZipFile:
        path.unlink(missing_ok=True)


def download_one(
    job: DownloadJob,
    class_dir: Path,
    session: requests.Session,
    *,
    timeout: int,
    retries: int,
    delay: float,
    rate_lock: threading.Lock,
    last_request: list[float],
) -> DownloadResult:
    dest_path: Path | None = None
    last_err = "unknown"

    for attempt in range(1, retries + 1):
        try:
            with rate_lock:
                elapsed = time.monotonic() - last_request[0]
                if elapsed < delay:
                    time.sleep(delay - elapsed)
                last_request[0] = time.monotonic()

            resp = session.get(job.url, timeout=timeout, stream=True)
            if resp.status_code in (403, 404, 410):
                return DownloadResult(
                    job.class_name, job.url, False, None, f"HTTP {resp.status_code}"
                )
            resp.raise_for_status()
            data = resp.content
            if not is_valid_image_bytes(data):
                last_err = "invalid image bytes"
                continue

            ext = guess_extension(job.url, resp.headers.get("Content-Type"))
            dest_path = class_dir / f"img_{job.index:06d}{ext}"
            dest_path.write_bytes(data)

            if dest_path.suffix.lower() == ".zip":
                extract_zip_if_needed(dest_path, class_dir)
                return DownloadResult(job.class_name, job.url, True, str(dest_path), None)

            return DownloadResult(job.class_name, job.url, True, str(dest_path), None)
        except requests.RequestException as err:
            last_err = str(err)
            if attempt < retries:
                time.sleep(0.5 * attempt)
        except OSError as err:
            last_err = str(err)
            break

    return DownloadResult(job.class_name, job.url, False, None, last_err)


def build_jobs(
    class_name: str,
    urls: list[str],
    class_dir: Path,
    *,
    skip_existing: bool,
) -> list[DownloadJob]:
    if skip_existing and count_images_in_dir(class_dir) > 0:
        return []
    start = next_image_index(class_dir)
    return [
        DownloadJob(class_name, url, start + i)
        for i, url in enumerate(urls)
    ]


def run_class_downloads(
    jobs: list[DownloadJob],
    class_dir: Path,
    *,
    workers: int,
    timeout: int,
    retries: int,
    delay: float,
    desc: str,
) -> list[DownloadResult]:
    if not jobs:
        return []

    class_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (compatible; PFE-NSFW-Downloader/1.0; +educational-research)"
            ),
            "Accept": "image/*,*/*;q=0.8",
        }
    )
    rate_lock = threading.Lock()
    last_request = [0.0]
    results: list[DownloadResult] = []

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(
                download_one,
                job,
                class_dir,
                session,
                timeout=timeout,
                retries=retries,
                delay=delay,
                rate_lock=rate_lock,
                last_request=last_request,
            ): job
            for job in jobs
        }
        with tqdm(total=len(jobs), desc=desc, unit="url") as bar:
            for fut in as_completed(futures):
                results.append(fut.result())
                bar.update(1)
    return results


def print_dataset_report(output_dir: Path, min_per_class: int) -> int:
    """Print counts; return 0 if ready, 1 if warnings only, 2 if unusable."""
    print("\n=== Dataset report ===")
    total = 0
    empty_classes: list[str] = []
    low_classes: list[str] = []

    for name in CLASS_NAMES:
        class_dir = output_dir / name
        n = count_images_in_dir(class_dir)
        total += n
        status = "ok" if n > 0 else "EMPTY"
        print(f"  {name:10s} {n:6d} images  [{status}]")
        if n == 0:
            empty_classes.append(name)
        elif min_per_class and n < min_per_class:
            low_classes.append(f"{name} ({n} < {min_per_class})")

    print(f"  {'TOTAL':10s} {total:6d} images")
    if empty_classes:
        print(f"[error] Empty classes: {', '.join(empty_classes)}", file=sys.stderr)
        return 2
    if total < 100:
        print(
            f"[error] Total images ({total}) < 100 — not enough for training.",
            file=sys.stderr,
        )
        return 2
    if low_classes:
        print(f"[warn] Low counts (threshold {min_per_class}): {', '.join(low_classes)}")
        print("[warn] Training may still run but accuracy will be limited.")
    print("\nDataset ready for training.")
    print(f"  data-dir: {output_dir}")
    print(
        "  next: python train_nsfw.py "
        f'--data-dir "{output_dir}" --output-dir ./out'
    )
    return 0 if not low_classes else 1


def main() -> int:
    args = parse_args()
    input_dir = Path(args.input_dir).resolve()
    output_dir = Path(args.output_dir).resolve()

    if not input_dir.is_dir():
        print(f"[error] input_dir not found: {input_dir}", file=sys.stderr)
        return 2

    pairs = discover_url_files(input_dir)
    if not pairs:
        print(
            f"[error] No urls_*.txt under {input_dir}\n"
            "  Expected: porn/urls_porn.txt or urls_porn.txt in input_dir",
            file=sys.stderr,
        )
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"[info] input : {input_dir}")
    print(f"[info] output: {output_dir}")
    print(f"[info] workers: {args.workers}  limit: {args.limit or 'all'}  force: {args.force}")

    all_results: list[DownloadResult] = []

    for class_name, urls_path in pairs:
        class_dir = output_dir / class_name
        urls = read_urls(urls_path, args.limit)
        print(f"\n[class] {class_name} — {len(urls)} URLs from {urls_path.name}")

        if not urls:
            continue

        skip = not args.force and count_images_in_dir(class_dir) > 0
        if skip:
            print(f"  skip download ({count_images_in_dir(class_dir)} images exist, use --force)")
            continue

        jobs = build_jobs(class_name, urls, class_dir, skip_existing=False)
        results = run_class_downloads(
            jobs,
            class_dir,
            workers=args.workers,
            timeout=args.timeout,
            retries=args.retries,
            delay=args.delay,
            desc=class_name,
        )
        all_results.extend(results)

        failed_path = class_dir / "failed_urls.txt"
        failed = [r for r in results if not r.success]
        if failed:
            with failed_path.open("w", encoding="utf-8") as fh:
                for r in failed:
                    fh.write(f"{r.url}\t{r.error}\n")
            print(f"  failed: {len(failed)} logged to {failed_path}")
        elif failed_path.exists():
            failed_path.unlink()

        ok = sum(1 for r in results if r.success)
        print(f"  downloaded: {ok} ok, {len(failed)} failed")

    ok_total = sum(1 for r in all_results if r.success)
    fail_total = sum(1 for r in all_results if not r.success)
    print(f"\n[summary] success={ok_total}  failed={fail_total}")

    return print_dataset_report(output_dir, args.min_per_class)


if __name__ == "__main__":
    sys.exit(main())
