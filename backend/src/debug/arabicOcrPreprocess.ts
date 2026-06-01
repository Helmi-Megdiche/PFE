import Jimp from 'jimp';

/** Target width for Arabic OCR — higher than Latin (800) for connected script. */
const ARABIC_OCR_TARGET_WIDTH = 1600;

/**
 * Preprocess screenshot/quote images for Arabic Tesseract.
 * Lighter than Latin preprocessForOcr: upscale small images, mild contrast, no heavy normalize.
 */
export async function preprocessForArabicOcr(buffer: Buffer): Promise<Buffer> {
  const image = await Jimp.read(buffer);
  const w = image.bitmap.width;

  if (w < ARABIC_OCR_TARGET_WIDTH) {
    image.resize(ARABIC_OCR_TARGET_WIDTH, Jimp.AUTO);
  } else if (w > ARABIC_OCR_TARGET_WIDTH * 2) {
    image.resize(ARABIC_OCR_TARGET_WIDTH * 2, Jimp.AUTO);
  }

  image.greyscale();
  image.contrast(0.15);
  image.normalize();

  return image.getBufferAsync(Jimp.MIME_PNG);
}
