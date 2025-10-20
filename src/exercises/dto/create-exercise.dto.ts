import {
  IsEnum,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { Category } from 'src/categories/entities/category.entity';

export enum WeightUnit {
  GRAM = 'g',
  KILOGRAM = 'kg',
  POUND = 'lb',
}
export class CreateExerciseDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  weight: number;

  @IsEnum(WeightUnit)
  weightUnit: WeightUnit;

  @IsUUID()
  category: Category;
}
