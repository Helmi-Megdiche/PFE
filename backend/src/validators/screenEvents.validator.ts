import Joi from 'joi';

export const createScreenEventSchema = Joi.object({
  timestamp: Joi.date().iso().required(),
  appPackage: Joi.string().max(255).required(),
  extractedTextPreview: Joi.string().max(500).allow('').default(''),
  riskFlag: Joi.boolean().required(),
  riskScore: Joi.number().min(0).max(100).optional().allow(null),
  category: Joi.string()
    .valid('violent', 'toxic', 'dangerous', 'educational', 'neutral')
    .optional()
    .allow(null),
});

export const listScreenEventsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(10),
});
