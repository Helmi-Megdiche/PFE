/**
 * NSFW vision layer — ML Kit hentai proxy + path hints (on-device).
 * nsfwjs is used only on the backend debug endpoint; not bundled on mobile (RN 0.74).
 */

import { scLog } from '../utils/screenCaptureLogger';

export interface NsfwProbabilities {
  porn: number;
  sexy: number;
  hentai: number;
  neutral: number;
  drawing: number;
}

export type NsfwSource = 'mlkit-proxy' | 'path-hint';

export interface NsfwInferenceResult {
  probabilities: NsfwProbabilities;
  riskScore: number;
  category: 'adult' | 'neutral';
  source: NsfwSource;
  forced: boolean;
}

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

/** Infer NSFW probabilities from ML Kit labels. */
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
    } else if (/screenshot|text|document|landscape|sky|mountain|building|lake|river|rock|poster/.test(t)) {
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

/**
 * On-device NSFW inference: path hints, then ML Kit label proxy.
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
