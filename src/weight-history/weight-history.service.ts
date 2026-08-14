import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import { User } from 'src/auth/entities/user.entity';
import { convertWeightToGrams } from 'src/exercises/utils/convert-weight';
import { Exercise } from 'src/exercises/entities/exercise.entity';
import { WeightHistory } from './entities/weight-history.entity';
import { CreateWeightHistoryDto } from './dto/create-weight-history.dto';
import { UpdateWeightHistoryDto } from './dto/update-weight-history.dto';
import {
  WEIGHT_HISTORY_LATEST_CHANGED,
  WeightHistoryLatestChangedEvent,
} from './events/weight-history-latest-changed.event';
import {
  ActivityAction,
  ActivityType,
} from 'src/activity/entities/activity-log.entity';
import {
  ACTIVITY_RECORDED,
  ActivityRecordedEvent,
} from 'src/activity/events/activity-recorded.event';

@Injectable()
export class WeightHistoryService {
  constructor(
    @InjectRepository(WeightHistory)
    private readonly weightHistoryRepository: Repository<WeightHistory>,

    // Solo lectura: valida la pertenencia del ejercicio al usuario. Las
    // escrituras sobre `exercises` viven en su propio módulo.
    @InjectRepository(Exercise)
    private readonly exerciseRepository: Repository<Exercise>,

    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    exerciseId: string,
    dto: CreateWeightHistoryDto,
    user: User,
  ): Promise<WeightHistory> {
    const exercise = await this.getOwnedExercise(exerciseId, user);

    const entry = this.weightHistoryRepository.create({
      weightGrams: convertWeightToGrams(dto.weight, dto.weightUnit),
      weightUnit: dto.weightUnit,
      note: dto.note ?? null,
      date: new Date(dto.date),
      exercise,
    });

    await this.weightHistoryRepository.save(entry);
    this.emitActivityRecorded(entry, exercise, ActivityAction.CREATED, user);
    await this.publishLatestWeight(exerciseId);

    return entry;
  }

  async findAll(exerciseId: string, user: User): Promise<WeightHistory[]> {
    await this.getOwnedExercise(exerciseId, user);

    return this.weightHistoryRepository.find({
      where: { exercise: { id: exerciseId } },
      order: { date: 'DESC' },
    });
  }

  async update(
    exerciseId: string,
    entryId: string,
    dto: UpdateWeightHistoryDto,
    user: User,
  ): Promise<WeightHistory> {
    const exercise = await this.getOwnedExercise(exerciseId, user);
    const entry = await this.getEntryForExercise(entryId, exerciseId);

    if (dto.weight !== undefined) {
      entry.weightGrams = convertWeightToGrams(
        dto.weight,
        dto.weightUnit ?? entry.weightUnit,
      );
    }
    if (dto.weightUnit !== undefined) entry.weightUnit = dto.weightUnit;
    if (dto.note !== undefined) entry.note = dto.note;
    if (dto.date !== undefined) entry.date = new Date(dto.date);

    await this.weightHistoryRepository.save(entry);
    this.emitActivityRecorded(entry, exercise, ActivityAction.UPDATED, user);
    await this.publishLatestWeight(exerciseId);

    return entry;
  }

  async remove(
    exerciseId: string,
    entryId: string,
    user: User,
  ): Promise<WeightHistory> {
    await this.getOwnedExercise(exerciseId, user);
    const entry = await this.getEntryForExercise(entryId, exerciseId);

    await this.weightHistoryRepository.remove(entry);
    await this.publishLatestWeight(exerciseId);

    return entry;
  }

  private async publishLatestWeight(exerciseId: string): Promise<void> {
    const latest = await this.weightHistoryRepository.findOne({
      where: { exercise: { id: exerciseId } },
      order: { date: 'DESC' },
    });

    if (!latest) return;

    // emitAsync (no emit): los listeners se esperan y sus errores se propagan,
    // así que la respuesta no confirma un cambio que quedó a medias.
    await this.eventEmitter.emitAsync(
      WEIGHT_HISTORY_LATEST_CHANGED,
      new WeightHistoryLatestChangedEvent(
        exerciseId,
        latest.weightGrams,
        latest.weightUnit,
      ),
    );
  }

  private emitActivityRecorded(
    entry: WeightHistory,
    exercise: Exercise,
    action: ActivityAction,
    user: User,
  ) {
    this.eventEmitter.emit(
      ACTIVITY_RECORDED,
      new ActivityRecordedEvent(
        user.id,
        ActivityType.WEIGHT_HISTORY,
        action,
        entry.id,
        exercise.name,
        entry.weightGrams,
        entry.weightUnit,
      ),
    );
  }

  private async getOwnedExercise(
    exerciseId: string,
    user: User,
  ): Promise<Exercise> {
    if (!isUUID(exerciseId))
      throw new NotFoundException(`Exercise ${exerciseId} not found`);

    const exercise = await this.exerciseRepository.findOne({
      where: { id: exerciseId, category: { user: { id: user.id } } },
      relations: { category: { user: true } },
    });

    if (!exercise)
      throw new ForbiddenException(
        `Exercise ${exerciseId} not found or does not belong to you`,
      );

    return exercise;
  }

  private async getEntryForExercise(
    entryId: string,
    exerciseId: string,
  ): Promise<WeightHistory> {
    if (!isUUID(entryId))
      throw new NotFoundException(`Entry ${entryId} not found`);

    const entry = await this.weightHistoryRepository.findOne({
      where: { id: entryId, exercise: { id: exerciseId } },
    });

    if (!entry)
      throw new NotFoundException(
        `Entry ${entryId} not found for exercise ${exerciseId}`,
      );

    return entry;
  }
}
