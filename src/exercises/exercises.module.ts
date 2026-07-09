import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExercisesService } from './exercises.service';
import { ExercisesController } from './exercises.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exercise } from './entities/exercise.entity';
import { Category } from 'src/categories/entities/category.entity';
import { WeightHistory } from 'src/weight-history/entities/weight-history.entity';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [ExercisesController],
  providers: [ExercisesService],
  imports: [
    TypeOrmModule.forFeature([Exercise, Category, WeightHistory]),
    AuthModule,
    ConfigModule,
  ],
})
export class ExercisesModule {}
