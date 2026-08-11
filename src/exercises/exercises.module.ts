import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExercisesService } from './exercises.service';
import { ExercisesController } from './exercises.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exercise } from './entities/exercise.entity';
import { WeightHistory } from 'src/weight-history/entities/weight-history.entity';
import { AuthModule } from 'src/auth/auth.module';
import { CategoriesModule } from 'src/categories/categories.module';
import { ExerciseImageListener } from './listeners/exercise-image.listener';
import { ExerciseWeightProjectionListener } from './listeners/exercise-weight-projection.listener';

@Module({
  controllers: [ExercisesController],
  providers: [
    ExercisesService,
    ExerciseImageListener,
    ExerciseWeightProjectionListener,
  ],
  imports: [
    TypeOrmModule.forFeature([Exercise, WeightHistory]),
    AuthModule,
    ConfigModule,
    CategoriesModule,
  ],
})
export class ExercisesModule {}
