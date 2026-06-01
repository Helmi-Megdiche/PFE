import Joi from 'joi';

export const bonusPointsSchema = Joi.object({
  points: Joi.number().integer().min(1).max(10000).required(),
  reason: Joi.string().max(500).optional().allow('', null),
});
