export interface NsfwPrediction {
  className: string;
  probability: number;
}

export interface VisionRiskResult {
  labels: Record<string, number>;
  riskScore: number;
  category: 'adult' | 'neutral';
}

const ADULT_CLASSES = new Set(['porn', 'sexy', 'hentai']);

/** Lower thresholds for hentai/porn detection (Sprint 3.6). */
export function applyNsfwThresholds(labels: Record<string, number>): {
  riskScore: number;
  category: 'adult' | 'neutral';
  forced: boolean;
} {
  const porn = labels.porn ?? 0;
  const sexy = labels.sexy ?? 0;
  const hentai = labels.hentai ?? 0;

  if (hentai > 0.5 || porn > 0.4 || sexy > 0.6) {
    return { riskScore: 100, category: 'adult', forced: true };
  }

  const riskScore = Math.round(Math.min(100, (porn + sexy + hentai) * 100));
  let topClass = 'neutral';
  let topProb = labels.neutral ?? 0;
  for (const [name, prob] of Object.entries(labels)) {
    if (prob > topProb) {
      topProb = prob;
      topClass = name;
    }
  }
  const category: 'adult' | 'neutral' = ADULT_CLASSES.has(topClass) ? 'adult' : 'neutral';
  return { riskScore, category, forced: false };
}

export function mapNsfwPredictions(
  predictions: NsfwPrediction[],
): VisionRiskResult {
  const labels: Record<string, number> = {};
  for (const p of predictions) {
    labels[p.className.toLowerCase()] = p.probability;
  }

  const thresholded = applyNsfwThresholds(labels);
  return {
    labels,
    riskScore: thresholded.riskScore,
    category: thresholded.category,
  };
}
