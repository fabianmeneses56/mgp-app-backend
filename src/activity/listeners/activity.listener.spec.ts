import { Test, TestingModule } from '@nestjs/testing';
import { ActivityListener } from './activity.listener';
import { ActivityService } from '../activity.service';
import { ActivityAction, ActivityType } from '../entities/activity-log.entity';
import { ActivityRecordedEvent } from '../events/activity-recorded.event';

describe('ActivityListener', () => {
  let listener: ActivityListener;

  const activityService = {
    record: jest.fn(),
  };

  const event = new ActivityRecordedEvent(
    'f4b1a2c3-1111-4a11-8b11-abcdef123456',
    ActivityType.EXERCISE,
    ActivityAction.CREATED,
    'entity-id',
    'Bench Press',
  );

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityListener,
        { provide: ActivityService, useValue: activityService },
      ],
    }).compile();

    listener = module.get(ActivityListener);
  });

  it('delegates to activityService.record with the event', async () => {
    await listener.handleActivityRecorded(event);

    expect(activityService.record).toHaveBeenCalledWith(event);
  });

  it('does not propagate when record rejects', async () => {
    activityService.record.mockRejectedValue(new Error('insert failed'));

    await expect(
      listener.handleActivityRecorded(event),
    ).resolves.toBeUndefined();
  });
});
