import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { convertWeightToGrams } from './utils/convert-weight';
import { Exercise } from './entities/exercise.entity';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { User } from 'src/auth/entities/user.entity';
import { Category } from 'src/categories/entities/category.entity';
import { WeightHistory } from 'src/weight-history/entities/weight-history.entity';
import { CloudflareR2Service } from 'src/cloudflare-r2/cloudflare-r2.service';

@Injectable()
export class ExercisesService {
  constructor(
    @InjectRepository(Exercise)
    private readonly exerciseRepository: Repository<Exercise>,

    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,

    @InjectRepository(WeightHistory)
    private readonly weightHistoryRepository: Repository<WeightHistory>,

    private readonly cloudflareR2Service: CloudflareR2Service,

    private readonly configService: ConfigService,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @LogExecutionTime()
  async create(
    createExerciseDto: CreateExerciseDto,
    user: User,
    image?: Express.Multer.File,
  ) {
    let key: string | undefined;

    const category = await this.getUserCategory(
      createExerciseDto.category,
      user,
    );

    let imageUrl: string | null = null;
    if (image) {
      key = this.buildImageKey(image);
      imageUrl = await this.cloudflareR2Service.uploadFile(
        key,
        image.buffer,
        image.mimetype,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      const exercise = queryRunner.manager.create(Exercise, {
        name: createExerciseDto.name,
        weightGrams: convertWeightToGrams(
          createExerciseDto.weight,
          createExerciseDto.weightUnit,
        ),
        weightUnit: createExerciseDto.weightUnit,
        imageUrl,
        category,
      });
      await queryRunner.manager.save(exercise);

      await this.recordWeightHistory(exercise, queryRunner.manager);

      await queryRunner.commitTransaction();
      return exercise;
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      if (key) await this.cloudflareR2Service.deleteFile(key);
      this.handleDBExceptions(error);
    } finally {
      await queryRunner.release();
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
      category = await this.getUserCategory(updateExerciseDto.category, user);
    }

    let newImageKey: string | undefined;
    let imageUrl = currentExercise.imageUrl;

    if (image) {
      newImageKey = this.buildImageKey(image);
      imageUrl = await this.cloudflareR2Service.uploadFile(
        newImageKey,
        image.buffer,
        image.mimetype,
      );
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

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      await queryRunner.manager.save(exercise);

      if (updateExerciseDto.weight !== undefined) {
        await this.recordWeightHistory(exercise, queryRunner.manager);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      if (newImageKey) await this.cloudflareR2Service.deleteFile(newImageKey);
      this.handleDBExceptions(error);
    } finally {
      await queryRunner.release();
    }

    if (newImageKey && currentExercise.imageUrl) {
      await this.cloudflareR2Service.deleteFile(
        this.extractKeyFromUrl(currentExercise.imageUrl),
      );
    }

    return this.findOne(id, user);
  }

  async remove(id: string, user: User) {
    const exercise = await this.findOne(id, user);

    await this.exerciseRepository.remove(exercise);

    if (exercise.imageUrl) {
      await this.cloudflareR2Service.deleteFile(
        this.extractKeyFromUrl(exercise.imageUrl),
      );
    }
  }

  private handleDBExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);

    // this.logger.error(error);
    // console.log(error)
    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }

  private async getUserCategory(categoryId: string, user: User) {
    const category = await this.categoryRepository.findOne({
      where: {
        id: categoryId,
        user: { id: user.id },
      },
    });

    if (!category) {
      throw new NotFoundException(
        `Category with id: ${categoryId} not found for this user`,
      );
    }

    return category;
  }

  private async recordWeightHistory(
    exercise: Exercise,
    manager?: EntityManager,
  ) {
    const repository = manager
      ? manager.getRepository(WeightHistory)
      : this.weightHistoryRepository;

    const entry = repository.create({
      weightGrams: exercise.weightGrams,
      weightUnit: exercise.weightUnit,
      note: null,
      date: new Date(),
      exercise,
    });

    await repository.save(entry);
  }

  private buildImageKey(image: Express.Multer.File) {
    return `exercises/${randomUUID()}${extname(image.originalname)}`;
  }

  private extractKeyFromUrl(imageUrl: string) {
    const publicUrl = this.configService.get<string>(
      'CLOUDFLARE_R2_PUBLIC_URL',
    );

    return imageUrl.replace(`${publicUrl}/`, '');
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
