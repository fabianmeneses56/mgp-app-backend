import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WeightHistoryService } from './weight-history.service';
import { WeightHistory } from './entities/weight-history.entity';
import { Exercise } from 'src/exercises/entities/exercise.entity';
import { WeightUnit } from 'src/exercises/enums/weight-unit.enum';
import { User } from 'src/auth/entities/user.entity';

describe('WeightHistoryService', () => {
  let service: WeightHistoryService;

  const weightHistoryRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const exerciseRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const user = { id: 'f4b1a2c3-1111-4a11-8b11-abcdef123456' } as User;
  const exerciseId = 'e4b1a2c3-2222-4a11-8b11-abcdef123456';
  const ownedExercise = { id: exerciseId } as Exercise;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeightHistoryService,
        {
          provide: getRepositoryToken(WeightHistory),
          useValue: weightHistoryRepository,
        },
        {
          provide: getRepositoryToken(Exercise),
          useValue: exerciseRepository,
        },
      ],
    }).compile();

    service = module.get(WeightHistoryService);
  });

  describe('create', () => {
    it('converts weight to grams, defaults an absent note to null and syncs the exercise weight', async () => {
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      weightHistoryRepository.create.mockImplementation(
        (data: Partial<WeightHistory>) => ({ ...data }),
      );
      weightHistoryRepository.save.mockImplementation(
        (entry: Partial<WeightHistory>) => Promise.resolve(entry),
      );
      const latest = { weightGrams: 2500, weightUnit: WeightUnit.KILOGRAM };
      weightHistoryRepository.findOne.mockResolvedValue(latest);

      const dto = {
        weight: 2.5,
        weightUnit: WeightUnit.KILOGRAM,
        date: '2026-01-01',
      };

      const result = await service.create(exerciseId, dto as any, user);

      expect(weightHistoryRepository.create).toHaveBeenCalledWith({
        weightGrams: 2500,
        weightUnit: WeightUnit.KILOGRAM,
        note: null,
        date: expect.any(Date) as Date,
        exercise: ownedExercise,
      });
      expect(exerciseRepository.update).toHaveBeenCalledWith(exerciseId, {
        weightGrams: latest.weightGrams,
        weightUnit: latest.weightUnit,
      });
      expect(result.note).toBeNull();
    });

    it('throws NotFoundException when exerciseId is not a UUID', async () => {
      await expect(
        service.create('not-a-uuid', {} as any, user),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(exerciseRepository.findOne).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the exercise does not exist or belongs to another user', async () => {
      exerciseRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create(exerciseId, {} as any, user),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('validates ownership and queries with order: { date: "DESC" }', async () => {
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      weightHistoryRepository.find.mockResolvedValue([]);

      await service.findAll(exerciseId, user);

      expect(exerciseRepository.findOne).toHaveBeenCalledWith({
        where: { id: exerciseId, category: { user: { id: user.id } } },
        relations: { category: { user: true } },
      });
      expect(weightHistoryRepository.find).toHaveBeenCalledWith({
        where: { exercise: { id: exerciseId } },
        order: { date: 'DESC' },
      });
    });
  });

  describe('update', () => {
    const entryId = 'aaaaaaaa-3333-4a11-8b11-abcdef123456';

    it('uses the entry current weightUnit when only weight is provided', async () => {
      const entry = {
        id: entryId,
        weightGrams: 1000,
        weightUnit: WeightUnit.KILOGRAM,
        note: null,
        date: new Date('2020-01-01'),
        exercise: { id: exerciseId },
      };
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      weightHistoryRepository.findOne
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce(entry);
      weightHistoryRepository.save.mockImplementation((e) =>
        Promise.resolve(e),
      );

      const result = await service.update(
        exerciseId,
        entryId,
        { weight: 3 } as any,
        user,
      );

      expect(result.weightGrams).toBe(3000);
      expect(result.weightUnit).toBe(WeightUnit.KILOGRAM);
    });

    it('uses the new weightUnit when weight and weightUnit are both provided', async () => {
      const entry = {
        id: entryId,
        weightGrams: 1000,
        weightUnit: WeightUnit.KILOGRAM,
        note: null,
        date: new Date('2020-01-01'),
        exercise: { id: exerciseId },
      };
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      weightHistoryRepository.findOne
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce(entry);
      weightHistoryRepository.save.mockImplementation((e) =>
        Promise.resolve(e),
      );

      const result = await service.update(
        exerciseId,
        entryId,
        { weight: 2, weightUnit: WeightUnit.POUND } as any,
        user,
      );

      expect(result.weightGrams).toBe(907);
      expect(result.weightUnit).toBe(WeightUnit.POUND);
    });

    it('does not recalculate weightGrams when only note is provided', async () => {
      const entry = {
        id: entryId,
        weightGrams: 1000,
        weightUnit: WeightUnit.KILOGRAM,
        note: null,
        date: new Date('2020-01-01'),
        exercise: { id: exerciseId },
      };
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      weightHistoryRepository.findOne
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce(entry);
      weightHistoryRepository.save.mockImplementation((e) =>
        Promise.resolve(e),
      );

      const result = await service.update(
        exerciseId,
        entryId,
        { note: 'felt heavy' } as any,
        user,
      );

      expect(result.weightGrams).toBe(1000);
      expect(result.note).toBe('felt heavy');
    });

    it('does not recalculate weightGrams when only date is provided', async () => {
      const entry = {
        id: entryId,
        weightGrams: 1000,
        weightUnit: WeightUnit.KILOGRAM,
        note: null,
        date: new Date('2020-01-01'),
        exercise: { id: exerciseId },
      };
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      weightHistoryRepository.findOne
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce(entry);
      weightHistoryRepository.save.mockImplementation((e) =>
        Promise.resolve(e),
      );

      const result = await service.update(
        exerciseId,
        entryId,
        { date: '2026-02-02' } as any,
        user,
      );

      expect(result.weightGrams).toBe(1000);
      expect(result.date).toEqual(expect.any(Date));
    });

    it('throws NotFoundException when entryId does not belong to the exercise', async () => {
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      weightHistoryRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.update(exerciseId, entryId, { weight: 3 } as any, user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    const entryId = 'aaaaaaaa-3333-4a11-8b11-abcdef123456';

    it('removes the entry and syncs the exercise weight', async () => {
      const entry = {
        id: entryId,
        weightGrams: 1000,
        weightUnit: WeightUnit.KILOGRAM,
        exercise: { id: exerciseId },
      };
      const remaining = { weightGrams: 500, weightUnit: WeightUnit.GRAM };
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      weightHistoryRepository.findOne
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce(remaining);

      await service.remove(exerciseId, entryId, user);

      expect(weightHistoryRepository.remove).toHaveBeenCalledWith(entry);
      expect(exerciseRepository.update).toHaveBeenCalledWith(exerciseId, {
        weightGrams: remaining.weightGrams,
        weightUnit: remaining.weightUnit,
      });
    });

    it('known bug: does not call exerciseRepository.update when no entry remains after removing the last one', async () => {
      const entry = {
        id: entryId,
        weightGrams: 1000,
        weightUnit: WeightUnit.KILOGRAM,
        exercise: { id: exerciseId },
      };
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      weightHistoryRepository.findOne
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce(null);

      await service.remove(exerciseId, entryId, user);

      expect(weightHistoryRepository.remove).toHaveBeenCalledWith(entry);
      expect(exerciseRepository.update).not.toHaveBeenCalled();
    });
  });
});
