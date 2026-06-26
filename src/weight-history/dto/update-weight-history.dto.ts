import { PartialType } from '@nestjs/mapped-types';
import { CreateWeightHistoryDto } from './create-weight-history.dto';

export class UpdateWeightHistoryDto extends PartialType(CreateWeightHistoryDto) {}
