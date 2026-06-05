import { updateChildProfileSchema } from '../src/validators/child.validator';

const currentYear = new Date().getFullYear();

describe('updateChildProfileSchema', () => {
  const childId = '33333333-3333-3333-3333-333333333333';

  it('accepts a valid birth year', () => {
    const { error } = updateChildProfileSchema.validate({
      childId,
      birthYear: 2014,
    });
    expect(error).toBeUndefined();
  });

  it('rejects birth year before 2000', () => {
    const { error } = updateChildProfileSchema.validate({
      childId,
      birthYear: 1999,
    });
    expect(error).toBeDefined();
  });

  it('rejects future birth year', () => {
    const { error } = updateChildProfileSchema.validate({
      childId,
      birthYear: currentYear + 1,
    });
    expect(error).toBeDefined();
  });

  it('requires childId uuid', () => {
    const { error } = updateChildProfileSchema.validate({
      childId: 'not-a-uuid',
      birthYear: 2014,
    });
    expect(error).toBeDefined();
  });
});
