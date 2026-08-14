import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { User } from 'src/auth/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { Repository } from 'typeorm';
import { validate as isUUID } from 'uuid';
import {
  ActivityAction,
  ActivityType,
} from 'src/activity/entities/activity-log.entity';
import {
  ACTIVITY_RECORDED,
  ActivityRecordedEvent,
} from 'src/activity/events/activity-recorded.event';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,

    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(createCategoryDto: CreateCategoryDto, user: User) {
    try {
      const category = this.categoryRepository.create({
        ...createCategoryDto,
        user,
      });

      await this.categoryRepository.save(category);
      this.emitActivityRecorded(category, ActivityAction.CREATED, user);
      return { ...category };
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

  async findOne(id: string) {
    if (!isUUID(id))
      throw new NotFoundException(`category with ${id} not found`);

    const category = await this.categoryRepository.findOneBy({ id });

    if (!category) throw new NotFoundException(`category with ${id} not found`);

    return category;
  }
  async findAllByUser(user: User) {
    if (!isUUID(user.id)) return;

    const category = await this.categoryRepository.findBy({ user });

    if (!category)
      throw new NotFoundException(`Product with ${user.id} not found`);

    return category;
  }

  async findOnePlain(term: string) {
    const category = await this.findOne(term);
    return category;
  }

  async findOneByUser(id: string, user: User) {
    const category = await this.categoryRepository.findOne({
      where: {
        id,
        user: { id: user.id },
      },
    });

    if (!category) {
      throw new NotFoundException(
        `Category with id: ${id} not found for this user`,
      );
    }

    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto, user: User) {
    await this.findOneByUser(id, user);

    const category = await this.categoryRepository.preload({
      id,
      ...updateCategoryDto,
    });

    if (!category)
      throw new NotFoundException(`Category with id: ${id} not found`);

    await this.categoryRepository.save(category);
    this.emitActivityRecorded(category, ActivityAction.UPDATED, user);

    return this.findOne(id);
  }

  async remove(id: string, user: User) {
    const category = await this.findOneByUser(id, user);
    await this.categoryRepository.remove(category);
  }

  private emitActivityRecorded(
    category: Category,
    action: ActivityAction,
    user: User,
  ) {
    this.eventEmitter.emit(
      ACTIVITY_RECORDED,
      new ActivityRecordedEvent(
        user.id,
        ActivityType.CATEGORY,
        action,
        category.id,
        category.name,
      ),
    );
  }

  private handleDBExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);

    // this.logger.error(error);

    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }
}
