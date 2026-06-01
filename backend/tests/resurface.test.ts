import { computeResurfacedPoints } from '../src/services/missionHelpers';

describe('computeResurfacedPoints', () => {
  it('adds 5 points per resurface', () => {
    expect(computeResurfacedPoints(20, 20)).toBe(25);
    expect(computeResurfacedPoints(25, 20)).toBe(30);
  });

  it('caps the bonus at +50% of the base value', () => {
    // base 20 → cap is 30; further resurfaces stay at 30.
    expect(computeResurfacedPoints(30, 20)).toBe(30);
    expect(computeResurfacedPoints(28, 20)).toBe(30);
  });

  it('rounds the cap up for odd base points', () => {
    // base 15 → cap ceil(22.5) = 23
    expect(computeResurfacedPoints(20, 15)).toBe(23);
  });
});
