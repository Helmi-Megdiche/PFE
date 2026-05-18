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

/**
 * Map nsfwjs probabilities to vision risk (mirrors mobile adult score logic).
 * visionRiskScore = (porn + sexy + hentai) * 100
 */
export function mapNsfwPredictions(
  predictions: NsfwPrediction[],
): VisionRiskResult {
  const labels: Record<string, number> = {};
  for (const p of predictions) {
    const key = p.className.toLowerCase();
    labels[key] = p.probability;
  }

  const porn = labels.porn ?? 0;
  const sexy = labels.sexy ?? 0;
  const hentai = labels.hentai ?? 0;
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

  return { labels, riskScore, category };
}
