import Joi from 'joi';

export const suggestMissionSchema = Joi.object({
  category: Joi.string().max(50).required(),
  textSnippet: Joi.string().max(500).allow('').default(''),
});

export const completeMissionSchema = Joi.object({
  exerciseScore: Joi.number().min(0).max(100).optional(),
  reactionTimeMs: Joi.number().integer().min(0).optional(),
  moves: Joi.number().integer().min(1).optional(),
  answers: Joi.array().items(Joi.string().max(10)).optional(),
  won: Joi.boolean().optional(),
  completed: Joi.boolean().optional(),
  confirmed: Joi.boolean().optional(),
});

export const generateMissionDevSchema = Joi.object({
  childId: Joi.string().uuid().required(),
  triggerType: Joi.string()
    .valid('risky_content', 'low_wellbeing', 'high_addiction', 'cognitive_boost')
    .required(),
  score: Joi.number().min(0).max(100).required(),
  category: Joi.string().max(50).optional(),
});
