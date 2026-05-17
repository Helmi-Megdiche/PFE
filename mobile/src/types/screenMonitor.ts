export type RiskCategory =
  | 'violent'
  | 'toxic'
  | 'dangerous'
  | 'educational'
  | 'neutral';

export interface ScreenEventPayload {
  timestamp: string;
  appPackage: string;
  extractedTextPreview: string;
  riskFlag: boolean;
  riskScore?: number | null;
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
  skippedReason?: 'battery' | 'idle' | 'permission' | 'storage' | 'ocr';
  event?: ScreenEventPayload;
  error?: string;
}
