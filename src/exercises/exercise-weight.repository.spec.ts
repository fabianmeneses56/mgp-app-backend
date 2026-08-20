import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ExerciseWeightRepository } from './exercise-weight.repository';
import { Exercise } from './entities/exercise.entity';
import { WeightHistory } from 'src/weight-history/entities/weight-history.entity';
import { WeightUnit } from './enums/weight-unit.enum';
import { Category } from 'src/categories/entities/category.entity';

describe('ExerciseWeightRepository', () => {
  let repository: ExerciseWeightRepository;

  const exerciseRepositoryInTx = {
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const historyRepositoryInTx = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const manager = {
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    getRepository: jest.fn((entity: unknown) =>
      entity === Exercise ? exerciseRepositoryInTx : historyRepositoryInTx,
    ),
  };

  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: false,
    manager,
  };

  const dataSource = {
    createQueryRunner: jest.fn(() => queryRunner),
  };

  const category = { id: 'cat-id' } as Category;
  const exerciseId = 'e4b1a2c3-2222-4a11-8b11-abcdef123456';

  beforeEach(async () => {
    jest.clearAllMocks();
    queryRunner.isTransactionActive = false;
    queryRunner.startTransaction.mockImplementation(() => {
      queryRunner.isTransactionActive = true;
    });
    manager.create.mockImplementation(
      (_entity: unknown, data: Record<string, unknown>) => ({ ...data }),
    );
    manager.save.mockImplementation((entity: unknown) =>
      Promise.resolve(entity),
    );
    manager.remove.mockResolvedValue(undefined);
    historyRepositoryInTx.findOne.mockResolvedValue(null);
    exerciseRepositoryInTx.update.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExerciseWeightRepository,
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    repository = module.get(ExerciseWeightRepository);
  });

  describe('createExercise', () => {
    const data = {
      name: 'Bench Press',
      weightGrams: 60000,
      weightUnit: WeightUnit.KILOGRAM,
      imageUrl: null,
      category,
    };

    it('creates the exercise and its initial WeightHistory entry in one transaction', async () => {
      const result = await repository.createExercise(data);

      expect(manager.create).toHaveBeenCalledWith(Exercise, data);
      expect(manager.create).toHaveBeenCalledWith(WeightHistory, {
        weightGrams: 60000,
        weightUnit: WeightUnit.KILOGRAM,
        note: null,
        date: expect.any(Date) as Date,
        exercise: result,
      });
      expect(manager.save).toHaveBeenCalledTimes(2);
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('rolls back, releases and rethrows when a save fails', async () => {
      manager.save.mockRejectedValueOnce(new Error('db down'));

      await expect(repository.createExercise(data)).rejects.toThrow('db down');
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });
  });

  describe('updateExercise', () => {
    const exercise = {
      id: exerciseId,
      name: 'Bench Press',
      weightGrams: 65000,
      weightUnit: WeightUnit.KILOGRAM,
      imageUrl: null,
      category,
    } as Exercise;

    it('saves the exercise without touching WeightHistory when recordWeightEntry is false', async () => {
      await repository.updateExercise(exercise, false);

      expect(manager.save).toHaveBeenCalledWith(exercise);
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(historyRepositoryInTx.findOne).not.toHaveBeenCalled();
    });

    it('records a new entry and resyncs weight from the true latest-by-date entry when recordWeightEntry is true', async () => {
      historyRepositoryInTx.findOne.mockResolvedValue({
        weightGrams: 70000,
        weightUnit: WeightUnit.KILOGRAM,
      });

      await repository.updateExercise(exercise, true);

      expect(manager.create).toHaveBeenCalledWith(
        WeightHistory,
        expect.objectContaining({ weightGrams: 65000 }),
      );
      expect(historyRepositoryInTx.findOne).toHaveBeenCalledWith({
        where: { exercise: { id: exerciseId } },
        order: { date: 'DESC' },
      });
      expect(exerciseRepositoryInTx.update).toHaveBeenCalledWith(exerciseId, {
        weightGrams: 70000,
        weightUnit: WeightUnit.KILOGRAM,
      });
    });
  });

  describe('appendEntry', () => {
    const entryData = {
      weightGrams: 2500,
      weightUnit: WeightUnit.KILOGRAM,
      note: null,
      date: new Date('2026-01-01'),
      exercise: { id: exerciseId } as Exercise,
    };

    it('saves the entry and syncs the exercise to the latest-by-date entry', async () => {
      historyRepositoryInTx.findOne.mockResolvedValue({
        weightGrams: 2500,
        weightUnit: WeightUnit.KILOGRAM,
      });

      await repository.appendEntry(exerciseId, entryData);

      expect(manager.create).toHaveBeenCalledWith(WeightHistory, entryData);
      expect(exerciseRepositoryInTx.update).toHaveBeenCalledWith(exerciseId, {
        weightGrams: 2500,
        weightUnit: WeightUnit.KILOGRAM,
      });
    });

    it('leaves the exercise untouched when no entry remains (documented edge case)', async () => {
      historyRepositoryInTx.findOne.mockResolvedValue(null);

      await repository.appendEntry(exerciseId, entryData);

      expect(exerciseRepositoryInTx.update).not.toHaveBeenCalled();
    });

    it('rolls back and rethrows when the save fails', async () => {
      manager.save.mockRejectedValueOnce(new Error('db down'));

      await expect(
        repository.appendEntry(exerciseId, entryData),
      ).rejects.toThrow('db down');
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(exerciseRepositoryInTx.update).not.toHaveBeenCalled();
    });
  });

  describe('updateEntry', () => {
    const entry = {
      id: 'entry-id',
      weightGrams: 3000,
      weightUnit: WeightUnit.KILOGRAM,
    } as WeightHistory;

    it('saves the mutated entry and resyncs the exercise', async () => {
      historyRepositoryInTx.findOne.mockResolvedValue({
        weightGrams: 3000,
        weightUnit: WeightUnit.KILOGRAM,
      });

      await repository.updateEntry(entry, exerciseId);

      expect(manager.save).toHaveBeenCalledWith(entry);
      expect(exerciseRepositoryInTx.update).toHaveBeenCalledWith(exerciseId, {
        weightGrams: 3000,
        weightUnit: WeightUnit.KILOGRAM,
      });
    });
  });

  describe('removeEntry', () => {
    const entry = {
      id: 'entry-id',
      weightGrams: 1000,
      weightUnit: WeightUnit.GRAM,
    } as WeightHistory;

    it('removes the entry and resyncs the exercise to whatever entry remains', async () => {
      historyRepositoryInTx.findOne.mockResolvedValue({
        weightGrams: 500,
        weightUnit: WeightUnit.GRAM,
      });

      await repository.removeEntry(entry, exerciseId);

      expect(manager.remove).toHaveBeenCalledWith(entry);
      expect(exerciseRepositoryInTx.update).toHaveBeenCalledWith(exerciseId, {
        weightGrams: 500,
        weightUnit: WeightUnit.GRAM,
      });
    });

    it('known behavior: leaves the exercise with its stale weight when the last entry is removed', async () => {
      historyRepositoryInTx.findOne.mockResolvedValue(null);

      await repository.removeEntry(entry, exerciseId);

      expect(manager.remove).toHaveBeenCalledWith(entry);
      expect(exerciseRepositoryInTx.update).not.toHaveBeenCalled();
    });
  });
});
