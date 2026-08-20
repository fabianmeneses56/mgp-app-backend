import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WeightHistoryService } from './weight-history.service';
import { WeightHistory } from './entities/weight-history.entity';
import { Exercise } from 'src/exercises/entities/exercise.entity';
import { ExerciseWeightRepository } from 'src/exercises/exercise-weight.repository';
import { WeightUnit } from 'src/exercises/enums/weight-unit.enum';
import { User } from 'src/auth/entities/user.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ActivityAction,
  ActivityType,
} from 'src/activity/entities/activity-log.entity';
import {
  ACTIVITY_RECORDED,
  ActivityRecordedEvent,
} from 'src/activity/events/activity-recorded.event';

describe('WeightHistoryService', () => {
  let service: WeightHistoryService;

  const weightHistoryRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const exerciseRepository = {
    findOne: jest.fn(),
  };

  const exerciseWeightRepository = {
    appendEntry: jest.fn(),
    updateEntry: jest.fn(),
    removeEntry: jest.fn(),
  };

  const eventEmitter = {
    emit: jest.fn(),
  };

  const user = { id: 'f4b1a2c3-1111-4a11-8b11-abcdef123456' } as User;
  const exerciseId = 'e4b1a2c3-2222-4a11-8b11-abcdef123456';
  const ownedExercise = { id: exerciseId, name: 'Bench Press' } as Exercise;

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
        {
          provide: ExerciseWeightRepository,
          useValue: exerciseWeightRepository,
        },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(WeightHistoryService);
  });

  describe('create', () => {
    it('converts weight to grams, defaults an absent note to null and delegates to exerciseWeightRepository.appendEntry', async () => {
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      exerciseWeightRepository.appendEntry.mockImplementation(
        (_exerciseId: string, data: Partial<WeightHistory>) =>
          Promise.resolve({ id: 'entry-id', ...data }),
      );

      const dto = {
        weight: 2.5,
        weightUnit: WeightUnit.KILOGRAM,
        date: '2026-01-01',
      };

      const result = await service.create(exerciseId, dto as any, user);

      expect(exerciseWeightRepository.appendEntry).toHaveBeenCalledWith(
        exerciseId,
        {
          weightGrams: 2500,
          weightUnit: WeightUnit.KILOGRAM,
          note: null,
          date: expect.any(Date) as Date,
          exercise: ownedExercise,
        },
      );
      expect(result.note).toBeNull();
    });

    it('emits ACTIVITY_RECORDED with type WEIGHT_HISTORY and action CREATED after appendEntry resolves', async () => {
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      exerciseWeightRepository.appendEntry.mockImplementation(
        (_exerciseId: string, data: Partial<WeightHistory>) =>
          Promise.resolve({ id: 'entry-id', ...data }),
      );

      const dto = {
        weight: 2.5,
        weightUnit: WeightUnit.KILOGRAM,
        date: '2026-01-01',
      };

      const result = await service.create(exerciseId, dto as any, user);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ACTIVITY_RECORDED,
        new ActivityRecordedEvent(
          user.id,
          ActivityType.WEIGHT_HISTORY,
          ActivityAction.CREATED,
          result.id,
          ownedExercise.name,
          result.weightGrams,
          result.weightUnit,
        ),
      );
    });

    it('throws NotFoundException when exerciseId is not a UUID', async () => {
      await expect(
        service.create('not-a-uuid', {} as any, user),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(exerciseRepository.findOne).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the exercise does not exist or belongs to another user', async () => {
      exerciseRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create(exerciseId, {} as any, user),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
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

    beforeEach(() => {
      exerciseWeightRepository.updateEntry.mockImplementation(
        (entry: WeightHistory) => Promise.resolve(entry),
      );
    });

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
      weightHistoryRepository.findOne.mockResolvedValue(entry);

      const result = await service.update(
        exerciseId,
        entryId,
        { weight: 3 } as any,
        user,
      );

      expect(result.weightGrams).toBe(3000);
      expect(result.weightUnit).toBe(WeightUnit.KILOGRAM);
      expect(exerciseWeightRepository.updateEntry).toHaveBeenCalledWith(
        entry,
        exerciseId,
      );
    });

    it('emits ACTIVITY_RECORDED with type WEIGHT_HISTORY and action UPDATED with the exercise name and final weight', async () => {
      const entry = {
        id: entryId,
        weightGrams: 1000,
        weightUnit: WeightUnit.KILOGRAM,
        note: null,
        date: new Date('2020-01-01'),
        exercise: { id: exerciseId },
      };
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      weightHistoryRepository.findOne.mockResolvedValue(entry);

      const result = await service.update(
        exerciseId,
        entryId,
        { weight: 3 } as any,
        user,
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ACTIVITY_RECORDED,
        new ActivityRecordedEvent(
          user.id,
          ActivityType.WEIGHT_HISTORY,
          ActivityAction.UPDATED,
          result.id,
          ownedExercise.name,
          result.weightGrams,
          result.weightUnit,
        ),
      );
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
      weightHistoryRepository.findOne.mockResolvedValue(entry);

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
      weightHistoryRepository.findOne.mockResolvedValue(entry);

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
      weightHistoryRepository.findOne.mockResolvedValue(entry);

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
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(exerciseWeightRepository.updateEntry).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const entryId = 'aaaaaaaa-3333-4a11-8b11-abcdef123456';

    it('removes the entry via exerciseWeightRepository.removeEntry', async () => {
      const entry = {
        id: entryId,
        weightGrams: 1000,
        weightUnit: WeightUnit.KILOGRAM,
        exercise: { id: exerciseId },
      };
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      weightHistoryRepository.findOne.mockResolvedValue(entry);

      const result = await service.remove(exerciseId, entryId, user);

      expect(exerciseWeightRepository.removeEntry).toHaveBeenCalledWith(
        entry,
        exerciseId,
      );
      expect(result).toBe(entry);
    });

    it('throws NotFoundException when entryId does not belong to the exercise', async () => {
      exerciseRepository.findOne.mockResolvedValue(ownedExercise);
      weightHistoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.remove(exerciseId, entryId, user),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(exerciseWeightRepository.removeEntry).not.toHaveBeenCalled();
    });
  });
});
