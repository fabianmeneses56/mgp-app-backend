import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExercisesService } from './exercises.service';
import { ExercisesController } from './exercises.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exercise } from './entities/exercise.entity';
import { WeightHistory } from 'src/weight-history/entities/weight-history.entity';
import { AuthModule } from 'src/auth/auth.module';
import { CategoriesModule } from 'src/categories/categories.module';

@Module({
  controllers: [ExercisesController],
  providers: [ExercisesService],
  imports: [
    TypeOrmModule.forFeature([Exercise, WeightHistory]),
    AuthModule,
    ConfigModule,
    CategoriesModule,
  ],
})
export class ExercisesModule {}
