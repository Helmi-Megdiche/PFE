/** Vision risk categories (Sprint 3 — image model + combined with OCR). */
export type VisionRiskCategory =
  | 'violent'
  | 'adult'
  | 'gore'
  | 'dangerous_challenge'
  | 'educational'
  | 'neutral'
  | 'toxic';

export type ClassificationSource = 'tflite' | 'mlkit' | 'mock';

export interface ImageClassificationScores {
  violenceScore: number;
  adultScore: number;
  goreScore: number;
  dangerousChallengeScore: number;
  educationalScore: number;
}

export interface ImageClassificationResult extends ImageClassificationScores {
  imageRiskScore: number;
  source: ClassificationSource;
  imageClassificationDetails: ImageClassificationDetails;
}

export interface ImageClassificationDetails {
  source: ClassificationSource;
  violenceScore: number;
  adultScore: number;
  goreScore: number;
  dangerousChallengeScore: number;
  educationalScore: number;
  imageRiskScore: number;
  mappedCategory?: string;
  topRiskLabels?: string[];
  categoryWeights?: Record<string, number>;
  mlKitLabels?: Array<{ text: string; confidence: number }>;
  nsfwSource?: string;
  nsfwProbabilities?: Record<string, number>;
  tfliteOutputs?: number[];
  captureQualityHint?: 'ok' | 'blank_or_protected';
  mockHint?: string;
}
