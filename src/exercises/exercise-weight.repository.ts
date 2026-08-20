import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Category } from 'src/categories/entities/category.entity';
import { Exercise } from './entities/exercise.entity';
import { WeightHistory } from 'src/weight-history/entities/weight-history.entity';
import { WeightUnit } from './enums/weight-unit.enum';

interface CreateExerciseData {
  name: string;
  weightGrams: number;
  weightUnit: WeightUnit;
  imageUrl: string | null;
  category: Category;
}

interface WeightEntryData {
  weightGrams: number;
  weightUnit: WeightUnit;
  note: string | null;
  date: Date;
  exercise: Exercise;
}

/**
 * Único punto que escribe `Exercise` y `WeightHistory` juntos. Mantiene el
 * invariante "Exercise.weightGrams/weightUnit refleja la última entrada de
 * WeightHistory por fecha" en un solo lugar, dentro de la misma transacción
 * que la escritura del historial, en vez de repartirlo entre una transacción
 * de QueryRunner y un listener de eventos.
 */
@Injectable()
export class ExerciseWeightRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async createExercise(data: CreateExerciseData): Promise<Exercise> {
    return this.runInTransaction(async (manager) => {
      const exercise = manager.create(Exercise, data);
      await manager.save(exercise);

      const entry = manager.create(WeightHistory, {
        weightGrams: data.weightGrams,
        weightUnit: data.weightUnit,
        note: null,
        date: new Date(),
        exercise,
      });
      await manager.save(entry);

      return exercise;
    });
  }

  async updateExercise(
    exercise: Exercise,
    recordWeightEntry: boolean,
  ): Promise<Exercise> {
    return this.runInTransaction(async (manager) => {
      await manager.save(exercise);

      if (recordWeightEntry) {
        const entry = manager.create(WeightHistory, {
          weightGrams: exercise.weightGrams,
          weightUnit: exercise.weightUnit,
          note: null,
          date: new Date(),
          exercise,
        });
        await manager.save(entry);
        await this.syncLatestWeight(manager, exercise.id);
      }

      return exercise;
    });
  }

  async appendEntry(
    exerciseId: string,
    entryData: WeightEntryData,
  ): Promise<WeightHistory> {
    return this.runInTransaction(async (manager) => {
      const entry = manager.create(WeightHistory, entryData);
      await manager.save(entry);
      await this.syncLatestWeight(manager, exerciseId);
      return entry;
    });
  }

  async updateEntry(
    entry: WeightHistory,
    exerciseId: string,
  ): Promise<WeightHistory> {
    return this.runInTransaction(async (manager) => {
      await manager.save(entry);
      await this.syncLatestWeight(manager, exerciseId);
      return entry;
    });
  }

  async removeEntry(
    entry: WeightHistory,
    exerciseId: string,
  ): Promise<WeightHistory> {
    return this.runInTransaction(async (manager) => {
      await manager.remove(entry);
      await this.syncLatestWeight(manager, exerciseId);
      return entry;
    });
  }

  private async syncLatestWeight(
    manager: EntityManager,
    exerciseId: string,
  ): Promise<void> {
    const latest = await manager.getRepository(WeightHistory).findOne({
      where: { exercise: { id: exerciseId } },
      order: { date: 'DESC' },
    });

    if (!latest) return;

    await manager.getRepository(Exercise).update(exerciseId, {
      weightGrams: latest.weightGrams,
      weightUnit: latest.weightUnit,
    });
  }

  private async runInTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();
      const result = await work(queryRunner.manager);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
