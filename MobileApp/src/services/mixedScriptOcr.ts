/**
 * Hybrid OCR — ML Kit Text Recognition (primary) with Arabizi normalization.
 *
 * Tesseract.js is intentionally not loaded here (RN 0.74 + WASM is unreliable).
 * When Arabic script or strong Arabizi is detected, cleaned ML Kit text is passed
 * through normalizeArabizi so keywordFilter can match Derja terms written with
 * Latin letters and digits.
 *
 * ML Kit language hints: @react-native-ml-kit/text-recognition v1.5.x only exposes
 * TextRecognitionScript (Latin, Chinese, Devanagari, Japanese, Korean) — no Arabic
 * script option. Default Latin covers French + English + Arabizi; Arabic Unicode
 * relies on ML Kit's Latin recognizer (limited accuracy — documented limitation).
 */

import TextRecognition from '@react-native-ml-kit/text-recognition';
import { cleanOcrText } from '../utils/cleanOcrText';
import {
  containsArabicOrArabizi,
  containsArabicScript,
  containsStrongArabizi,
  normalizeArabizi,
} from '../utils/normalizeArabizi';
import { scLog } from '../utils/screenCaptureLogger';

export type MixedOcrSource = 'mlkit' | 'mlkit+normalized';

export interface MixedOcrResult {
  /** Raw ML Kit output (for logging / dashboard preview). */
  text: string;
  /** UI noise stripped — used for keyword matching. */
  cleanedText: string;
  source: MixedOcrSource;
  normalizedText?: string;
  hasArabicScript: boolean;
  hasArabiziPattern: boolean;
}

function detectArabicScript(text: string): boolean {
  try {
    return containsArabicScript(text);
  } catch {
    return /[\u0600-\u06FF]/.test(text);
  }
}

function detectActionableArabizi(text: string): boolean {
  try {
    return containsStrongArabizi(text);
  } catch {
    return /[a-z][2356789]|[2356789][a-z]/i.test(text);
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
 * Extract text from a screenshot using ML Kit. When Arabic script or actionable
 * Arabizi patterns are detected on cleaned text, also returns normalizedText.
 */
export async function extractTextMixed(imageUri: string): Promise<MixedOcrResult> {
  const mlResult = await TextRecognition.recognize(imageUri);
  const mlText = (mlResult?.text ?? '').trim();
  const cleanedText = cleanOcrText(mlText);
  const hasArabicScript = detectArabicScript(cleanedText);
  const hasArabiziPattern = detectActionableArabizi(cleanedText);

  if (!containsArabicOrArabizi(cleanedText)) {
    if (__DEV__) {
      scLog('[OCR] ML Kit only', { chars: mlText.length, cleanedChars: cleanedText.length });
    }
    return {
      text: mlText,
      cleanedText,
      source: 'mlkit',
      hasArabicScript,
      hasArabiziPattern,
    };
  }

  const normalizedText = normalizeText(cleanedText);
  if (__DEV__) {
    scLog('[OCR] ML Kit + Arabizi normalization', {
      chars: mlText.length,
      cleanedChars: cleanedText.length,
      arabic: hasArabicScript,
      arabizi: hasArabiziPattern,
      normalizedChanged: normalizedText !== cleanedText.toLowerCase(),
    });
  }

  return {
    text: mlText,
    cleanedText,
    source: 'mlkit+normalized',
    normalizedText,
    hasArabicScript,
    hasArabiziPattern,
  };
}
