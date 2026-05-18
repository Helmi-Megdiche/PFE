/**
 * On-device image classification — ML Kit + NSFW layer + shared riskMapping.
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
import { classifyNsfw } from './nsfwClassifier';
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
  } else if (riskScore >= 50 && category === 'neutral') {
    category = mlKitMapped.category === 'neutral' ? 'adult' : mlKitMapped.category;
  }

  const categoryWeights = { ...mlKitMapped.categoryWeights };
  if (nsfw.category === 'adult') {
    categoryWeights.adult = Math.max(categoryWeights.adult ?? 0, nsfwScore / 100);
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

function classifyWithMock(imageUri: string, filePath?: string): ImageClassificationResult {
  const haystack = `${filePath ?? ''} ${imageUri}`.toLowerCase();
  const labels: Array<{ text: string; confidence: number }> = [
    { text: 'screenshot', confidence: 0.5 },
  ];

  if (haystack.includes('hentai')) {
    labels.push({ text: 'cartoon', confidence: 0.88 }, { text: 'illustration', confidence: 0.82 });
  } else if (haystack.includes('violence') || haystack.includes('gun')) {
    labels.push({ text: 'gun', confidence: 0.92 }, { text: 'weapon', confidence: 0.88 });
  } else if (haystack.includes('blood') || haystack.includes('gore')) {
    labels.push({ text: 'blood', confidence: 0.92 });
  } else if (haystack.includes('drug') || haystack.includes('syringe')) {
    labels.push({ text: 'syringe', confidence: 0.9 }, { text: 'pill', confidence: 0.85 });
  } else if (haystack.includes('adult') || haystack.includes('nsfw')) {
    labels.push({ text: 'skin', confidence: 0.88 }, { text: 'underwear', confidence: 0.85 });
  } else if (haystack.includes('education') || haystack.includes('school')) {
    labels.push({ text: 'book', confidence: 0.85 });
  } else if (haystack.includes('skin') && haystack.includes('hand')) {
    labels.push({ text: 'skin', confidence: 0.9 }, { text: 'hand', confidence: 0.88 });
  }

  const mapped = mapMlKitLabelsToRisk(labels.map((l) => ({ label: l.text, confidence: l.confidence })));
  const nsfw = {
    riskScore: mapped.riskScore,
    category: mapped.category === 'adult' ? 'adult' as const : 'neutral' as const,
    forced: false,
    source: 'path-hint' as const,
    probabilities: { porn: 0, sexy: 0, hentai: 0, neutral: 0.5, drawing: 0 },
  };
  const merged = mergeVisionRisk(mapped, nsfw);
  return buildResult(labels, 'mock', merged, nsfw.source, { mockHint: haystack.slice(-40) });
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

    return buildResult(labels, 'mlkit', merged, nsfw.source, {
      nsfwProbabilities: nsfw.probabilities,
    });
  } catch (err) {
    scWarn('ML Kit image labeling failed', err);
    return null;
  }
}

export async function classifyImage(
  imageUri: string,
  filePath?: string,
): Promise<ImageClassificationResult> {
  const mlkit = await classifyWithMlKit(imageUri, filePath);
  if (mlkit) {
    return mlkit;
  }

  scLog('Image classification fallback → mock', { filePath: filePath?.slice(-40) });
  return classifyWithMock(imageUri, filePath);
}

export function preloadImageClassifier(): void {
  scLog('Image classifier ready (ML Kit + NSFW proxy + riskMapping)');
}
