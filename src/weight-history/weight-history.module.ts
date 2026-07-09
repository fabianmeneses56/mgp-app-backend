import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { Exercise } from 'src/exercises/entities/exercise.entity';
import { WeightHistory } from './entities/weight-history.entity';
import { WeightHistoryController } from './weight-history.controller';
import { WeightHistoryService } from './weight-history.service';

@Module({
  imports: [TypeOrmModule.forFeature([WeightHistory, Exercise]), AuthModule],
  controllers: [WeightHistoryController],
  providers: [WeightHistoryService],
})
export class WeightHistoryModule {}
