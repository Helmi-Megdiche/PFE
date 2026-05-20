import { NativeModules, Platform } from 'react-native';

export interface NsfwTfliteScores {
  sfwScore: number;
  nsfwScore: number;
  elapsedMs: number;
}

interface NsfwTfliteNative {
  initModel(): Promise<boolean>;
  isModelLoaded(): Promise<boolean>;
  classifyImage(imagePath: string): Promise<NsfwTfliteScores>;
}

const LINKING_ERROR =
  "NsfwTflite native module is not linked. Rebuild the Android app after adding the module.";

const Native = NativeModules.NsfwTflite as NsfwTfliteNative | undefined;

function getModule(): NsfwTfliteNative {
  if (Platform.OS !== 'android' || Native == null) {
    throw new Error(LINKING_ERROR);
  }
  return Native;
}

export async function initNsfwModel(): Promise<void> {
  await getModule().initModel();
}

export async function isNsfwModelLoaded(): Promise<boolean> {
  if (Platform.OS !== 'android' || Native == null) {
    return false;
  }
  return Native.isModelLoaded();
}

export async function classifyNsfwNative(imagePath: string): Promise<NsfwTfliteScores> {
  const raw = await getModule().classifyImage(imagePath);
  return {
    sfwScore: Number(raw.sfwScore),
    nsfwScore: Number(raw.nsfwScore),
    elapsedMs: Number(raw.elapsedMs ?? 0),
  };
}
