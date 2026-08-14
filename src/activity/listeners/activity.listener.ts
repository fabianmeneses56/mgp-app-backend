import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityService } from '../activity.service';
import {
  ACTIVITY_RECORDED,
  ActivityRecordedEvent,
} from '../events/activity-recorded.event';

@Injectable()
export class ActivityListener {
  private readonly logger = new Logger(ActivityListener.name);

  constructor(private readonly activityService: ActivityService) {}

  @OnEvent(ACTIVITY_RECORDED, { async: true })
  async handleActivityRecorded(event: ActivityRecordedEvent) {
    try {
      await this.activityService.record(event);
    } catch (error) {
      // Best-effort: un insert fallido del log no debe afectar la operación
      // que lo originó, que ya respondió antes de que este listener corra.
      this.logger.error(
        `Failed to record activity ${event.type}/${event.action} for entity ${event.entityId}`,
        error,
      );
    }
  }
}
