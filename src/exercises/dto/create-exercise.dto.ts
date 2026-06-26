import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';
import { WeightUnit } from '../enums/weight-unit.enum';

export class CreateExerciseDto {
  @IsString()
  @MinLength(1)
  name: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  weight: number;

  @IsEnum(WeightUnit)
  weightUnit: WeightUnit;

  @IsUUID()
  category: string;
}
