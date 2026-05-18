import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';
import * as mobilenet from '@tensorflow-models/mobilenet';
import Jimp from 'jimp';
import { mapMlKitLabelsToRisk, type MlKitLabel } from '../utils/riskMapping';
import { logger } from '../utils/logger';

let model: mobilenet.MobileNet | null = null;
let modelLoadPromise: Promise<mobilenet.MobileNet> | null = null;
let backendReady: Promise<void> | null = null;

async function ensureBackend(): Promise<void> {
  if (!backendReady) {
    backendReady = tf.setBackend('cpu').then(() => tf.ready()).then(() => undefined);
  }
  return backendReady;
}

async function loadModel(): Promise<mobilenet.MobileNet> {
  await ensureBackend();
  if (model) return model;
  if (!modelLoadPromise) {
    modelLoadPromise = mobilenet.load({ version: 2, alpha: 0.5 }).then((m) => {
      model = m;
      logger.info('MobileNet model loaded for debug classification');
      return m;
    });
  }
  return modelLoadPromise;
}

async function bufferToTensor(buffer: Buffer): Promise<tf.Tensor3D> {
  const image = await Jimp.read(buffer);
  const { width, height } = image.bitmap;
  const rgb = new Float32Array(width * height * 3);
  let offset = 0;
  image.scan(0, 0, width, height, (_x, _y, idx) => {
    rgb[offset++] = image.bitmap.data[idx] / 255;
    rgb[offset++] = image.bitmap.data[idx + 1] / 255;
    rgb[offset++] = image.bitmap.data[idx + 2] / 255;
  });
  return tf.tensor3d(rgb, [height, width, 3]);
}

export async function classifyImageBuffer(
  buffer: Buffer,
): Promise<{
  labels: MlKitLabel[];
  category: string;
  riskScore: number;
  topRiskLabels: string[];
  categoryWeights: Record<string, number>;
}> {
  const net = await loadModel();
  const tensor = await bufferToTensor(buffer);

  try {
    const predictions = await net.classify(tensor);

    const labels: MlKitLabel[] = predictions.slice(0, 10).map((p) => ({
      label: p.className,
      confidence: p.probability,
    }));

    const mapped = mapMlKitLabelsToRisk(labels);

    const topRiskLabels = Object.entries(mapped.categoryWeights)
      .filter(([, w]) => w > 0.1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);

    return {
      labels,
      category: mapped.category,
      riskScore: mapped.riskScore,
      topRiskLabels,
      categoryWeights: mapped.categoryWeights,
    };
  } finally {
    tensor.dispose();
  }
}
