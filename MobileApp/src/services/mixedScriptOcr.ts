/**
 * Hybrid OCR — ML Kit first, optional on-device Arabic Tesseract fallback.
 *
 * Flow is strictly sequential:
 * 1) ML Kit runs first (fast path, FR/EN/Arabizi)
 * 2) On Android, run Tesseract (ara) when ML Kit output has Arabic script OR
 *    strong Arabizi without Arabic Unicode (garbled Latin from Arabic pages)
 *
 * This avoids ML Kit/Tesseract concurrency and keeps non-Arabic captures fast.
 */

import TextRecognition from '@react-native-ml-kit/text-recognition';
import { Platform } from 'react-native';
import { extractArabicTextOnDevice } from './mobileArabicOcr';
import { cleanOcrText } from '../utils/cleanOcrText';
import { shouldAttemptOnDeviceArabicOcr } from '../utils/arabicOcrTrigger';
import { toTesseractImagePath } from '../utils/imageUri';
import {
  containsArabicOrArabizi,
  containsArabicScript,
  containsDerjaLatinHints,
  containsDigitLetterPattern,
  containsStrongArabizi,
  normalizeArabizi,
} from '../utils/normalizeArabizi';
import { scLog } from '../utils/screenCaptureLogger';

export type MixedOcrSource = 'mlkit' | 'mlkit+normalized' | 'mlkit+tesseract';

export interface MixedOcrResult {
  /** Raw ML Kit output (for logging / dashboard preview). */
  text: string;
  /** UI noise stripped — used for keyword matching. */
  cleanedText: string;
  source: MixedOcrSource;
  normalizedText?: string;
  tesseractArabicText?: string;
  tesseractConfidence?: number;
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

function countLatinLetters(text: string): number {
  return (text.match(/[a-zA-Z]/g) ?? []).length;
}

function countArabicLetters(text: string): number {
  return (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? [])
    .length;
}

/** ML Kit read a long Latin page — Tesseract `ara` often hallucinates Arabic script here. */
function isSubstantialLatinWithoutArabic(cleanedMlText: string): boolean {
  if (detectArabicScript(cleanedMlText)) {
    return false;
  }
  const latin = countLatinLetters(cleanedMlText);
  const arabic = countArabicLetters(cleanedMlText);
  return latin >= 40 && latin > arabic * 4;
}

function tesseractImprovesMlKit(
  mlText: string,
  cleanedMlText: string,
  tesseractText: string,
): boolean {
  const cleanedTesseract = cleanOcrText(tesseractText);
  const mlHasArabic = detectArabicScript(mlText) || detectArabicScript(cleanedMlText);
  const tessHasArabic =
    detectArabicScript(tesseractText) || detectArabicScript(cleanedTesseract);

  // Tesseract `ara` on English/Latin UI — discard hallucinated Arabic, keep ML Kit.
  if (!mlHasArabic && tessHasArabic && isSubstantialLatinWithoutArabic(cleanedMlText)) {
    return false;
  }

  if (tessHasArabic) {
    return true;
  }
  // ML Kit missed Arabic entirely; keep Tesseract output if it has substantive text.
  if (
    !mlHasArabic &&
    containsStrongArabizi(cleanedMlText) &&
    cleanedTesseract.length >= Math.max(20, Math.floor(cleanedMlText.length * 0.25))
  ) {
    return true;
  }
  return false;
}

/**
 * Extract text from a screenshot using ML Kit. When Arabic script or actionable
 * Arabizi patterns are detected on cleaned text, also returns normalizedText.
 */
export interface MixedOcrOptions {
  /** Absolute capture path for Tesseract (content:// URIs are not supported natively). */
  filePath?: string;
  appPackage?: string;
}

export async function extractTextMixed(
  imageUri: string,
  options?: MixedOcrOptions,
): Promise<MixedOcrResult> {
  const mlResult = await TextRecognition.recognize(imageUri);
  const mlText = (mlResult?.text ?? '').trim();
  const cleanedMlText = cleanOcrText(mlText);
  const hasArabicScript = detectArabicScript(mlText) || detectArabicScript(cleanedMlText);
  const hasArabiziPattern =
    detectActionableArabizi(cleanedMlText) || containsDerjaLatinHints(cleanedMlText);

  // Arabic fallback path: ML Kit first, then Tesseract sequentially (Android-only).
  const tesseractPath = toTesseractImagePath(options?.filePath ?? imageUri);
  if (
    Platform.OS === 'android' &&
    tesseractPath &&
    shouldAttemptOnDeviceArabicOcr(mlText, cleanedMlText, {
      appPackage: options?.appPackage,
    })
  ) {
    const headSnippet = `${mlText}\n${cleanedMlText}`.slice(0, 200);
    const hasArabicOrArabiziInHead =
      containsArabicScript(headSnippet) || containsStrongArabizi(headSnippet);

    if (!hasArabicOrArabiziInHead) {
      scLog('[OCR] Skipping Tesseract – head-200 has no Arabic/Arabizi');
    } else {
      const tesseract = await extractArabicTextOnDevice(tesseractPath);
      if (tesseract?.text && tesseractImprovesMlKit(mlText, cleanedMlText, tesseract.text)) {
        const cleanedTesseract = cleanOcrText(tesseract.text);
        if (__DEV__) {
          scLog('[OCR] ML Kit + Tesseract Arabic fallback', {
            mlChars: mlText.length,
            tesseractChars: tesseract.text.length,
            cleanedChars: cleanedTesseract.length,
            confidence: Number(tesseract.confidence.toFixed(2)),
            trigger: hasArabicScript ? 'arabic_script' : 'garbled_arabizi',
          });
        }
        return {
          text: tesseract.text,
          cleanedText: cleanedTesseract,
          source: 'mlkit+tesseract',
          tesseractArabicText: tesseract.text,
          tesseractConfidence: tesseract.confidence,
          hasArabicScript:
            detectArabicScript(tesseract.text) || detectArabicScript(cleanedTesseract),
          hasArabiziPattern: containsDigitLetterPattern(cleanedTesseract),
        };
      }
      if (__DEV__ && tesseract?.text) {
        scLog('[OCR] Tesseract Arabic discarded — keeping ML Kit Latin text', {
          mlChars: mlText.length,
          tesseractChars: tesseract.text.length,
        });
      } else if (__DEV__ && tesseract === null) {
        scLog('[OCR] Tesseract fallback skipped, timed out, or failed — using ML Kit path');
      }
    }
  } else if (__DEV__ && Platform.OS === 'android' && shouldAttemptOnDeviceArabicOcr(mlText, cleanedMlText, { appPackage: options?.appPackage }) && !tesseractPath) {
    scLog('[OCR] Tesseract skipped — no file path (content:// only)');
  }

  if (!containsArabicOrArabizi(cleanedMlText) && !containsDerjaLatinHints(cleanedMlText)) {
    if (__DEV__) {
      scLog('[OCR] ML Kit only', { chars: mlText.length, cleanedChars: cleanedMlText.length });
    }
    return {
      text: mlText,
      cleanedText: cleanedMlText,
      source: 'mlkit',
      hasArabicScript,
      hasArabiziPattern,
    };
  }

  const normalizedText = normalizeText(cleanedMlText);
  if (__DEV__) {
    scLog('[OCR] ML Kit + Arabizi normalization', {
      chars: mlText.length,
      cleanedChars: cleanedMlText.length,
      arabic: hasArabicScript,
      arabizi: hasArabiziPattern,
      normalizedChanged: normalizedText !== cleanedMlText.toLowerCase(),
    });
  }

  return {
    text: mlText,
    cleanedText: cleanedMlText,
    source: 'mlkit+normalized',
    normalizedText,
    hasArabicScript,
    hasArabiziPattern,
  };
}
