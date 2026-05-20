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
import os
import sys
import time
from pathlib import Path

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
from tensorflow.keras.preprocessing.image import ImageDataGenerator


DEFAULT_DATA_DIR = r"C:\Users\helmi\OneDrive\Bureau\PFE-Docs\data\nsfw_scraper"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "out"
IMG_SIZE = (224, 224)
SEED = 42


def configure_gpu() -> None:
    """Enable memory growth so TF does not preallocate the full 6 GB."""
    gpus = tf.config.list_physical_devices("GPU")
    if not gpus:
        print("[gpu] No CUDA GPU detected — training will run on CPU (slow).")
        return
    for gpu in gpus:
        try:
            tf.config.experimental.set_memory_growth(gpu, True)
        except RuntimeError as err:
            print(f"[gpu] set_memory_growth failed: {err}")
    print(f"[gpu] Using {len(gpus)} GPU(s): {[g.name for g in gpus]}")


def build_data_generators(data_dir: str, batch_size: int):
    """ImageDataGenerator with 80/20 split + light augmentation on train."""
    train_aug = ImageDataGenerator(
        preprocessing_function=preprocess_input,
        validation_split=0.2,
        rotation_range=15,
        width_shift_range=0.1,
        height_shift_range=0.1,
        zoom_range=0.1,
        horizontal_flip=True,
    )
    val_aug = ImageDataGenerator(
        preprocessing_function=preprocess_input,
        validation_split=0.2,
    )

    train_gen = train_aug.flow_from_directory(
        data_dir,
        target_size=IMG_SIZE,
        batch_size=batch_size,
        class_mode="categorical",
        subset="training",
        shuffle=True,
        seed=SEED,
    )
    val_gen = val_aug.flow_from_directory(
        data_dir,
        target_size=IMG_SIZE,
        batch_size=batch_size,
        class_mode="categorical",
        subset="validation",
        shuffle=False,
        seed=SEED,
    )
    return train_gen, val_gen


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
) -> tuple[tf.keras.callbacks.History, tf.keras.Model, dict, int]:
    """
    Try training at the initial batch size. On ResourceExhaustedError,
    retry with the fallback batch size.

    `builder_fn(train_gen, val_gen, model)` returns the History object.
    """
    for attempt_batch in (initial_batch_size, fallback_batch_size):
        try:
            train_gen, val_gen = build_data_generators(data_dir, attempt_batch)
            print(
                f"[data] batch_size={attempt_batch}  "
                f"train={train_gen.samples}  val={val_gen.samples}  "
                f"classes={train_gen.num_classes}"
            )
            print(f"[data] class_indices={train_gen.class_indices}")
            model = build_model(train_gen.num_classes)
            history = builder_fn(train_gen, val_gen, model)
            return history, model, train_gen.class_indices, attempt_batch
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
    return p.parse_args()


def main() -> int:
    args = parse_args()
    data_dir = args.data_dir
    if not Path(data_dir).is_dir():
        print(f"[error] dataset not found: {data_dir}", file=sys.stderr)
        return 2

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    h5_path = output_dir / "nsfw_model.h5"
    ckpt_path = output_dir / "nsfw_best.h5"
    tflite_path = output_dir / "nsfw_detector.tflite"
    plot_path = output_dir / "training_history.png"

    configure_gpu()
    print(f"[tf] version={tf.__version__}")

    def run_two_phase(train_gen, val_gen, model):
        merged = {"accuracy": [], "val_accuracy": [], "loss": [], "val_loss": []}

        # Phase 1 — frozen base, train head only
        model.compile(
            optimizer=tf.keras.optimizers.Adam(1e-3),
            loss="categorical_crossentropy",
            metrics=["accuracy"],
        )
        print("[phase 1] head only, base frozen")
        h1 = model.fit(
            train_gen,
            validation_data=val_gen,
            epochs=args.phase1_epochs,
            callbacks=callbacks_for(ckpt_path),
            verbose=2,
        )
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
        h2 = model.fit(
            train_gen,
            validation_data=val_gen,
            epochs=args.phase2_epochs,
            callbacks=callbacks_for(ckpt_path),
            verbose=2,
        )
        for key in merged:
            merged[key].extend(h2.history.get(key, []))

        class FakeHistory:
            def __init__(self, hist_dict): self.history = hist_dict
        return FakeHistory(merged)

    start = time.time()
    history, model, class_indices, used_batch = fit_with_oom_fallback(
        builder_fn=run_two_phase,
        data_dir=data_dir,
        initial_batch_size=args.batch_size,
        fallback_batch_size=args.fallback_batch_size,
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
    print(
        "\nNext step: copy the .tflite file into\n"
        "  MobileApp/android/app/src/main/assets/models/nsfw_detector.tflite"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
