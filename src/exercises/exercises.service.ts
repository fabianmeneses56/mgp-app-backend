import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { convertWeightToGrams } from './utils/convert-weight';
import { Exercise } from './entities/exercise.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { User } from 'src/auth/entities/user.entity';
import { ExerciseWeightRepository } from './exercise-weight.repository';
import { CloudflareR2Service } from 'src/cloudflare-r2/cloudflare-r2.service';
import { CategoriesService } from 'src/categories/categories.service';
import {
  EXERCISE_IMAGE_ORPHANED,
  ExerciseImageOrphanedEvent,
} from './events/exercise-image-orphaned.event';
import {
  ActivityAction,
  ActivityType,
} from 'src/activity/entities/activity-log.entity';
import {
  ACTIVITY_RECORDED,
  ActivityRecordedEvent,
} from 'src/activity/events/activity-recorded.event';

@Injectable()
export class ExercisesService {
  constructor(
    @InjectRepository(Exercise)
    private readonly exerciseRepository: Repository<Exercise>,

    private readonly categoriesService: CategoriesService,

    private readonly exerciseWeightRepository: ExerciseWeightRepository,

    private readonly cloudflareR2Service: CloudflareR2Service,

    private readonly eventEmitter: EventEmitter2,
  ) {}

  @LogExecutionTime()
  async create(
    createExerciseDto: CreateExerciseDto,
    user: User,
    image?: Express.Multer.File,
  ) {
    const category = await this.categoriesService.findOneByUser(
      createExerciseDto.category,
      user,
    );

    let imageUrl: string | null = null;
    if (image) {
      imageUrl = await this.cloudflareR2Service.uploadFile(
        this.buildImageKey(image),
        image.buffer,
        image.mimetype,
      );
    }

    try {
      const exercise = await this.exerciseWeightRepository.createExercise({
        name: createExerciseDto.name,
        weightGrams: convertWeightToGrams(
          createExerciseDto.weight,
          createExerciseDto.weightUnit,
        ),
        weightUnit: createExerciseDto.weightUnit,
        imageUrl,
        category,
      });

      this.emitActivityRecorded(exercise, ActivityAction.CREATED, user);
      return exercise;
    } catch (error) {
      if (imageUrl) this.emitImageOrphaned(imageUrl);
      this.handleDBExceptions(error);
    }
  }

  findAll() {
    return `This action returns all exercises`;
  }

  async findOne(id: string, user?: User) {
    if (!isUUID(id))
      throw new NotFoundException(`Exercise with ${id} not found`);

    const exercise = await this.exerciseRepository.findOne({
      where: {
        id,
        ...(user ? { category: { user: { id: user.id } } } : {}),
      },
      relations: {
        category: true,
      },
    });

    if (!exercise) throw new NotFoundException(`Exercise with ${id} not found`);

    return exercise;
  }

  async update(
    id: string,
    updateExerciseDto: UpdateExerciseDto,
    user: User,
    image?: Express.Multer.File,
  ) {
    if (
      updateExerciseDto.weightUnit !== undefined &&
      updateExerciseDto.weight === undefined
    ) {
      throw new BadRequestException(
        'weight must be provided when weightUnit is updated',
      );
    }

    const currentExercise = await this.findOne(id, user);
    let category = currentExercise.category;

    if (updateExerciseDto.category) {
      category = await this.categoriesService.findOneByUser(
        updateExerciseDto.category,
        user,
      );
    }

    let newImageUrl: string | null = null;
    let imageUrl = currentExercise.imageUrl;

    if (image) {
      newImageUrl = await this.cloudflareR2Service.uploadFile(
        this.buildImageKey(image),
        image.buffer,
        image.mimetype,
      );
      imageUrl = newImageUrl;
    }

    const exercise = await this.exerciseRepository.preload({
      id,
      name: updateExerciseDto.name ?? currentExercise.name,
      weightGrams:
        updateExerciseDto.weight !== undefined
          ? convertWeightToGrams(
              updateExerciseDto.weight,
              updateExerciseDto.weightUnit ?? currentExercise.weightUnit,
            )
          : currentExercise.weightGrams,
      weightUnit: updateExerciseDto.weightUnit ?? currentExercise.weightUnit,
      imageUrl,
      category,
    });

    if (!exercise)
      throw new NotFoundException(`Exercise with id: ${id} not found`);

    try {
      await this.exerciseWeightRepository.updateExercise(
        exercise,
        updateExerciseDto.weight !== undefined,
      );
    } catch (error) {
      if (newImageUrl) this.emitImageOrphaned(newImageUrl);
      this.handleDBExceptions(error);
    }

    this.emitActivityRecorded(exercise, ActivityAction.UPDATED, user);

    if (newImageUrl && currentExercise.imageUrl) {
      this.emitImageOrphaned(currentExercise.imageUrl);
    }

    return this.findOne(id, user);
  }

  async remove(id: string, user: User) {
    const exercise = await this.findOne(id, user);

    await this.exerciseRepository.remove(exercise);

    if (exercise.imageUrl) this.emitImageOrphaned(exercise.imageUrl);
  }

  private handleDBExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);

    // this.logger.error(error);

    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }

  private buildImageKey(image: Express.Multer.File) {
    return `exercises/${randomUUID()}${extname(image.originalname)}`;
  }

  private emitImageOrphaned(imageUrl: string) {
    this.eventEmitter.emit(
      EXERCISE_IMAGE_ORPHANED,
      new ExerciseImageOrphanedEvent(imageUrl),
    );
  }

  private emitActivityRecorded(
    exercise: Exercise,
    action: ActivityAction,
    user: User,
  ) {
    this.eventEmitter.emit(
      ACTIVITY_RECORDED,
      new ActivityRecordedEvent(
        user.id,
        ActivityType.EXERCISE,
        action,
        exercise.id,
        exercise.name,
      ),
    );
  }
}

export function LogExecutionTime() {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value as (
      ...args: any[]
    ) => Promise<unknown>;
    const logger = new Logger(target.constructor.name);

    descriptor.value = async function (...args: any[]) {
      const start = performance.now();
      try {
        const result: unknown = await originalMethod.apply(this, args);
        const duration = performance.now() - start;
        logger.debug(`[${propertyKey}] ejecutado en ${duration.toFixed(2)}ms`);
        return result;
      } catch (error) {
        const duration = performance.now() - start;
        logger.debug(`[${propertyKey}] fallo tras ${duration.toFixed(2)}ms`);
        throw error;
      }
    };

    return descriptor;
  };
}
