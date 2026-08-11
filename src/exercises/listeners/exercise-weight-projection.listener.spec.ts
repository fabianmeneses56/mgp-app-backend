import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Exercise } from '../entities/exercise.entity';
import { WeightUnit } from '../enums/weight-unit.enum';
import { ExerciseWeightProjectionListener } from './exercise-weight-projection.listener';
import { WeightHistoryLatestChangedEvent } from 'src/weight-history/events/weight-history-latest-changed.event';

describe('ExerciseWeightProjectionListener', () => {
  let listener: ExerciseWeightProjectionListener;

  const exerciseRepository = {
    update: jest.fn(),
  };

  const exerciseId = 'e4b1a2c3-2222-4a11-8b11-abcdef123456';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExerciseWeightProjectionListener,
        { provide: getRepositoryToken(Exercise), useValue: exerciseRepository },
      ],
    }).compile();

    listener = module.get(ExerciseWeightProjectionListener);
  });

  it('projects the latest weight onto the exercise row', async () => {
    await listener.handleLatestChanged(
      new WeightHistoryLatestChangedEvent(
        exerciseId,
        2500,
        WeightUnit.KILOGRAM,
      ),
    );

    expect(exerciseRepository.update).toHaveBeenCalledWith(exerciseId, {
      weightGrams: 2500,
      weightUnit: WeightUnit.KILOGRAM,
    });
  });

  it('propagates a write failure instead of swallowing it, so the request fails', async () => {
    exerciseRepository.update.mockRejectedValue(new Error('db down'));

    await expect(
      listener.handleLatestChanged(
        new WeightHistoryLatestChangedEvent(
          exerciseId,
          2500,
          WeightUnit.KILOGRAM,
        ),
      ),
    ).rejects.toThrow('db down');
  });
});
