/**
 * Hybrid OCR — ML Kit Text Recognition (primary) with Arabizi normalization.
 *
 * Tesseract.js is intentionally not loaded here (RN 0.74 + WASM is unreliable).
 * When Arabic script or strong Arabizi is detected, ML Kit text is passed through
 * normalizeArabizi so keywordFilter can match Derja terms written with Latin
 * letters and digits.
 */

import TextRecognition from '@react-native-ml-kit/text-recognition';
import {
  containsArabicScript,
  containsArabiziPattern,
  containsStrongArabizi,
  normalizeArabizi,
} from '../utils/normalizeArabizi';
import { scLog } from '../utils/screenCaptureLogger';

export type MixedOcrSource = 'mlkit' | 'mlkit+normalized';

export interface MixedOcrResult {
  text: string;
  source: MixedOcrSource;
  normalizedText?: string;
  hasArabicScript: boolean;
  hasArabiziPattern: boolean;
}

/** Runtime guard in case Metro serves a stale/partial module graph. */
function detectArabicScript(text: string): boolean {
  try {
    return containsArabicScript(text);
  } catch {
    return /[\u0600-\u06FF]/.test(text);
  }
}

function detectArabiziPattern(text: string): boolean {
  try {
    return containsArabiziPattern(text);
  } catch {
    return /[a-z][2356789]|[2356789][a-z]/i.test(text);
  }
}

function needsArabiziNormalization(text: string): boolean {
  try {
    return containsStrongArabizi(text);
  } catch {
    return detectArabicScript(text) || detectArabiziPattern(text);
  }
}

function normalizeText(text: string): string {
  try {
    return normalizeArabizi(text);
  } catch {
    return text.toLowerCase();
  }
}

/**
 * Extract text from a screenshot using ML Kit. When Arabic script or strong Arabizi
 * patterns are detected, also returns normalizedText for keyword matching.
 */
export async function extractTextMixed(imageUri: string): Promise<MixedOcrResult> {
  const mlResult = await TextRecognition.recognize(imageUri);
  const mlText = (mlResult?.text ?? '').trim();
  const hasArabicScript = detectArabicScript(mlText);
  const hasArabiziPattern = detectArabiziPattern(mlText);

  if (!needsArabiziNormalization(mlText)) {
    if (__DEV__) {
      scLog('[OCR] ML Kit only', { chars: mlText.length });
    }
    return {
      text: mlText,
      source: 'mlkit',
      hasArabicScript,
      hasArabiziPattern,
    };
  }

  const normalizedText = normalizeText(mlText);
  if (__DEV__) {
    scLog('[OCR] ML Kit + Arabizi normalization', {
      chars: mlText.length,
      arabic: hasArabicScript,
      arabizi: hasArabiziPattern,
      normalizedChanged: normalizedText !== mlText.toLowerCase(),
    });
  }

  return {
    text: mlText,
    source: 'mlkit+normalized',
    normalizedText,
    hasArabicScript,
    hasArabiziPattern,
  };
}
