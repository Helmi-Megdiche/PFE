"""
Sprint 3.8 — Fine-tune EfficientNetV2B0 on the NSFW Data Scraper dataset.

Pipeline:
    1. Load 5 classes (porn / sexy / hentai / neutral / drawings) with
       ImageDataGenerator (80/20 train/val split).
    2. Build EfficientNetV2B0 (ImageNet weights) + classification head.
    3. Phase 1 — train head only (base frozen), 8 epochs.
    4. Phase 2 — unfreeze last 20 layers, fine-tune with very low LR, 5 epochs.
    5. Save Keras model (.h5), convert to quantized TFLite, plot history.

Designed for RTX 3050 6 GB. Falls back to batch_size=16 on OOM.
"""

from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image


def _env_before_tensorflow() -> None:
    """Disable oneDNN; XLA libdevice path set in configure_gpu after nvcc install."""
    os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")


_env_before_tensorflow()

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models
from tensorflow.keras.applications import EfficientNetV2B0
from tensorflow.keras.applications.efficientnet_v2 import preprocess_input
from tensorflow.keras.callbacks import (
    EarlyStopping,
    ModelCheckpoint,
    ReduceLROnPlateau,
)
DEFAULT_DATA_DIR = (
    r"C:\Users\helmi\OneDrive\Bureau\PFE-Docs\data\nsfw_scraper\raw_data"
)
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "out"
IMG_SIZE = (224, 224)
SEED = 42
CLASS_NAMES = ("drawings", "hentai", "neutral", "porn", "sexy")
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
MIN_IMAGE_BYTES = 1024
MIN_IMAGE_SIDE = 32


def ensure_cuda_nvcc_libdevice() -> None:
    """EfficientNet GPU ops need libdevice.10.bc from nvidia-cuda-nvcc-cu12."""
    import site

    for sp in site.getsitepackages():
        libdevice_dir = Path(sp) / "nvidia" / "cuda_nvcc" / "nvvm" / "libdevice"
        if (libdevice_dir / "libdevice.10.bc").exists():
            os.environ["XLA_FLAGS"] = f"--xla_gpu_cuda_data_dir={libdevice_dir}"
            print(f"[gpu] XLA libdevice: {libdevice_dir}")
            return

    print("[gpu] Installing nvidia-cuda-nvcc-cu12 (libdevice for GPU training)...")
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "nvidia-cuda-nvcc-cu12==12.2.140", "-q"],
    )
    for sp in site.getsitepackages():
        libdevice_dir = Path(sp) / "nvidia" / "cuda_nvcc" / "nvvm" / "libdevice"
        if (libdevice_dir / "libdevice.10.bc").exists():
            os.environ["XLA_FLAGS"] = f"--xla_gpu_cuda_data_dir={libdevice_dir}"
            print(f"[gpu] XLA libdevice: {libdevice_dir}")
            return
    print("[warn] libdevice.10.bc still missing — use --cpu if GPU training fails")


def configure_gpu(force_cpu: bool = False) -> None:
    """Enable memory growth so TF does not preallocate the full 6 GB."""
    try:
        tf.config.optimizer.set_jit(False)
    except Exception:  # noqa: BLE001
        pass

    if force_cpu:
        tf.config.set_visible_devices([], "GPU")
        print("[gpu] Forced CPU training (--cpu)")
        return

    gpus = tf.config.list_physical_devices("GPU")
    if not gpus:
        print("[gpu] No CUDA GPU detected — training will run on CPU (slow).")
        return

    ensure_cuda_nvcc_libdevice()
    for gpu in gpus:
        try:
            tf.config.experimental.set_memory_growth(gpu, True)
        except RuntimeError as err:
            print(f"[gpu] set_memory_growth failed: {err}")
    print(f"[gpu] Using {len(gpus)} GPU(s): {[g.name for g in gpus]}")


def count_images(data_dir: Path) -> int:
    """Count image files under class folders (excluding _invalid / staging)."""
    skip_parts = {"_invalid", "_keras_flat"}
    total = 0
    if not data_dir.is_dir():
        return 0
    for path in data_dir.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
            continue
        if skip_parts.intersection(path.parts):
            continue
        if is_valid_image_file(path):
            total += 1
    return total


def prepare_data_dir(data_dir: Path) -> Path:
    """
    Keras flow_from_directory expects images directly under each class folder.
    NSFW Data Scraper stores downloads in class/IMAGES/ — symlink into _keras_flat/.
    """
    if count_images(data_dir) > 0:
        has_flat = any(
            (data_dir / name).is_dir()
            and any(
                p.suffix.lower() in IMAGE_EXTS
                for p in (data_dir / name).iterdir()
                if p.is_file()
            )
            for name in CLASS_NAMES
        )
        if has_flat:
            return data_dir
        # Images only under IMAGES/ subfolders
        pass

    staging = data_dir / "_keras_flat"
    linked = 0
    for name in CLASS_NAMES:
        images_dir = data_dir / name / "IMAGES"
        if not images_dir.is_dir():
            continue
        dest = staging / name
        dest.mkdir(parents=True, exist_ok=True)
        for src in images_dir.iterdir():
            if not src.is_file() or src.suffix.lower() not in IMAGE_EXTS:
                continue
            link = dest / src.name
            if not link.exists():
                try:
                    link.symlink_to(src)
                    linked += 1
                except OSError:
                    # Fallback when symlinks fail (copy would be slow; skip)
                    pass

    if linked > 0:
        print(f"[data] Using symlink staging dir: {staging} ({linked} images)")
        return staging

    return data_dir


def unique_dest(dest_dir: Path, base_name: str) -> Path:
    dest = dest_dir / base_name
    if not dest.exists():
        return dest
    stem = Path(base_name).stem
    ext = Path(base_name).suffix
    n = 1
    while True:
        candidate = dest_dir / f"{stem}_{n}{ext}"
        if not candidate.exists():
            return candidate
        n += 1


def is_valid_image_file(path: Path) -> bool:
    """Strict check — PIL + TensorFlow decode (same path Keras uses)."""
    try:
        if path.stat().st_size < MIN_IMAGE_BYTES:
            return False
        head = path.read_bytes()[:512].lower()
        if b"<html" in head or b"<!doctype" in head:
            return False
        with Image.open(path) as img:
            rgb = img.convert("RGB")
            rgb.load()
            w, h = rgb.size
            if w < MIN_IMAGE_SIDE or h < MIN_IMAGE_SIDE:
                return False
        raw = tf.io.read_file(str(path))
        decoded = tf.io.decode_image(raw, channels=3, expand_animations=False)
        return int(decoded.shape[0]) >= MIN_IMAGE_SIDE and int(decoded.shape[1]) >= MIN_IMAGE_SIDE
    except Exception:  # noqa: BLE001
        return False


def prune_invalid_images(data_dir: Path) -> int:
    """
    Move corrupt downloads (HTML errors, truncated files) out of class folders.
    Keras/PIL raises UnidentifiedImageError during augmentation otherwise.
    """
    quarantine = data_dir / "_invalid"
    quarantine.mkdir(parents=True, exist_ok=True)
    removed = 0
    skip_parts = {"_invalid", "_keras_flat"}

    for path in sorted(data_dir.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
            continue
        if skip_parts.intersection(path.parts):
            continue
        if is_valid_image_file(path):
            continue
        dest_name = f"{path.parent.name}__{path.name}"
        try:
            shutil.move(str(path), str(unique_dest(quarantine, dest_name)))
            removed += 1
            print(f"[prune] {path.name}")
        except OSError:
            path.unlink(missing_ok=True)
            removed += 1

    if removed:
        print(f"[prune] quarantined {removed} file(s) under {quarantine}")
    remaining = count_images(data_dir)
    print(f"[prune] {remaining} valid images remain")
    return removed


def validate_data_dir(data_dir: Path) -> None:
    """Fail fast with actionable hints when the scraper dataset is not ready."""
    n_images = count_images(data_dir)
    if n_images > 0:
        print(f"[data] Found {n_images} images under {data_dir}")
        return

    has_url_lists = (
        any((data_dir / name / f"urls_{name}.txt").is_file() for name in CLASS_NAMES)
        or any(data_dir.glob("urls_*.txt"))
    )
    only_url_lists = has_url_lists and n_images == 0
    msg = [f"[error] No images found under {data_dir}"]
    if only_url_lists or has_url_lists:
        msg.append(
            "Found urls_*.txt but no image files. Run the download step first:\n"
            "  cd /mnt/c/Users/helmi/OneDrive/Documents/GitHub/PFE/training\n"
            "  python download_images.py \\\n"
            "    --input_dir /mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper/raw_data \\\n"
            "    --output_dir /mnt/c/Users/helmi/OneDrive/Bureau/PFE-Docs/data/nsfw_scraper/raw_data \\\n"
            "    --workers 16\n"
            "Or run the full pipeline: bash run_full_pipeline.sh"
        )
    else:
        msg.append(
            "Expected layout after download_images.py:\n"
            "  raw_data/porn/img_000001.jpg\n"
            "  raw_data/sexy/img_000002.jpg\n"
            "  ... (classes: drawings, hentai, neutral, porn, sexy)"
        )
    print("\n".join(msg), file=sys.stderr)
    raise SystemExit(2)


def collect_valid_samples(data_dir: Path) -> tuple[list[tuple[str, int]], dict[str, int]]:
    """List (filepath, class_index) for every decodable image."""
    class_indices = {
        name: idx for idx, name in enumerate(CLASS_NAMES) if (data_dir / name).is_dir()
    }
    samples: list[tuple[str, int]] = []
    for name, idx in class_indices.items():
        for path in sorted((data_dir / name).iterdir()):
            if path.is_file() and is_valid_image_file(path):
                samples.append((str(path), idx))
    return samples, class_indices


def build_tf_datasets(
    data_dir: str,
    batch_size: int,
    *,
    augment: bool,
) -> tuple[tf.data.Dataset, tf.data.Dataset, int, int, int, dict[str, int]]:
    """tf.data pipeline from validated files only (no bad files in directory scan)."""
    data_path = Path(data_dir)
    samples, class_indices = collect_valid_samples(data_path)
    if not samples:
        raise ValueError(f"No valid images under {data_dir}")

    rng = np.random.default_rng(SEED)
    rng.shuffle(samples)
    split = max(1, int(len(samples) * 0.8))
    if len(samples) < 5:
        split = max(1, len(samples) - 1)
    train_samples = samples[:split]
    val_samples = samples[split:] or samples[:1]

    num_classes = len(class_indices)

    def make_ds(
        items: list[tuple[str, int]],
        training: bool,
    ) -> tf.data.Dataset:
        paths = [p for p, _ in items]
        labels = [lbl for _, lbl in items]

        def load(path: tf.Tensor, label: tf.Tensor) -> tuple[tf.Tensor, tf.Tensor]:
            raw = tf.io.read_file(path)
            image = tf.io.decode_image(raw, channels=3, expand_animations=False)
            image.set_shape([None, None, 3])
            image = tf.image.resize(image, IMG_SIZE)
            image = tf.cast(image, tf.float32)
            if training and augment:
                image = tf.image.random_flip_left_right(image)
            image = preprocess_input(image)
            return image, tf.one_hot(label, depth=num_classes)

        ds = tf.data.Dataset.from_tensor_slices((paths, labels))
        if training:
            ds = ds.shuffle(min(len(items), max(32, len(items))))
        ds = ds.map(load, num_parallel_calls=tf.data.AUTOTUNE)
        return ds.batch(batch_size).prefetch(tf.data.AUTOTUNE)

    train_ds = make_ds(train_samples, training=True)
    val_ds = make_ds(val_samples, training=False)
    return (
        train_ds,
        val_ds,
        len(train_samples),
        len(val_samples),
        num_classes,
        class_indices,
    )


def build_model(num_classes: int) -> tf.keras.Model:
    """EfficientNetV2B0 backbone + classification head."""
    base = EfficientNetV2B0(
        include_top=False,
        weights="imagenet",
        input_shape=IMG_SIZE + (3,),
        pooling=None,
    )
    base.trainable = False

    inputs = tf.keras.Input(shape=IMG_SIZE + (3,))
    x = base(inputs, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(0.3)(x)
    x = layers.Dense(128, activation="relu")(x)
    x = layers.Dropout(0.2)(x)
    outputs = layers.Dense(num_classes, activation="softmax")(x)

    model = models.Model(inputs, outputs, name="nsfw_efficientnetv2b0")
    return model


def callbacks_for(ckpt_path: Path) -> list:
    return [
        EarlyStopping(
            monitor="val_accuracy",
            patience=3,
            restore_best_weights=True,
            verbose=1,
        ),
        ModelCheckpoint(
            filepath=str(ckpt_path),
            monitor="val_accuracy",
            save_best_only=True,
            verbose=1,
        ),
        ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=2,
            min_lr=1e-7,
            verbose=1,
        ),
    ]


def fit_with_oom_fallback(
    *,
    builder_fn,
    data_dir: str,
    initial_batch_size: int,
    fallback_batch_size: int,
    augment: bool,
) -> tuple[object, tf.keras.Model, dict[str, int], int]:
    """
    Try training at the initial batch size. On ResourceExhaustedError,
    retry with the fallback batch size.

    `builder_fn(train_ds, val_ds, n_train, n_val, batch_size, model)` returns History.
    """
    for attempt_batch in (initial_batch_size, fallback_batch_size):
        try:
            train_ds, val_ds, n_train, n_val, num_classes, class_indices = build_tf_datasets(
                data_dir, attempt_batch, augment=augment
            )
            print(
                f"[data] batch_size={attempt_batch}  train={n_train}  val={n_val}  "
                f"classes={num_classes}"
            )
            print(f"[data] class_indices={class_indices}")
            model = build_model(num_classes)
            history = builder_fn(
                train_ds, val_ds, n_train, n_val, attempt_batch, model
            )
            return history, model, class_indices, attempt_batch
        except tf.errors.ResourceExhaustedError as err:
            if attempt_batch == fallback_batch_size:
                raise
            print(
                f"[oom] batch_size={attempt_batch} failed — "
                f"retrying at {fallback_batch_size}.\n  {err}"
            )
            tf.keras.backend.clear_session()
    raise RuntimeError("Unreachable — OOM fallback exhausted")


def plot_history(combined: dict, out_path: Path) -> None:
    fig, (ax_acc, ax_loss) = plt.subplots(1, 2, figsize=(12, 4))
    ax_acc.plot(combined["accuracy"], label="train")
    ax_acc.plot(combined["val_accuracy"], label="val")
    ax_acc.set_title("Accuracy")
    ax_acc.set_xlabel("epoch")
    ax_acc.legend()
    ax_acc.grid(True, alpha=0.3)

    ax_loss.plot(combined["loss"], label="train")
    ax_loss.plot(combined["val_loss"], label="val")
    ax_loss.set_title("Loss")
    ax_loss.set_xlabel("epoch")
    ax_loss.legend()
    ax_loss.grid(True, alpha=0.3)

    fig.tight_layout()
    fig.savefig(out_path, dpi=120)
    plt.close(fig)
    print(f"[plot] saved {out_path}")


def convert_to_tflite(model: tf.keras.Model, out_path: Path) -> None:
    """Dynamic-range quantization (~4x smaller, CPU-friendly)."""
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    tflite_bytes = converter.convert()
    out_path.write_bytes(tflite_bytes)
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"[tflite] saved {out_path} ({size_mb:.2f} MB)")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fine-tune EfficientNetV2B0 on NSFW dataset")
    p.add_argument("--data-dir", default=DEFAULT_DATA_DIR, help="Root of the 5-class dataset")
    p.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Where to save artifacts")
    p.add_argument("--batch-size", type=int, default=32, help="Initial batch size (fallback 16)")
    p.add_argument("--fallback-batch-size", type=int, default=16, help="OOM fallback")
    p.add_argument("--phase1-epochs", type=int, default=8, help="Head training epochs")
    p.add_argument("--phase2-epochs", type=int, default=5, help="Fine-tune epochs")
    p.add_argument("--unfreeze-last", type=int, default=20, help="Layers to unfreeze in phase 2")
    p.add_argument(
        "--no-augment",
        action="store_true",
        help="Disable rotation/zoom augmentation (recommended for small datasets)",
    )
    p.add_argument(
        "--cpu",
        action="store_true",
        help="Force CPU training (bypasses libdevice/GPU XLA issues)",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    data_root = Path(args.data_dir)
    if not data_root.is_dir():
        print(f"[error] dataset not found: {data_root}", file=sys.stderr)
        return 2

    validate_data_dir(data_root)
    data_path = prepare_data_dir(data_root)
    prune_invalid_images(data_path)
    validate_data_dir(data_path)
    data_dir = str(data_path)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    h5_path = output_dir / "nsfw_model.h5"
    ckpt_path = output_dir / "nsfw_best.h5"
    tflite_path = output_dir / "nsfw_detector.tflite"
    plot_path = output_dir / "training_history.png"

    configure_gpu(force_cpu=args.cpu)
    print(f"[tf] version={tf.__version__}")

    def run_two_phase(train_ds, val_ds, n_train, n_val, batch_size, model):
        merged = {"accuracy": [], "val_accuracy": [], "loss": [], "val_loss": []}
        steps = max(1, math.ceil(n_train / batch_size))
        val_steps = max(1, math.ceil(n_val / batch_size))
        fit_kw = dict(
            validation_data=val_ds,
            steps_per_epoch=steps,
            validation_steps=val_steps,
            callbacks=callbacks_for(ckpt_path),
            verbose=2,
        )

        # Phase 1 — frozen base, train head only
        model.compile(
            optimizer=tf.keras.optimizers.Adam(1e-3),
            loss="categorical_crossentropy",
            metrics=["accuracy"],
        )
        print("[phase 1] head only, base frozen")
        h1 = model.fit(train_ds, epochs=args.phase1_epochs, **fit_kw)
        for key in merged:
            merged[key].extend(h1.history.get(key, []))

        # Phase 2 — unfreeze last N layers, very low LR
        base_layer = next(l for l in model.layers if isinstance(l, tf.keras.Model))
        base_layer.trainable = True
        for layer in base_layer.layers[: -args.unfreeze_last]:
            layer.trainable = False
        trainable = sum(1 for l in base_layer.layers if l.trainable)
        print(
            f"[phase 2] unfroze last {args.unfreeze_last} layers "
            f"(trainable={trainable}/{len(base_layer.layers)})"
        )
        model.compile(
            optimizer=tf.keras.optimizers.Adam(1e-5),
            loss="categorical_crossentropy",
            metrics=["accuracy"],
        )
        h2 = model.fit(train_ds, epochs=args.phase2_epochs, **fit_kw)
        for key in merged:
            merged[key].extend(h2.history.get(key, []))

        class FakeHistory:
            def __init__(self, hist_dict): self.history = hist_dict
        return FakeHistory(merged)

    start = time.time()
    augment = not args.no_augment
    if count_images(Path(data_dir)) < 200:
        augment = False
        print("[data] Small dataset — augmentation disabled")

    history, model, class_indices, used_batch = fit_with_oom_fallback(
        builder_fn=run_two_phase,
        data_dir=data_dir,
        initial_batch_size=args.batch_size,
        fallback_batch_size=args.fallback_batch_size,
        augment=augment,
    )
    elapsed = time.time() - start

    model.save(h5_path)
    print(f"[keras] saved {h5_path}")

    plot_history(history.history, plot_path)
    convert_to_tflite(model, tflite_path)

    sorted_classes = sorted(class_indices.items(), key=lambda kv: kv[1])
    labels_txt = output_dir / "labels.txt"
    labels_txt.write_text("\n".join(name for name, _ in sorted_classes), encoding="utf-8")
    print(f"[labels] saved {labels_txt}")

    print("\n=== Training summary ===")
    print(f"  class_indices : {class_indices}")
    print(f"  batch_size    : {used_batch}")
    print(f"  elapsed       : {elapsed/60:.1f} min")
    print(f"  keras model   : {h5_path}")
    print(f"  best ckpt     : {ckpt_path}")
    print(f"  tflite model  : {tflite_path}")
    print(f"  history plot  : {plot_path}")
    print(f"  labels        : {labels_txt}")
    mobile_assets = (
        Path(__file__).resolve().parent.parent
        / "MobileApp/android/app/src/main/assets/models"
    )
    print("\n=== Copy to mobile app ===")
    print(f"  mkdir -p {mobile_assets}")
    print(f"  cp {tflite_path} {mobile_assets / 'nsfw_detector.tflite'}")
    print(f"  cp {labels_txt} {mobile_assets / 'labels.txt'}")
    print("\nWSL:")
    print(
        "  cp out/nsfw_detector.tflite "
        "/mnt/c/Users/helmi/OneDrive/Documents/GitHub/PFE/"
        "MobileApp/android/app/src/main/assets/models/"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
