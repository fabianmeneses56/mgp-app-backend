import { convertWeightToGrams } from './convert-weight';
import { WeightUnit } from '../enums/weight-unit.enum';

describe('convertWeightToGrams', () => {
  it('rounds grams', () => {
    expect(convertWeightToGrams(1500.4, WeightUnit.GRAM)).toBe(1500);
  });

  it('converts kilograms to grams', () => {
    expect(convertWeightToGrams(2.5, WeightUnit.KILOGRAM)).toBe(2500);
  });

  it('converts pounds to grams', () => {
    expect(convertWeightToGrams(1, WeightUnit.POUND)).toBe(454);
    expect(convertWeightToGrams(10, WeightUnit.POUND)).toBe(4536);
  });

  it('rounds using the default case for an unknown unit', () => {
    expect(convertWeightToGrams(1500.4, 'oz' as WeightUnit)).toBe(1500);
  });
});
