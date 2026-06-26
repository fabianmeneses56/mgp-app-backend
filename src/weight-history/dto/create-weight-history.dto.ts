import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { WeightUnit } from 'src/exercises/enums/weight-unit.enum';

export class CreateWeightHistoryDto {
  @IsNumber()
  @Min(0.001)
  weight!: number;

  @IsEnum(WeightUnit)
  weightUnit!: WeightUnit;

  @IsOptional()
  @IsString()
  note?: string;

  @IsISO8601()
  date!: string;
}
