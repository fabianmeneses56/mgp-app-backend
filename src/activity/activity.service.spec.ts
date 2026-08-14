import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivityService } from './activity.service';
import {
  ActivityAction,
  ActivityLog,
  ActivityType,
} from './entities/activity-log.entity';
import { ActivityRecordedEvent } from './events/activity-recorded.event';
import { User } from 'src/auth/entities/user.entity';
import { WeightUnit } from 'src/exercises/enums/weight-unit.enum';

describe('ActivityService', () => {
  let service: ActivityService;

  const activityLogRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const user = { id: 'f4b1a2c3-1111-4a11-8b11-abcdef123456' } as User;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        {
          provide: getRepositoryToken(ActivityLog),
          useValue: activityLogRepository,
        },
      ],
    }).compile();

    service = module.get(ActivityService);
  });

  describe('record', () => {
    it('maps the event payload to the entity and saves it', async () => {
      const event = new ActivityRecordedEvent(
        user.id,
        ActivityType.WEIGHT_HISTORY,
        ActivityAction.CREATED,
        'entity-id',
        'Bench Press',
        80000,
        WeightUnit.KILOGRAM,
      );
      const created = { id: 'log-id' };
      activityLogRepository.create.mockReturnValue(created);
      activityLogRepository.save.mockResolvedValue(created);

      const result = await service.record(event);

      expect(activityLogRepository.create).toHaveBeenCalledWith({
        type: ActivityType.WEIGHT_HISTORY,
        action: ActivityAction.CREATED,
        entityId: 'entity-id',
        description: 'Bench Press',
        weightGrams: 80000,
        weightUnit: WeightUnit.KILOGRAM,
        user: { id: user.id },
      });
      expect(activityLogRepository.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });

    it('maps a category/exercise event with null weight fields', async () => {
      const event = new ActivityRecordedEvent(
        user.id,
        ActivityType.CATEGORY,
        ActivityAction.UPDATED,
        'category-id',
        'Pecho',
      );
      activityLogRepository.create.mockReturnValue({});
      activityLogRepository.save.mockResolvedValue({});

      await service.record(event);

      expect(activityLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          weightGrams: null,
          weightUnit: null,
        }),
      );
    });
  });

  describe('findAllByUser', () => {
    it('filters by user, orders by createdAt DESC and defaults to 20', async () => {
      activityLogRepository.find.mockResolvedValue([]);

      await service.findAllByUser(user);

      expect(activityLogRepository.find).toHaveBeenCalledWith({
        where: { user: { id: user.id } },
        order: { createdAt: 'DESC' },
        take: 20,
      });
    });

    it('applies the received limit instead of the default', async () => {
      activityLogRepository.find.mockResolvedValue([]);

      await service.findAllByUser(user, 5);

      expect(activityLogRepository.find).toHaveBeenCalledWith({
        where: { user: { id: user.id } },
        order: { createdAt: 'DESC' },
        take: 5,
      });
    });
  });
});
