/**
 * On-device NSFW classification via Yahoo Open NSFW TFLite (assets/models/nsfw.tflite).
 * Preprocessing matches flutter_nude_checker (224×224, BGR mean 104/117/123).
 */

import { Platform } from 'react-native';
import { classifyNsfwNative, initNsfwModel } from '../native/NsfwTflite';
import { scLog, scWarn } from '../utils/screenCaptureLogger';

export interface NsfwProbabilities {
  porn: number;
  sexy: number;
  hentai: number;
  neutral: number;
  drawing: number;
}

export type NsfwSource = 'tflite' | 'unavailable';

export interface NsfwInferenceResult {
  probabilities: NsfwProbabilities;
  riskScore: number;
  category: 'adult' | 'suggestive' | 'neutral';
  source: NsfwSource;
  forced: boolean;
  nsfwScore: number;
  sfwScore: number;
  elapsedMs?: number;
  rawOutput?: number[];
}

let modelReady = false;
let initPromise: Promise<void> | null = null;

const ADULT_THRESHOLD = 0.7;
const SUGGESTIVE_THRESHOLD = 0.3;

export function mapNsfwProbabilityToCategory(
  nsfwProbability: number,
): 'adult' | 'suggestive' | 'neutral' {
  if (nsfwProbability > ADULT_THRESHOLD) {
    return 'adult';
  }
  if (nsfwProbability > SUGGESTIVE_THRESHOLD) {
    return 'suggestive';
  }
  return 'neutral';
}

export function mapNsfwProbabilityToRiskScore(nsfwProbability: number): number {
  return Math.round(Math.min(1, Math.max(0, nsfwProbability)) * 100);
}

export function probabilitiesFromNsfwScore(nsfw: number): NsfwProbabilities {
  const clamped = Math.min(1, Math.max(0, nsfw));
  return {
    porn: clamped,
    sexy: clamped * 0.5,
    hentai: 0,
    neutral: 1 - clamped,
    drawing: 0,
  };
}

/** Load TFLite model from Android assets (idempotent). */
export async function initModel(): Promise<void> {
  if (modelReady) {
    return;
  }
  if (initPromise) {
    return initPromise;
  }
  if (Platform.OS !== 'android') {
    scWarn('[NSFW] TFLite only available on Android');
    return;
  }
  initPromise = (async () => {
    await initNsfwModel();
    modelReady = true;
    scLog('[NSFW] Model loaded (nsfw.tflite)');
  })().catch((err) => {
    initPromise = null;
    scWarn('[NSFW] Model loading failed', err);
    throw err;
  });
  return initPromise;
}

function resolveFilePath(imageUri: string, filePath?: string): string {
  const raw = filePath?.trim() || imageUri.trim();
  return raw.startsWith('file://') ? raw.slice(7) : raw;
}

/**
 * Classify an image from a local file path / URI.
 * Returns riskScore 0–100 (higher = more unsafe).
 */
export async function classifyImage(
  imageUri: string,
  filePath?: string,
): Promise<NsfwInferenceResult> {
  if (Platform.OS !== 'android') {
    return unavailableResult('non-android');
  }

  try {
    if (!modelReady) {
      await initModel();
    }
    const path = resolveFilePath(imageUri, filePath);
    const scores = await classifyNsfwNative(path);
    const nsfw = scores.nsfwScore;
    const category = mapNsfwProbabilityToCategory(nsfw);
    const riskScore = mapNsfwProbabilityToRiskScore(nsfw);
    const forced = category === 'adult';

    scLog('[NSFW] TFLite', {
      nsfw: nsfw.toFixed(3),
      sfw: scores.sfwScore.toFixed(3),
      riskScore,
      category,
      ms: scores.elapsedMs,
    });

    return {
      probabilities: probabilitiesFromNsfwScore(nsfw),
      riskScore,
      category,
      source: 'tflite',
      forced,
      nsfwScore: nsfw,
      sfwScore: scores.sfwScore,
      elapsedMs: scores.elapsedMs,
      rawOutput: [scores.sfwScore, scores.nsfwScore],
    };
  } catch (err) {
    scWarn('[NSFW] inference failed', err);
    return unavailableResult(String(err));
  }
}

function unavailableResult(reason: string): NsfwInferenceResult {
  return {
    probabilities: { porn: 0, sexy: 0, hentai: 0, neutral: 1, drawing: 0 },
    riskScore: 0,
    category: 'neutral',
    source: 'unavailable',
    forced: false,
    nsfwScore: 0,
    sfwScore: 1,
    rawOutput: [1, 0],
  };
}

/** @deprecated Use classifyImage — kept for imageClassifier bridge. */
export async function classifyNsfw(
  imageUri: string,
  filePath?: string,
  _mlKitLabels?: Array<{ text: string; confidence: number }>,
): Promise<NsfwInferenceResult> {
  return classifyImage(imageUri, filePath);
}
