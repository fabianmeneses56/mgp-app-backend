import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { WeightUnit } from '../enums/weight-unit.enum';

export class FindExercisesDto {
  @IsOptional()
  name?: string;

  @IsOptional()
  @IsUUID()
  category?: string;

  @IsOptional()
  @IsEnum(WeightUnit)
  weightUnit?: WeightUnit;

  @IsOptional()
  @IsIn(['name', 'weightGrams'])
  sortField?: 'name' | 'weightGrams';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  limit?: number;
}
