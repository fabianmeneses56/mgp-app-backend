import { WeightUnit } from '../enums/weight-unit.enum';

export function convertWeightToGrams(weight: number, unit: WeightUnit): number {
  switch (unit) {
    case WeightUnit.GRAM:
      return Math.round(weight);
    case WeightUnit.KILOGRAM:
      return Math.round(weight * 1000);
    case WeightUnit.POUND:
      return Math.round(weight * 453.592);
    default:
      return Math.round(weight);
  }
}
