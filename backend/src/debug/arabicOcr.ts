import Jimp from 'jimp';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { preprocessForArabicOcr } from './arabicOcrPreprocess';
import { analyzeTextForArabicOcr, arabicLetterRatio, containsArabicScript } from '../utils/keywordFilter';
import { logger } from '../utils/logger';

let arabicOcrWorker: Worker | null = null;
let arabicOcrReady: Promise<Worker> | null = null;

const PSM_MODES = [PSM.SINGLE_BLOCK, PSM.AUTO] as const;

async function getArabicOcrWorker(): Promise<Worker> {
  if (arabicOcrWorker) return arabicOcrWorker;
  if (!arabicOcrReady) {
    arabicOcrReady = (async () => {
      const worker = await createWorker('ara', 1, {
        logger: () => undefined,
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        user_defined_dpi: '300',
        preserve_interword_spaces: '1',
      });
      arabicOcrWorker = worker;
      logger.info('Tesseract Arabic OCR worker ready (ara, PSM block, 300 dpi)');
      return worker;
    })();
  }
  return arabicOcrReady;
}

export interface ArabicOcrExtractResult {
  text: string;
  confidence: number;
}

export interface ArabicOcrAnalysisResult extends ArabicOcrExtractResult {
  riskFlag: boolean;
  riskScore: number;
  category: string;
  matchedKeywords: string[];
  note: string;
}

function scoreOcrCandidate(text: string, confidence: number): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const arabicRatio = arabicLetterRatio(trimmed);
  const hasArabic = containsArabicScript(trimmed);
  const lengthScore = Math.min(trimmed.length / 80, 1);
  const conf = confidence > 0 ? confidence / 100 : 0.5;
  return (hasArabic ? arabicRatio * 0.55 : 0) + lengthScore * 0.25 + conf * 0.2;
}

async function recognizeWithPsm(
  worker: Worker,
  imageBuffer: Buffer,
  psm: (typeof PSM_MODES)[number],
): Promise<{ text: string; confidence: number }> {
  await worker.setParameters({ tessedit_pageseg_mode: psm });
  const { data } = await worker.recognize(imageBuffer);
  return {
    text: (data.text || '').trim(),
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
  };
}

/**
 * Try Arabic-only Tesseract with multiple PSM modes; pick the best Arabic-rich result.
 */
export async function extractArabicText(buffer: Buffer): Promise<ArabicOcrExtractResult> {
  const preprocessed = await preprocessForArabicOcr(buffer);
  const worker = await getArabicOcrWorker();

  let best = { text: '', confidence: 0, score: 0 };

  for (const psm of PSM_MODES) {
    const candidate = await recognizeWithPsm(worker, preprocessed, psm);
    const score = scoreOcrCandidate(candidate.text, candidate.confidence);
    if (score > best.score) {
      best = { ...candidate, score };
    }
  }

  if (best.text) {
    return { text: best.text, confidence: best.confidence };
  }

  // Fallback: raw upscale without greyscale pipeline (some quote images work better)
  const raw = await Jimp.read(buffer);
  if (raw.bitmap.width < 1200) {
    raw.resize(1200, Jimp.AUTO);
  }
  const rawPng = await raw.getBufferAsync(Jimp.MIME_PNG);
  const fallback = await recognizeWithPsm(worker, rawPng, PSM.SINGLE_BLOCK);
  return {
    text: fallback.text,
    confidence: fallback.confidence,
  };
}

/**
 * Full debug Arabic OCR path: Tesseract extraction + multilingual keyword filter.
 */
export async function analyzeArabicOcr(buffer: Buffer): Promise<ArabicOcrAnalysisResult> {
  const { text, confidence } = await extractArabicText(buffer);
  const analyzed = analyzeTextForArabicOcr(text);

  return {
    text,
    confidence,
    riskFlag: analyzed.riskFlag,
    riskScore: analyzed.riskScore,
    category: analyzed.category,
    matchedKeywords: analyzed.matchedKeywords,
    note:
      'Debug only: server-side Tesseract (Arabic-only model, 1600px upscale, PSM block/auto). ' +
      'OCR quality depends on image resolution and font; keyword filter ignores short English OCR noise. ' +
      'Production child app uses on-device ML Kit Latin OCR — screenshots never leave the device.',
  };
}
