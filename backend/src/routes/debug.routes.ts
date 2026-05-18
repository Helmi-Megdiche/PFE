import { Router, Request, Response } from 'express';
import multer from 'multer';
import { classifyImageBuffer } from '../debug/classifyImage';
import { toApiCategory } from '../utils/riskMapping';
import { logger } from '../utils/logger';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

/**
 * POST /api/debug/classify
 * Dev-only image upload for vision mapping demo (TensorFlow.js MobileNet).
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
      const apiCategory = toApiCategory(result.category);

      logger.info('Debug classify', {
        category: apiCategory,
        riskScore: result.riskScore,
        labelCount: result.labels.length,
      });

      res.json({
        labels: result.labels,
        category: apiCategory,
        riskScore: result.riskScore,
        topRiskLabels: result.topRiskLabels,
        categoryWeights: result.categoryWeights,
        note: 'Server-side MobileNet demo — on-device uses ML Kit with the same riskMapping.ts rules.',
      });
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

export default router;
