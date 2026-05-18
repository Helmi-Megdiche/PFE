/**
 * On-device image classification — ML Kit + shared riskMapping rules.
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
import { scLog, scWarn } from '../utils/screenCaptureLogger';

function buildResult(
  labels: Array<{ text: string; confidence: number }>,
  source: ClassificationSource,
  extra: Partial<ImageClassificationDetails>,
): ImageClassificationResult {
  const mlLabels = labels.map((l) => ({ label: l.text, confidence: l.confidence }));
  const mapped = mapMlKitLabelsToRisk(mlLabels);
  const scores = riskMappingToImageScores(mapped);

  const imageClassificationDetails: ImageClassificationDetails = {
    source,
    violenceScore: scores.violenceScore,
    adultScore: scores.adultScore,
    goreScore: scores.goreScore,
    dangerousChallengeScore: scores.dangerousChallengeScore,
    educationalScore: scores.educationalScore,
    imageRiskScore: mapped.riskScore,
    mappedCategory: toApiCategory(mapped.category),
    topRiskLabels: mapped.topLabels,
    categoryWeights: mapped.categoryWeights,
    mlKitLabels: labels.slice(0, 15).map((l) => ({ text: l.text, confidence: l.confidence })),
    ...extra,
  };

  return {
    ...scores,
    imageRiskScore: mapped.riskScore,
    source,
    imageClassificationDetails,
  };
}

function classifyWithMock(imageUri: string, filePath?: string): ImageClassificationResult {
  const haystack = `${filePath ?? ''} ${imageUri}`.toLowerCase();
  const labels: Array<{ text: string; confidence: number }> = [
    { text: 'screenshot', confidence: 0.5 },
  ];

  if (haystack.includes('violence') || haystack.includes('violent')) {
    labels.push({ text: 'weapon', confidence: 0.9 });
  } else if (haystack.includes('blood') || haystack.includes('gore')) {
    labels.push({ text: 'blood', confidence: 0.92 });
  } else if (haystack.includes('adult') || haystack.includes('nsfw')) {
    labels.push({ text: 'skin', confidence: 0.88 }, { text: 'underwear', confidence: 0.85 });
  } else if (haystack.includes('education') || haystack.includes('school')) {
    labels.push({ text: 'book', confidence: 0.85 });
  } else if (haystack.includes('skin') && haystack.includes('hand')) {
    labels.push({ text: 'skin', confidence: 0.9 }, { text: 'hand', confidence: 0.88 });
  }

  return buildResult(labels, 'mock', {
    mockHint: haystack.slice(-40),
  });
}

async function classifyWithMlKit(imageUri: string): Promise<ImageClassificationResult | null> {
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

    return buildResult(labels, 'mlkit', {});
  } catch (err) {
    scWarn('ML Kit image labeling failed', err);
    return null;
  }
}

export async function classifyImage(
  imageUri: string,
  filePath?: string,
): Promise<ImageClassificationResult> {
  const mlkit = await classifyWithMlKit(imageUri);
  if (mlkit) {
    return mlkit;
  }

  scLog('Image classification fallback → mock', { filePath: filePath?.slice(-40) });
  return classifyWithMock(imageUri, filePath);
}

export function preloadImageClassifier(): void {
  scLog('Image classifier ready (ML Kit + riskMapping)');
}
