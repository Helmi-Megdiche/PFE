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
