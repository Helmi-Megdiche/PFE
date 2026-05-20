/**
 * Hybrid OCR — ML Kit Text Recognition (primary) with Arabizi normalization,
 * and an optional Tesseract fallback for Arabic / mixed-script content.
 *
 * Tesseract.js does not run cleanly inside React Native 0.74 (WASM + Web Workers),
 * so the import is wrapped in a graceful `require()`: if the dependency is
 * missing or fails to load, we fall back to ML Kit + Arabizi normalization only.
 *
 * The on-device path still benefits from the new French / Arabic / Derja
 * keyword lists in `keywordFilter.ts`, even without Tesseract.
 */

import TextRecognition from '@react-native-ml-kit/text-recognition';
import {
  containsArabicOrArabizi,
  containsArabicScript,
  containsArabiziPattern,
  normalizeArabizi,
} from '../utils/normalizeArabizi';
import { scLog, scWarn } from '../utils/screenCaptureLogger';

export type MixedOcrSource =
  | 'mlkit'
  | 'mlkit+normalized'
  | 'tesseract'
  | 'tesseract+normalized';

export interface MixedOcrResult {
  text: string;
  source: MixedOcrSource;
  normalizedText?: string;
  hasArabicScript: boolean;
  hasArabiziPattern: boolean;
}

let tesseractWorker: unknown | null = null;
let tesseractDisabled = false;

async function getTesseractWorker(): Promise<unknown | null> {
  if (tesseractDisabled) return null;
  if (tesseractWorker) return tesseractWorker;

  try {
    // Optional dependency: not installed by default. We require lazily and
    // any error disables Tesseract for the rest of the session.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const Tesseract = require('tesseract.js');
    if (!Tesseract?.createWorker) {
      tesseractDisabled = true;
      return null;
    }
    const worker = await Tesseract.createWorker('ara+fra+eng', undefined, {
      logger: () => undefined,
    });
    tesseractWorker = worker;
    scLog('[OCR] Tesseract worker initialised (ara+fra+eng)');
    return worker;
  } catch (err) {
    tesseractDisabled = true;
    scWarn('[OCR] Tesseract not available — using ML Kit + Arabizi normalization', err);
    return null;
  }
}

async function runTesseract(imageUri: string): Promise<string | null> {
  const worker = (await getTesseractWorker()) as
    | { recognize: (uri: string) => Promise<{ data: { text?: string } }> }
    | null;
  if (!worker) return null;
  try {
    const { data } = await worker.recognize(imageUri);
    return (data?.text ?? '').trim();
  } catch (err) {
    scWarn('[OCR] Tesseract recognize failed', err);
    return null;
  }
}

/**
 * Extract text from a screenshot using ML Kit, with optional Tesseract fallback
 * when Arabic script or Arabizi patterns are detected. Always returns a
 * `normalizedText` when Arabizi patterns are present so the keyword filter can
 * scan a quasi-Arabic form of the text.
 */
export async function extractTextMixed(imageUri: string): Promise<MixedOcrResult> {
  const mlResult = await TextRecognition.recognize(imageUri);
  const mlText = (mlResult?.text ?? '').trim();
  const hasArabicScript = containsArabicScript(mlText);
  const hasArabiziPattern = containsArabiziPattern(mlText);

  if (!containsArabicOrArabizi(mlText)) {
    return {
      text: mlText,
      source: 'mlkit',
      hasArabicScript,
      hasArabiziPattern,
    };
  }

  const tessText = await runTesseract(imageUri);
  if (tessText && tessText.length > 0) {
    const tessNormalized = containsArabiziPattern(tessText)
      ? normalizeArabizi(tessText)
      : undefined;
    return {
      text: tessText,
      source: tessNormalized ? 'tesseract+normalized' : 'tesseract',
      normalizedText: tessNormalized,
      hasArabicScript: containsArabicScript(tessText),
      hasArabiziPattern: containsArabiziPattern(tessText),
    };
  }

  return {
    text: mlText,
    source: 'mlkit+normalized',
    normalizedText: normalizeArabizi(mlText),
    hasArabicScript,
    hasArabiziPattern,
  };
}
