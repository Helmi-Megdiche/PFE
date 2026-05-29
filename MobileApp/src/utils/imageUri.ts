import { Platform } from 'react-native';

/**
 * ML Kit on Android needs file:// or content:// — not a bare absolute path.
 */
export function toMlKitImageUri(filePath: string): string {
  if (filePath.startsWith('content://') || filePath.startsWith('file://')) {
    return filePath;
  }
  if (Platform.OS === 'android') {
    return `file://${filePath}`;
  }
  return filePath;
}

/**
 * Tesseract Android native code uses BitmapFactory.decodeFile — bare absolute path only.
 * Prefer the capture event's `filePath` over content:// FileProvider URIs.
 */
export function toTesseractImagePath(filePath: string): string | null {
  if (!filePath) return null;
  if (filePath.startsWith('content://')) {
    return null;
  }
  if (filePath.startsWith('file://')) {
    return filePath.slice('file://'.length);
  }
  return filePath;
}
