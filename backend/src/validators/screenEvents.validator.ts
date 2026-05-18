import Joi from 'joi';

export const createScreenEventSchema = Joi.object({
  timestamp: Joi.date().iso().required(),
  appPackage: Joi.string().max(255).required(),
  appLabel: Joi.string().max(255).optional().allow(null, ''),
  extractedTextPreview: Joi.string().max(500).allow('').default(''),
  riskFlag: Joi.boolean().required(),
  riskScore: Joi.number().min(0).max(100).optional().allow(null),
  imageRiskScore: Joi.number().integer().min(0).max(100).optional().allow(null),
  combinedRiskScore: Joi.number().integer().min(0).max(100).optional().allow(null),
  imageClassificationDetails: Joi.object().optional().allow(null),
  category: Joi.string()
    .valid(
      'violent',
      'toxic',
      'dangerous',
      'educational',
      'neutral',
      'adult',
      'gore',
      'dangerous_challenge',
    )
    .optional()
    .allow(null),
});

export const listScreenEventsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(10),
});
