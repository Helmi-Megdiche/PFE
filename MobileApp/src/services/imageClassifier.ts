/**
 * On-device image classification — TFLite NSFW + ML Kit labels + riskMapping.
 */

import type {
  ClassificationSource,
  ImageClassificationDetails,
  ImageClassificationResult,
} from '../types/imageClassification';
import {
  mapMlKitLabelsToRisk,
  riskMappingToImageScores,
  toApiCategory,
} from '../utils/riskMapping';
import { classifyNsfw, initModel } from './nsfwClassifier';
import { scLog, scWarn } from '../utils/screenCaptureLogger';

function mergeVisionRisk(
  mlKitMapped: ReturnType<typeof mapMlKitLabelsToRisk>,
  nsfw: Awaited<ReturnType<typeof classifyNsfw>>,
): {
  riskScore: number;
  category: string;
  categoryWeights: Record<string, number>;
} {
  const mlScore = mlKitMapped.riskScore;
  const nsfwScore = nsfw.riskScore;
  const riskScore = Math.max(mlScore, nsfwScore);

  let category = mlKitMapped.category;
  if (nsfw.category === 'adult' && (nsfw.forced || nsfwScore >= mlScore)) {
    category = 'adult';
  } else if (nsfw.category === 'suggestive' && category === 'neutral') {
    category = 'adult';
  } else if (riskScore >= 50 && category === 'neutral') {
    category = mlKitMapped.category === 'neutral' ? 'adult' : mlKitMapped.category;
  }

  const categoryWeights = { ...mlKitMapped.categoryWeights };
  if (nsfw.category === 'adult' || nsfw.category === 'suggestive') {
    categoryWeights.adult = Math.max(categoryWeights.adult ?? 0, nsfw.nsfwScore);
  }

  return { riskScore, category: toApiCategory(category), categoryWeights };
}

function buildResult(
  labels: Array<{ text: string; confidence: number }>,
  source: ClassificationSource,
  merged: ReturnType<typeof mergeVisionRisk>,
  nsfwSource: string,
  extra: Partial<ImageClassificationDetails>,
): ImageClassificationResult {
  const mlLabels = labels.map((l) => ({ label: l.text, confidence: l.confidence }));
  const mapped = mapMlKitLabelsToRisk(mlLabels);
  const scores = riskMappingToImageScores({
    ...mapped,
    riskScore: merged.riskScore,
    categoryWeights: merged.categoryWeights,
  });

  const imageClassificationDetails: ImageClassificationDetails = {
    source,
    violenceScore: scores.violenceScore,
    adultScore: Math.max(scores.adultScore, merged.riskScore / 100),
    goreScore: scores.goreScore,
    dangerousChallengeScore: scores.dangerousChallengeScore,
    educationalScore: scores.educationalScore,
    imageRiskScore: merged.riskScore,
    mappedCategory: merged.category,
    topRiskLabels: mapped.topLabels,
    categoryWeights: merged.categoryWeights,
    mlKitLabels: labels.slice(0, 15).map((l) => ({ text: l.text, confidence: l.confidence })),
    nsfwSource,
    ...extra,
  };

  return {
    ...scores,
    adultScore: imageClassificationDetails.adultScore,
    imageRiskScore: merged.riskScore,
    source,
    imageClassificationDetails,
  };
}

async function classifyWithMlKit(
  imageUri: string,
  filePath?: string,
): Promise<ImageClassificationResult | null> {
  try {
    const ImageLabeling = require('@react-native-ml-kit/image-labeling').default;
    const labels = (await ImageLabeling.label(imageUri)) as Array<{
      text: string;
      confidence: number;
    }>;

    if (!labels?.length) {
      return null;
    }

    scLog('ML Kit image labels', {
      top: labels.slice(0, 5).map((l) => `${l.text}:${l.confidence.toFixed(2)}`),
    });

    const mlLabels = labels.map((l) => ({ label: l.text, confidence: l.confidence }));
    const mapped = mapMlKitLabelsToRisk(mlLabels);
    const nsfw = await classifyNsfw(imageUri, filePath, labels);
    const merged = mergeVisionRisk(mapped, nsfw);
    const source: ClassificationSource =
      nsfw.source === 'tflite' ? 'tflite' : 'mlkit';

    return buildResult(labels, source, merged, nsfw.source, {
      nsfwProbabilities: nsfw.probabilities,
      tfliteOutputs: nsfw.rawOutput,
    });
  } catch (err) {
    scWarn('ML Kit image labeling failed', err);
    return null;
  }
}

/** TFLite-only path when ML Kit returns no labels. */
async function classifyWithTfliteOnly(
  imageUri: string,
  filePath?: string,
): Promise<ImageClassificationResult> {
  const nsfw = await classifyNsfw(imageUri, filePath);
  const labels: Array<{ text: string; confidence: number }> = [
    { text: 'screenshot', confidence: 0.4 },
  ];
  const mapped = mapMlKitLabelsToRisk(labels.map((l) => ({ label: l.text, confidence: l.confidence })));
  const merged = mergeVisionRisk(mapped, nsfw);
  return buildResult(labels, 'tflite', merged, nsfw.source, {
    nsfwProbabilities: nsfw.probabilities,
    tfliteOutputs: nsfw.rawOutput,
  });
}

function classifyWithMock(imageUri: string, filePath?: string): ImageClassificationResult {
  const haystack = `${filePath ?? ''} ${imageUri}`.toLowerCase();
  const labels: Array<{ text: string; confidence: number }> = [
    { text: 'screenshot', confidence: 0.5 },
  ];

  if (haystack.includes('hentai') || haystack.includes('nsfw') || haystack.includes('porn')) {
    labels.push({ text: 'skin', confidence: 0.88 }, { text: 'underwear', confidence: 0.85 });
  } else if (haystack.includes('violence') || haystack.includes('gun')) {
    labels.push({ text: 'gun', confidence: 0.92 });
  }

  const mapped = mapMlKitLabelsToRisk(labels.map((l) => ({ label: l.text, confidence: l.confidence })));
  const nsfwProb = haystack.includes('nsfw') || haystack.includes('porn') ? 0.9 : 0.1;
  const nsfw = {
    riskScore: Math.round(nsfwProb * 100),
    category: (nsfwProb > 0.7 ? 'adult' : 'neutral') as 'adult' | 'neutral',
    forced: false,
    source: 'unavailable' as const,
    probabilities: {
      porn: nsfwProb,
      sexy: 0,
      hentai: 0,
      neutral: 1 - nsfwProb,
      drawing: 0,
    },
    nsfwScore: nsfwProb,
    sfwScore: 1 - nsfwProb,
  };
  const merged = mergeVisionRisk(mapped, nsfw);
  return buildResult(labels, 'mock', merged, nsfw.source, { mockHint: haystack.slice(-40) });
}

export async function classifyImage(
  imageUri: string,
  filePath?: string,
): Promise<ImageClassificationResult> {
  const mlkit = await classifyWithMlKit(imageUri, filePath);
  if (mlkit) {
    return mlkit;
  }

  try {
    scLog('Image classification → TFLite NSFW only');
    return await classifyWithTfliteOnly(imageUri, filePath);
  } catch (err) {
    scWarn('TFLite NSFW failed, mock fallback', err);
    return classifyWithMock(imageUri, filePath);
  }
}

export function preloadImageClassifier(): void {
  void initModel().catch((err) => scWarn('NSFW model preload failed', err));
  scLog('Image classifier ready (TFLite NSFW + ML Kit + riskMapping)');
}
