import Joi from 'joi';

export const getScoreQuerySchema = Joi.object({
  date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const scoreTrendQuerySchema = Joi.object({
  days: Joi.number().integer().min(1).max(90).default(7),
});
