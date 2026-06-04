import {Platform} from 'react-native';

/**
 * Your PC's Wi‑Fi IPv4 (ipconfig). Change if the phone cannot reach the backend.
 * Emulator ignores this and uses 10.0.2.2.
 */
export const DEV_LAN_HOST = '10.184.65.181';

const DEV_API_PORT = 3000;

function isAndroidEmulator(): boolean {
  if (Platform.OS !== 'android') {
    return false;
  }
  const constants = Platform.constants as {
    Brand?: string;
    Model?: string;
    Fingerprint?: string;
    Manufacturer?: string;
  };
  const fingerprint = constants.Fingerprint ?? '';
  const model = constants.Model ?? '';
  const brand = constants.Brand ?? '';
  return (
    fingerprint.includes('generic') ||
    fingerprint.includes('unknown') ||
    model.includes('sdk_gphone') ||
    model.includes('Emulator') ||
    model.includes('Android SDK built for') ||
    (brand === 'google' && model.includes('sdk'))
  );
}

export function getApiBaseUrl(): string {
  if (!__DEV__) {
    return 'https://your-production-api.example.com';
  }

  const host = isAndroidEmulator() ? '10.0.2.2' : DEV_LAN_HOST;
  return `http://${host}:${DEV_API_PORT}`;
}
