import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { convertWeightToGrams } from './utils/convert-weight';
import { Exercise } from './entities/exercise.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { User } from 'src/auth/entities/user.entity';
import { Category } from 'src/categories/entities/category.entity';
import { unlink } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class ExercisesService {
  constructor(
    @InjectRepository(Exercise)
    private readonly exerciseRepository: Repository<Exercise>,

    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async create(
    createExerciseDto: CreateExerciseDto,
    user: User,
    image?: { filename: string },
  ) {
    try {
      const category = await this.getUserCategory(
        createExerciseDto.category,
        user,
      );

      const exercise = this.exerciseRepository.create({
        name: createExerciseDto.name,
        weightGrams: convertWeightToGrams(
          createExerciseDto.weight,
          createExerciseDto.weightUnit,
        ),
        weightUnit: createExerciseDto.weightUnit,
        imageUrl: image ? `/uploads/exercises/${image.filename}` : null,
        category,
      });

      await this.exerciseRepository.save(exercise);

      return this.findOne(exercise.id, user);
    } catch (error) {
      await this.deleteImageIfExists(image?.filename);
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
    image?: { filename: string },
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
      imageUrl: image
        ? `/uploads/exercises/${image.filename}`
        : currentExercise.imageUrl,
      category,
    });

    if (!exercise)
      throw new NotFoundException(`Exercise with id: ${id} not found`);

    try {
      await this.exerciseRepository.save(exercise);

      if (image && currentExercise.imageUrl) {
        await this.deleteImageIfExists(
          this.extractFilename(currentExercise.imageUrl),
        );
      }

      return this.findOne(id, user);
    } catch (error) {
      await this.deleteImageIfExists(image?.filename);
      this.handleDBExceptions(error);
    }
  }

  async remove(id: string, user: User) {
    const exercise = await this.findOne(id, user);

    await this.exerciseRepository.remove(exercise);

    if (exercise.imageUrl) {
      await this.deleteImageIfExists(this.extractFilename(exercise.imageUrl));
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

  private extractFilename(imageUrl: string) {
    return imageUrl.split('/').pop() ?? '';
  }

  private async deleteImageIfExists(filename?: string) {
    if (!filename) return;

    try {
      await unlink(
        join(process.cwd(), 'static', 'uploads', 'exercises', filename),
      );
    } catch {
      return;
    }
  }
}
