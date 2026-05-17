import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export interface ScreenCapturedEvent {
  filePath: string;
  /** content:// or file:// URI for ML Kit OCR */
  imageUri?: string;
  appPackage: string;
  timestamp: number;
}

export interface ScreenCaptureErrorEvent {
  message: string;
}

export interface ScreenCaptureNativeModule {
  getPermissionRequestCode(): Promise<number>;
  requestPermission(): Promise<boolean>;
  isPermissionGranted(): Promise<boolean>;
  startCapture(intervalMs: number): Promise<boolean>;
  stopCapture(): Promise<boolean>;
  pauseCapture(): Promise<boolean>;
  resumeCapture(): Promise<boolean>;
  deleteFile(filePath: string): Promise<boolean>;
  getDebugState(): Promise<ScreenCaptureDebugState>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const LINKING_ERROR =
  'ScreenCapture native module is not linked. See MobileApp/android/NATIVE_SETUP.md';

export function getScreenCaptureModule(): ScreenCaptureNativeModule {
  if (Platform.OS !== 'android') {
    throw new Error('Screen capture is Android-only');
  }
  const mod = NativeModules.ScreenCapture as ScreenCaptureNativeModule | undefined;
  if (!mod) {
    throw new Error(LINKING_ERROR);
  }
  return mod;
}

export const SCREEN_CAPTURE_EVENTS = {
  captured: 'onScreenCaptured',
  error: 'onScreenCaptureError',
  log: 'onScreenCaptureLog',
} as const;

export interface ScreenCaptureDebugState {
  hasMediaProjection: boolean;
  isProjectionReady: boolean;
  isRunning: boolean;
  isPaused: boolean;
  hasVirtualDisplay: boolean;
  hasForegroundService: boolean;
  hasPermissionPromise: boolean;
  intervalMs: number;
}

const noopSubscription = { remove: () => undefined };

/** Safe on iOS (no-op emitter). */
export const screenCaptureEmitter =
  Platform.OS === 'android' && NativeModules.ScreenCapture
    ? new NativeEventEmitter(NativeModules.ScreenCapture)
    : ({
        addListener: () => noopSubscription,
      } as unknown as NativeEventEmitter);

export default getScreenCaptureModule;
