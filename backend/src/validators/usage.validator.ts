import Joi from 'joi';

const usageSessionSchema = Joi.object({
  startTime: Joi.date().iso().required(),
  endTime: Joi.date().iso().greater(Joi.ref('startTime')).required(),
  appPackage: Joi.string().max(255).required(),
  appCategory: Joi.string().max(50).default('unknown'),
});

export const postUsageSchema = Joi.object({
  sessions: Joi.array().items(usageSessionSchema).min(1).max(200).required(),
});

export const listUsageQuerySchema = Joi.object({
  date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
