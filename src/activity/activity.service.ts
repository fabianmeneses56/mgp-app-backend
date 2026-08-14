import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/auth/entities/user.entity';
import { ActivityLog } from './entities/activity-log.entity';
import { ActivityRecordedEvent } from './events/activity-recorded.event';

const DEFAULT_LIMIT = 20;

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityLogRepository: Repository<ActivityLog>,
  ) {}

  async record(event: ActivityRecordedEvent): Promise<ActivityLog> {
    const activityLog = this.activityLogRepository.create({
      type: event.type,
      action: event.action,
      entityId: event.entityId,
      description: event.description,
      weightGrams: event.weightGrams,
      weightUnit: event.weightUnit,
      user: { id: event.userId } as User,
    });

    return this.activityLogRepository.save(activityLog);
  }

  findAllByUser(user: User, limit?: number): Promise<ActivityLog[]> {
    return this.activityLogRepository.find({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' },
      take: limit ?? DEFAULT_LIMIT,
    });
  }
}
