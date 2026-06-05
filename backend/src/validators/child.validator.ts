import Joi from 'joi';

export const ALLOWED_INTERESTS = [
  'sports',
  'art',
  'reading',
  'family',
  'brain',
] as const;

export const updateChildInterestsSchema = Joi.object({
  childId: Joi.string().uuid().required(),
  interests: Joi.array()
    .items(Joi.string().valid(...ALLOWED_INTERESTS))
    .max(10)
    .unique()
    .required(),
});
