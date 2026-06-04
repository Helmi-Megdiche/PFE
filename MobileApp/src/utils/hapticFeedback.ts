import { Platform, Vibration } from 'react-native';

/** Short tap feedback; no-ops safely when VIBRATE is unavailable. */
export function lightTapFeedback(): void {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    Vibration.vibrate(20);
  } catch {
    // Missing VIBRATE permission or unsupported device — visual feedback only.
  }
}
