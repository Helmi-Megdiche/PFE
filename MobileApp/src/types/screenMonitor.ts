export type RiskCategory =
  | 'violent'
  | 'toxic'
  | 'dangerous'
  | 'educational'
  | 'neutral'
  | 'adult'
  | 'gore'
  | 'dangerous_challenge';

export interface ScreenEventPayload {
  timestamp: string;
  appPackage: string;
  appLabel?: string | null;
  extractedTextPreview: string;
  riskFlag: boolean;
  riskScore?: number | null;
  imageRiskScore?: number | null;
  combinedRiskScore?: number | null;
  imageClassificationDetails?: Record<string, unknown> | null;
  category?: RiskCategory | null;
}

export interface KeywordFilterResult {
  riskFlag: boolean;
  matchedKeywords: string[];
  category: RiskCategory;
}

export interface ScreenshotCaptureConfig {
  intervalMs?: number;
  maxTextLength?: number;
  minBatteryPercent?: number;
  idlePauseMs?: number;
}

export interface CaptureCycleResult {
  success: boolean;
  skippedReason?: 'battery' | 'idle' | 'permission' | 'storage' | 'ocr' | 'mission';
  event?: ScreenEventPayload;
  error?: string;
}
