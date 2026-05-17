/**
 * On-device image classification — Sprint 3.
 *
 * Pipeline: TFLite (if model on device) → ML Kit Image Labeling → development mock.
 * Replace mock by adding `nsfw_violence.tflite` (see assets/models/README.md).
 */

import { Platform } from 'react-native';
import type {
  ClassificationSource,
  ImageClassificationDetails,
  ImageClassificationResult,
  ImageClassificationScores,
} from '../types/imageClassification';
import { computeImageRiskScore } from '../utils/riskCombination';
import { scLog, scWarn } from '../utils/screenCaptureLogger';

const TFLITE_ASSET = 'nsfw_violence.tflite';
const ANDROID_ASSET_URL = `file:///android_asset/models/${TFLITE_ASSET}`;

const MLKIT_VIOLENCE = [
  'weapon',
  'gun',
  'rifle',
  'violence',
  'fight',
  'war',
  'explosion',
];
const MLKIT_GORE = ['blood', 'injury', 'wound', 'surgery', 'horror'];
const MLKIT_ADULT = ['nude', 'nudity', 'adult', 'lingerie', 'bikini', 'underwear'];
const MLKIT_CHALLENGE = ['stunt', 'parkour', 'challenge', 'danger'];
const MLKIT_EDUCATIONAL = [
  'book',
  'classroom',
  'whiteboard',
  'text',
  'document',
  'library',
  'school',
];

let cachedTfliteModel: TfliteModelHandle | null = null;
let tfliteLoadAttempted = false;
let tfliteLoadFailed = false;

interface TfliteModelHandle {
  run: (inputs: unknown[]) => Promise<unknown[]>;
}

function scoresToResult(
  scores: ImageClassificationScores,
  source: ClassificationSource,
  details: Partial<ImageClassificationDetails>,
): ImageClassificationResult {
  const imageRiskScore = computeImageRiskScore(scores);
  const imageClassificationDetails: ImageClassificationDetails = {
    source,
    violenceScore: scores.violenceScore,
    adultScore: scores.adultScore,
    goreScore: scores.goreScore,
    dangerousChallengeScore: scores.dangerousChallengeScore,
    educationalScore: scores.educationalScore,
    imageRiskScore,
    ...details,
  };
  return {
    ...scores,
    imageRiskScore,
    source,
    imageClassificationDetails,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function educationalFromUnsafe(unsafe: ImageClassificationScores): number {
  const maxUnsafe = Math.max(
    unsafe.violenceScore,
    unsafe.adultScore,
    unsafe.goreScore,
    unsafe.dangerousChallengeScore,
  );
  return clamp01(1 - maxUnsafe);
}

/** Development mock — path/filename heuristics + low random noise. */
function classifyWithMock(imageUri: string, filePath?: string): ImageClassificationResult {
  const haystack = `${filePath ?? ''} ${imageUri}`.toLowerCase();
  const scores: ImageClassificationScores = {
    violenceScore: 0.05 + Math.random() * 0.08,
    adultScore: 0.03 + Math.random() * 0.06,
    goreScore: 0.03 + Math.random() * 0.06,
    dangerousChallengeScore: 0.02 + Math.random() * 0.05,
    educationalScore: 0.1,
  };

  let hint = 'default-low-risk';

  if (haystack.includes('violence') || haystack.includes('violent')) {
    scores.violenceScore = 0.85 + Math.random() * 0.1;
    hint = 'filename-violence';
  } else if (haystack.includes('blood') || haystack.includes('gore')) {
    scores.goreScore = 0.88 + Math.random() * 0.1;
    hint = 'filename-gore';
  } else if (haystack.includes('adult') || haystack.includes('nsfw')) {
    scores.adultScore = 0.9 + Math.random() * 0.08;
    hint = 'filename-adult';
  } else if (
    haystack.includes('challenge') ||
    haystack.includes('dangerous') ||
    haystack.includes('stunt')
  ) {
    scores.dangerousChallengeScore = 0.82 + Math.random() * 0.12;
    hint = 'filename-challenge';
  } else if (
    haystack.includes('education') ||
    haystack.includes('school') ||
    haystack.includes('learn')
  ) {
    scores.educationalScore = 0.85 + Math.random() * 0.1;
    scores.violenceScore = 0.02;
    scores.adultScore = 0.02;
    scores.goreScore = 0.02;
    scores.dangerousChallengeScore = 0.02;
    hint = 'filename-educational';
  }

  scores.educationalScore = Math.max(scores.educationalScore, educationalFromUnsafe(scores));

  return scoresToResult(scores, 'mock', { mockHint: hint });
}

function mapMlKitLabels(
  labels: Array<{ text: string; confidence: number }>,
): ImageClassificationScores {
  const scores: ImageClassificationScores = {
    violenceScore: 0,
    adultScore: 0,
    goreScore: 0,
    dangerousChallengeScore: 0,
    educationalScore: 0,
  };

  for (const label of labels) {
    const text = label.text.toLowerCase();
    const c = label.confidence;

    if (MLKIT_VIOLENCE.some((k) => text.includes(k))) {
      scores.violenceScore = Math.max(scores.violenceScore, c);
    }
    if (MLKIT_GORE.some((k) => text.includes(k))) {
      scores.goreScore = Math.max(scores.goreScore, c);
    }
    if (MLKIT_ADULT.some((k) => text.includes(k))) {
      scores.adultScore = Math.max(scores.adultScore, c);
    }
    if (MLKIT_CHALLENGE.some((k) => text.includes(k))) {
      scores.dangerousChallengeScore = Math.max(scores.dangerousChallengeScore, c);
    }
    if (MLKIT_EDUCATIONAL.some((k) => text.includes(k))) {
      scores.educationalScore = Math.max(scores.educationalScore, c);
    }
  }

  scores.educationalScore = Math.max(scores.educationalScore, educationalFromUnsafe(scores));
  return scores;
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

    const scores = mapMlKitLabels(labels);
    scLog('ML Kit image labels', {
      top: labels.slice(0, 5).map((l) => `${l.text}:${l.confidence.toFixed(2)}`),
    });

    return scoresToResult(scores, 'mlkit', {
      mlKitLabels: labels.slice(0, 15).map((l) => ({
        text: l.text,
        confidence: l.confidence,
      })),
    });
  } catch (err) {
    scWarn('ML Kit image labeling failed', err);
    return null;
  }
}

function mapTfliteOutputs(outputs: number[]): ImageClassificationScores {
  const safe = clamp01(outputs[0] ?? 0);
  const violent = clamp01(outputs[1] ?? 0);
  const adult = clamp01(outputs[2] ?? 0);
  const gore = clamp01(outputs[3] ?? 0);
  const challenge = clamp01(outputs[4] ?? 0);

  const scores: ImageClassificationScores = {
    violenceScore: violent,
    adultScore: adult,
    goreScore: gore,
    dangerousChallengeScore: challenge,
    educationalScore: Math.max(educationalFromUnsafe({ violenceScore: violent, adultScore: adult, goreScore: gore, dangerousChallengeScore: challenge, educationalScore: 0 }), safe * 0.5),
  };

  return scores;
}

async function loadTfliteModel(): Promise<TfliteModelHandle | null> {
  if (cachedTfliteModel) {
    return cachedTfliteModel;
  }
  if (tfliteLoadAttempted && tfliteLoadFailed) {
    return null;
  }

  tfliteLoadAttempted = true;

  if (Platform.OS !== 'android') {
    tfliteLoadFailed = true;
    return null;
  }

  try {
    const { loadTensorflowModel } = require('react-native-fast-tflite');
    const model = await loadTensorflowModel({ url: ANDROID_ASSET_URL });
    cachedTfliteModel = model as TfliteModelHandle;
    scLog('TFLite model loaded from Android assets', { asset: TFLITE_ASSET });
    return cachedTfliteModel;
  } catch (err) {
    tfliteLoadFailed = true;
    scWarn('TFLite model not available — using ML Kit / mock', err);
    return null;
  }
}

/**
 * Runs TFLite when a real model is bundled. Without preprocessing, inference is skipped
 * (returns null) so ML Kit / mock handle the frame. When you add a 224×224 model, wire
 * tensor input here (e.g. react-native-image-resizer + float32 normalize).
 */
async function classifyWithTflite(
  _imageUri: string,
): Promise<ImageClassificationResult | null> {
  const model = await loadTfliteModel();
  if (!model) {
    return null;
  }

  // No bundled model file → skip run (load usually fails first).
  // When a model exists, replace this block with real tensor preprocessing.
  try {
    const outputs = (await model.run([])) as number[][];
    const vector = outputs[0];
    if (!vector || vector.length < 5) {
      scWarn('TFLite output unexpected shape — skipping');
      return null;
    }
    const scores = mapTfliteOutputs(vector);
    return scoresToResult(scores, 'tflite', { tfliteOutputs: vector.slice(0, 5) });
  } catch (err) {
    scWarn('TFLite inference skipped or failed', err);
    return null;
  }
}

/**
 * Classify a captured screenshot (non-blocking async).
 */
export async function classifyImage(
  imageUri: string,
  filePath?: string,
): Promise<ImageClassificationResult> {
  const tflite = await classifyWithTflite(imageUri);
  if (tflite) {
    return tflite;
  }

  const mlkit = await classifyWithMlKit(imageUri);
  if (mlkit) {
    return mlkit;
  }

  scLog('Image classification fallback → mock', { filePath: filePath?.slice(-40) });
  return classifyWithMock(imageUri, filePath);
}

/** Pre-warm TFLite on app start (optional). */
export function preloadImageClassifier(): void {
  void loadTfliteModel();
}
