import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WeightHistoryService } from './weight-history.service';
import { WeightHistory } from './entities/weight-history.entity';
import { Exercise } from 'src/exercises/entities/exercise.entity';
import { WeightUnit } from 'src/exercises/enums/weight-unit.enum';
import { User } from 'src/auth/entities/user.entity';
import { ExerciseWeightProjectionListener } from 'src/exercises/listeners/exercise-weight-projection.listener';

/**
 * Los specs unitarios mockean el emisor y el listener por separado, así que
 * ninguno cubre el cableado real. Esto monta el EventEmitterModule de verdad
 * para comprobar que el evento llega al listener y que su fallo no se traga.
 */
describe('WeightHistory → Exercise weight projection (wiring)', () => {
  let service: WeightHistoryService;
  let module: TestingModule;

  const weightHistoryRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const exerciseRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const user = { id: 'f4b1a2c3-1111-4a11-8b11-abcdef123456' } as User;
  const exerciseId = 'e4b1a2c3-2222-4a11-8b11-abcdef123456';

  beforeEach(async () => {
    jest.clearAllMocks();

    exerciseRepository.findOne.mockResolvedValue({
      id: exerciseId,
    } as Exercise);
    weightHistoryRepository.create.mockImplementation(
      (data: Partial<WeightHistory>) => ({ ...data }),
    );
    weightHistoryRepository.save.mockImplementation(
      (entry: Partial<WeightHistory>) => Promise.resolve(entry),
    );
    weightHistoryRepository.findOne.mockResolvedValue({
      weightGrams: 2500,
      weightUnit: WeightUnit.KILOGRAM,
    });

    module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        WeightHistoryService,
        ExerciseWeightProjectionListener,
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

    await module.init();
    service = module.get(WeightHistoryService);
  });

  afterEach(async () => {
    await module.close();
  });

  const dto = {
    weight: 2.5,
    weightUnit: WeightUnit.KILOGRAM,
    date: '2026-01-01',
  };

  it('reaches the listener, which writes the projection onto the exercise row', async () => {
    await service.create(exerciseId, dto as any, user);

    expect(exerciseRepository.update).toHaveBeenCalledWith(exerciseId, {
      weightGrams: 2500,
      weightUnit: WeightUnit.KILOGRAM,
    });
  });

  it('propagates a listener failure to the caller instead of logging and continuing', async () => {
    exerciseRepository.update.mockRejectedValue(new Error('db down'));

    await expect(service.create(exerciseId, dto as any, user)).rejects.toThrow(
      'db down',
    );
  });
});
