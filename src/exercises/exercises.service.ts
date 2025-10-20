import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { Exercise } from './entities/exercise.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';

@Injectable()
export class ExercisesService {
  constructor(
    @InjectRepository(Exercise)
    private readonly exerciseRepository: Repository<Exercise>,
  ) {}

  async create(createExerciseDto: CreateExerciseDto) {
    console.log(createExerciseDto);

    try {
      const exercise = this.exerciseRepository.create({
        weightGrams: createExerciseDto.weight,
        ...createExerciseDto,
      });

      await this.exerciseRepository.save(exercise);

      return { ...createExerciseDto };
    } catch (error) {
      this.handleDBExceptions(error);
    }

    return 'This action adds a new exercise';
  }

  findAll() {
    return `This action returns all exercises`;
  }

  async findOne(id: string) {
    if (!isUUID(id))
      throw new NotFoundException(`Exercise with ${id} not found`);

    const exercise = await this.exerciseRepository.findOneBy({ id });

    if (!exercise) throw new NotFoundException(`Exercise with ${id} not found`);

    return exercise;
  }

  async update(id: string, updateExerciseDto: UpdateExerciseDto) {
    console.log(updateExerciseDto);

    const exercise = await this.exerciseRepository.preload({
      id,
      ...updateExerciseDto,
    });

    if (!exercise)
      throw new NotFoundException(`Exercise with id: ${id} not found`);

    await this.exerciseRepository.save(exercise);
    return this.findOne(id);
  }

  async remove(id: string) {
    const exercise = await this.findOne(id);

    await this.exerciseRepository.remove(exercise);
    // return `This action removes a #${id} exercise`;
  }

  private handleDBExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);

    // this.logger.error(error);
    // console.log(error)
    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }
}
