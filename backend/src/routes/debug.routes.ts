import { Router, Request, Response } from 'express';
import multer from 'multer';
import { analyzeArabicOcr } from '../debug/arabicOcr';
import { classifyImageBuffer } from '../debug/classifyImage';
import { logger } from '../utils/logger';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

/**
 * POST /api/debug/classify
 * Dev-only: nsfwjs vision + Tesseract OCR + combined risk (same weights as mobile).
 */
router.post(
  '/classify',
  upload.single('image'),
  async (req: Request, res: Response) => {
    try {
      let buffer: Buffer | null = null;

      if (req.file?.buffer) {
        buffer = req.file.buffer;
      } else if (req.body?.imageBase64) {
        const raw = String(req.body.imageBase64);
        const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
        buffer = Buffer.from(base64, 'base64');
      }

      if (!buffer || buffer.length === 0) {
        res.status(400).json({
          error: 'No image provided. Use multipart field "image" or JSON { imageBase64 }.',
        });
        return;
      }

      const result = await classifyImageBuffer(buffer);

      logger.info('Debug classify', {
        finalCategory: result.finalCategory,
        combinedRiskScore: result.combinedRiskScore,
        visionRisk: result.vision.riskScore,
        ocrRisk: result.ocr.riskScore,
      });

      res.json(result);
    } catch (err) {
      logger.error('Debug classify failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({
        error: 'Classification failed',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

/**
 * POST /api/debug/arabic-ocr
 * Dev-only: Tesseract Arabic script OCR + multilingual keyword filter.
 */
router.post(
  '/arabic-ocr',
  upload.single('image'),
  async (req: Request, res: Response) => {
    try {
      let buffer: Buffer | null = null;

      if (req.file?.buffer) {
        buffer = req.file.buffer;
      } else if (req.body?.imageBase64) {
        const raw = String(req.body.imageBase64);
        const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
        buffer = Buffer.from(base64, 'base64');
      }

      if (!buffer || buffer.length === 0) {
        res.status(400).json({
          error: 'No image provided. Use multipart field "image" or JSON { imageBase64 }.',
        });
        return;
      }

      const result = await analyzeArabicOcr(buffer);

      logger.info('Debug Arabic OCR', {
        category: result.category,
        riskScore: result.riskScore,
        confidence: result.confidence,
        textChars: result.text.length,
      });

      res.json(result);
    } catch (err) {
      logger.error('Debug Arabic OCR failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({
        error: 'Arabic OCR failed',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

export default router;
