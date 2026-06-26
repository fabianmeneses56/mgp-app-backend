import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/auth/entities/user.entity';
import { CreateWeightHistoryDto } from './dto/create-weight-history.dto';
import { UpdateWeightHistoryDto } from './dto/update-weight-history.dto';
import { WeightHistoryService } from './weight-history.service';

@Controller('exercises/:exerciseId/weight-history')
export class WeightHistoryController {
  constructor(private readonly weightHistoryService: WeightHistoryService) {}

  @Post()
  @Auth()
  create(
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @Body() dto: CreateWeightHistoryDto,
    @GetUser() user: User,
  ) {
    return this.weightHistoryService.create(exerciseId, dto, user);
  }

  @Get()
  @Auth()
  findAll(
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @GetUser() user: User,
  ) {
    return this.weightHistoryService.findAll(exerciseId, user);
  }

  @Patch(':entryId')
  @Auth()
  update(
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: UpdateWeightHistoryDto,
    @GetUser() user: User,
  ) {
    return this.weightHistoryService.update(exerciseId, entryId, dto, user);
  }

  @Delete(':entryId')
  @Auth()
  remove(
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @GetUser() user: User,
  ) {
    return this.weightHistoryService.remove(exerciseId, entryId, user);
  }
}
