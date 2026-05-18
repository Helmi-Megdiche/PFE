import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';
import * as nsfwjs from 'nsfwjs';
import Jimp from 'jimp';
import { createWorker, type Worker } from 'tesseract.js';
import { analyzeText } from '../utils/keywordFilter';
import { applyExplicitContentOverride } from '../utils/riskCombination';
import { mapNsfwPredictions } from './nsfwVision';
import { logger } from '../utils/logger';

const NSFW_INPUT_SIZE = 224;
const OCR_TARGET_WIDTH = 800;

let backendReady: Promise<void> | null = null;
let nsfwModel: nsfwjs.NSFWJS | null = null;
let nsfwLoadPromise: Promise<nsfwjs.NSFWJS> | null = null;
let ocrWorker: Worker | null = null;
let ocrReady: Promise<Worker> | null = null;

async function ensureBackend(): Promise<void> {
  if (!backendReady) {
    backendReady = tf.setBackend('cpu').then(() => tf.ready()).then(() => undefined);
  }
  return backendReady;
}

async function loadNsfwModel(): Promise<nsfwjs.NSFWJS> {
  await ensureBackend();
  if (nsfwModel) return nsfwModel;
  if (!nsfwLoadPromise) {
    nsfwLoadPromise = nsfwjs.load().then((m) => {
      nsfwModel = m;
      logger.info('nsfwjs model loaded for debug classification');
      return m;
    });
  }
  return nsfwLoadPromise;
}

async function getOcrWorker(): Promise<Worker> {
  if (ocrWorker) return ocrWorker;
  if (!ocrReady) {
    ocrReady = createWorker('eng', 1, {
      logger: () => undefined,
    }).then((worker) => {
      ocrWorker = worker;
      logger.info('Tesseract OCR worker ready for debug classification');
      return worker;
    });
  }
  return ocrReady;
}

/**
 * Grayscale, resize, and contrast boost for clearer Tesseract extraction.
 */
export async function preprocessForOcr(buffer: Buffer): Promise<Buffer> {
  const image = await Jimp.read(buffer);
  const w = image.bitmap.width;

  if (w < OCR_TARGET_WIDTH) {
    image.resize(OCR_TARGET_WIDTH, Jimp.AUTO);
  } else if (w > OCR_TARGET_WIDTH) {
    image.resize(OCR_TARGET_WIDTH, Jimp.AUTO);
  }

  image.greyscale();
  image.contrast(0.35);
  image.normalize();

  return image.getBufferAsync(Jimp.MIME_PNG);
}

async function bufferToNsfwTensor(buffer: Buffer): Promise<tf.Tensor3D> {
  const image = await Jimp.read(buffer);
  image.resize(NSFW_INPUT_SIZE, NSFW_INPUT_SIZE);
  const { width, height } = image.bitmap;
  const rgb = new Float32Array(width * height * 3);
  let offset = 0;
  image.scan(0, 0, width, height, (_x, _y, idx) => {
    rgb[offset++] = image.bitmap.data[idx] / 255;
    rgb[offset++] = image.bitmap.data[idx + 1] / 255;
    rgb[offset++] = image.bitmap.data[idx + 2] / 255;
  });
  return tf.tensor3d(rgb, [height, width, 3]);
}

export interface DebugClassifyResult {
  vision: {
    labels: Record<string, number>;
    riskScore: number;
    category: string;
  };
  ocr: {
    text: string;
    riskScore: number;
    category: string;
    riskFlag: boolean;
    matchedKeywords: string[];
  };
  combinedRiskScore: number;
  finalCategory: string;
  note: string;
}

async function runVisionClassification(buffer: Buffer): Promise<DebugClassifyResult['vision']> {
  const model = await loadNsfwModel();
  const tensor = await bufferToNsfwTensor(buffer);

  try {
    const predictions = await model.classify(tensor);
    const mapped = mapNsfwPredictions(predictions);
    return {
      labels: mapped.labels,
      riskScore: mapped.riskScore,
      category: mapped.category,
    };
  } finally {
    tensor.dispose();
  }
}

async function extractTextFromImage(buffer: Buffer): Promise<string> {
  const preprocessed = await preprocessForOcr(buffer);
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(preprocessed);
  return (data.text || '').trim();
}

async function runOcrClassification(buffer: Buffer): Promise<DebugClassifyResult['ocr']> {
  const text = await extractTextFromImage(buffer);
  const analyzed = analyzeText(text);

  return {
    text,
    riskScore: analyzed.riskScore,
    category: analyzed.category,
    riskFlag: analyzed.riskFlag,
    matchedKeywords: analyzed.matchedKeywords,
  };
}

/**
 * Full debug pipeline: nsfwjs vision + Tesseract OCR + combined risk (30% OCR / 70% vision).
 */
export async function classifyImageBuffer(buffer: Buffer): Promise<DebugClassifyResult> {
  const [visionRaw, ocr] = await Promise.all([
    runVisionClassification(buffer),
    runOcrClassification(buffer),
  ]);

  const overridden = applyExplicitContentOverride(
    { category: visionRaw.category, riskScore: visionRaw.riskScore },
    { category: ocr.category, riskScore: ocr.riskScore },
  );

  return {
    vision: {
      labels: visionRaw.labels,
      riskScore: overridden.vision.riskScore,
      category: overridden.vision.category,
    },
    ocr,
    combinedRiskScore: overridden.combinedRiskScore,
    finalCategory: overridden.finalCategory,
    note:
      'Debug pipeline: nsfwjs + OCR keyword filter (explicit terms boost to adult ≥70). OCR override when vision misclassifies.',
  };
}
