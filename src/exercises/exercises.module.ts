import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExercisesService } from './exercises.service';
import { ExercisesController } from './exercises.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exercise } from './entities/exercise.entity';
import { AuthModule } from 'src/auth/auth.module';
import { CategoriesModule } from 'src/categories/categories.module';
import { ExerciseImageListener } from './listeners/exercise-image.listener';
import { ExerciseWeightRepository } from './exercise-weight.repository';

@Module({
  controllers: [ExercisesController],
  providers: [
    ExercisesService,
    ExerciseImageListener,
    ExerciseWeightRepository,
  ],
  imports: [
    TypeOrmModule.forFeature([Exercise]),
    AuthModule,
    ConfigModule,
    CategoriesModule,
  ],
  exports: [ExerciseWeightRepository],
})
export class ExercisesModule {}
