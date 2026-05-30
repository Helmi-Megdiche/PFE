import Joi from 'joi';

export const createRewardSchema = Joi.object({
  title: Joi.string().max(255).required(),
  description: Joi.string().max(2000).required(),
  pointsRequired: Joi.number().integer().min(1).max(100000).required(),
});

export const updateRewardSchema = Joi.object({
  title: Joi.string().max(255).optional(),
  description: Joi.string().max(2000).optional(),
  pointsRequired: Joi.number().integer().min(1).max(100000).optional(),
}).min(1);
