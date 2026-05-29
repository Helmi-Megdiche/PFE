import TesseractOcr from '@devinikhiya/react-native-tesseractocr';
import { Platform } from 'react-native';
import { withTimeout } from '../utils/withTimeout';

export interface MobileArabicOcrResult {
  text: string;
  confidence: number;
}

/** First Tesseract load can be slow; cap so capture cycles do not block indefinitely. */
const RECOGNITION_TIMEOUT_MS = 25_000;

let tesseractInitDone = false;
let initializationPromise: Promise<void> | null = null;
let activeRecognition: Promise<MobileArabicOcrResult | null> | null = null;

function estimateConfidence(text: string): number {
  if (!text) return 0;
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const totalChars = text.replace(/\s+/g, '').length;
  if (totalChars === 0) return 0;
  return Math.min(0.95, arabicChars / totalChars);
}

async function initTesseractLazy(): Promise<void> {
  if (tesseractInitDone) return;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    // Native module loads on first invocation; keep this non-blocking for UI.
    tesseractInitDone = true;
  })();

  return initializationPromise;
}

async function runRecognition(imageUri: string): Promise<MobileArabicOcrResult | null> {
  try {
    await initTesseractLazy();
    const startedAt = Date.now();
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(`[ArabicOCR] starting (ara model, path=${imageUri.slice(-48)})`);
    }

    const rawText: string = await withTimeout(
      TesseractOcr.recognize(imageUri, 'ara', {}),
      RECOGNITION_TIMEOUT_MS,
      '',
    );

    if (!rawText) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(`[ArabicOCR] timed out after ${Date.now() - startedAt}ms`);
      }
      return null;
    }

    const text = rawText.trim();
    const confidence = estimateConfidence(text);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(
        `[ArabicOCR] done in ${Date.now() - startedAt}ms, chars=${text.length}, conf=${confidence.toFixed(2)}`,
      );
    }
    return { text, confidence };
  } catch (error) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[ArabicOCR] recognition failed', error);
    }
    return null;
  }
}

/**
 * Android-only on-device Arabic OCR.
 * - Lazy init on first Arabic request
 * - Single in-flight recognition to avoid native concurrency pressure
 */
export async function extractArabicTextOnDevice(
  imageUri: string,
): Promise<MobileArabicOcrResult | null> {
  if (Platform.OS !== 'android') {
    return null;
  }

  if (activeRecognition) {
    return activeRecognition;
  }

  activeRecognition = runRecognition(imageUri);
  try {
    return await activeRecognition;
  } finally {
    activeRecognition = null;
  }
}
