/**
 * NSFW vision layer — optional nsfwjs (when available) + ML Kit hentai proxy.
 * On RN 0.74 without @tensorflow/tfjs-react-native, nsfwjs load usually fails;
 * ML Kit anime/cartoon proxy + path hints fill the gap until TFLite/nsfwjs native bundle.
 */

import { scLog, scWarn } from '../utils/screenCaptureLogger';

export interface NsfwProbabilities {
  porn: number;
  sexy: number;
  hentai: number;
  neutral: number;
  drawing: number;
}

export type NsfwSource = 'nsfwjs' | 'mlkit-proxy' | 'path-hint' | 'none';

export interface NsfwInferenceResult {
  probabilities: NsfwProbabilities;
  riskScore: number;
  category: 'adult' | 'neutral';
  source: NsfwSource;
  forced: boolean;
}

const NSFW_LOAD_TIMEOUT_MS = 10_000;

export function applyNsfwThresholds(probs: NsfwProbabilities): {
  riskScore: number;
  category: 'adult' | 'neutral';
  forced: boolean;
} {
  if (probs.hentai > 0.5 || probs.porn > 0.4 || probs.sexy > 0.6) {
    return { riskScore: 100, category: 'adult', forced: true };
  }
  const score = Math.round(Math.min(100, (probs.porn + probs.sexy + probs.hentai) * 100));
  return {
    riskScore: score,
    category: score >= 40 ? 'adult' : 'neutral',
    forced: false,
  };
}

/** Infer NSFW probabilities from ML Kit labels when nsfwjs is unavailable. */
export function inferNsfwFromMlKitLabels(
  labels: Array<{ text: string; confidence: number }>,
): NsfwProbabilities {
  let hentai = 0;
  let drawing = 0;
  let porn = 0;
  let sexy = 0;
  let neutral = 0.3;

  for (const l of labels) {
    const t = l.text.toLowerCase();
    if (/hentai|erotic|nude|lingerie|underwear|bikini|breast|buttocks/.test(t)) {
      porn = Math.max(porn, l.confidence);
    } else if (/skin|flesh|muscle|torso/.test(t)) {
      sexy = Math.max(sexy, l.confidence * 0.9);
    } else if (/anime|cartoon|comic|manga|illustration|drawing|art/.test(t)) {
      hentai = Math.max(hentai, l.confidence * 0.75);
      drawing = Math.max(drawing, l.confidence);
    } else if (/person|portrait|selfie/.test(t)) {
      sexy = Math.max(sexy, l.confidence * 0.4);
    } else if (/screenshot|text|document|landscape|sky|mountain|building/.test(t)) {
      neutral = Math.max(neutral, l.confidence);
    }
  }

  return { porn, sexy, hentai, neutral, drawing };
}

function inferFromPathHints(imageUri: string, filePath?: string): NsfwProbabilities | null {
  const haystack = `${filePath ?? ''} ${imageUri}`.toLowerCase();
  if (/hentai|nsfw|porn|xxx|adult|nude/.test(haystack)) {
    return { porn: 0.85, sexy: 0.2, hentai: 0.7, neutral: 0.05, drawing: 0.1 };
  }
  return null;
}

async function tryNsfwJsClassify(_imageUri: string): Promise<NsfwProbabilities | null> {
  try {
    // Optional: works only if nsfwjs + tfjs-react-native are added later
    const nsfwjs = require('nsfwjs');
    const tf = require('@tensorflow/tfjs');
    await tf.ready();
    // Real implementation would decode image to tensor — not available without native tfjs
    void nsfwjs;
    return null;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('nsfwjs timeout')), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

/**
 * Run NSFW inference with 10s timeout; falls back to ML Kit proxy + path hints.
 */
export async function classifyNsfw(
  imageUri: string,
  filePath: string | undefined,
  mlKitLabels: Array<{ text: string; confidence: number }>,
): Promise<NsfwInferenceResult> {
  const pathHint = inferFromPathHints(imageUri, filePath);
  if (pathHint) {
    const t = applyNsfwThresholds(pathHint);
    scLog('NSFW path-hint', t);
    return {
      probabilities: pathHint,
      riskScore: t.riskScore,
      category: t.category,
      source: 'path-hint',
      forced: t.forced,
    };
  }

  try {
    const probs = await withTimeout(tryNsfwJsClassify(imageUri), NSFW_LOAD_TIMEOUT_MS);
    if (probs) {
      const t = applyNsfwThresholds(probs);
      scLog('NSFW nsfwjs', t);
      return {
        probabilities: probs,
        riskScore: t.riskScore,
        category: t.category,
        source: 'nsfwjs',
        forced: t.forced,
      };
    }
  } catch (err) {
    scWarn('nsfwjs unavailable or timed out, using ML Kit proxy', err);
  }

  const proxy = inferNsfwFromMlKitLabels(mlKitLabels);
  const t = applyNsfwThresholds(proxy);
  scLog('NSFW mlkit-proxy', { ...t, hentai: proxy.hentai, porn: proxy.porn });
  return {
    probabilities: proxy,
    riskScore: t.riskScore,
    category: t.category,
    source: 'mlkit-proxy',
    forced: t.forced,
  };
}
