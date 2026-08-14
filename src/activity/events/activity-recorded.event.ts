import {
  ActivityAction,
  ActivityType,
} from 'src/activity/entities/activity-log.entity';
import { WeightUnit } from 'src/exercises/enums/weight-unit.enum';

export const ACTIVITY_RECORDED = 'activity.recorded';

export class ActivityRecordedEvent {
  constructor(
    public readonly userId: string,
    public readonly type: ActivityType,
    public readonly action: ActivityAction,
    public readonly entityId: string,
    public readonly description: string,
    public readonly weightGrams: number | null = null,
    public readonly weightUnit: WeightUnit | null = null,
  ) {}
}
