import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import { User } from 'src/auth/entities/user.entity';
import { convertWeightToGrams } from 'src/exercises/utils/convert-weight';
import { Exercise } from 'src/exercises/entities/exercise.entity';
import { WeightHistory } from './entities/weight-history.entity';
import { CreateWeightHistoryDto } from './dto/create-weight-history.dto';
import { UpdateWeightHistoryDto } from './dto/update-weight-history.dto';

@Injectable()
export class WeightHistoryService {
  constructor(
    @InjectRepository(WeightHistory)
    private readonly weightHistoryRepository: Repository<WeightHistory>,

    @InjectRepository(Exercise)
    private readonly exerciseRepository: Repository<Exercise>,
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
    await this.syncExerciseWeight(exerciseId);

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
    await this.getOwnedExercise(exerciseId, user);
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
    await this.syncExerciseWeight(exerciseId);

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
    await this.syncExerciseWeight(exerciseId);

    return entry;
  }

  private async syncExerciseWeight(exerciseId: string): Promise<void> {
    const latest = await this.weightHistoryRepository.findOne({
      where: { exercise: { id: exerciseId } },
      order: { date: 'DESC' },
    });

    if (!latest) return;

    await this.exerciseRepository.update(exerciseId, {
      weightGrams: latest.weightGrams,
      weightUnit: latest.weightUnit,
    });
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
