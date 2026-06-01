import Joi from 'joi';

export const customMissionSchema = Joi.object({
  title: Joi.string().min(3).max(255).required(),
  description: Joi.string().min(3).max(1000).required(),
  points: Joi.number().integer().min(5).max(500).required(),
});
