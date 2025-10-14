import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { User } from 'src/auth/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { Repository } from 'typeorm';
import { validate as isUUID } from 'uuid';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async create(createCategoryDto: CreateCategoryDto, user: User) {
    try {
      const category = this.categoryRepository.create({
        ...createCategoryDto,
        user,
      });

      await this.categoryRepository.save(category);
      return { ...createCategoryDto };
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

  async update(id: string, updateCategoryDto: UpdateCategoryDto, user: User) {
    console.log(updateCategoryDto, user);

    const category = await this.categoryRepository.preload({
      id,
      ...updateCategoryDto,
    });

    if (!category)
      throw new NotFoundException(`Category with id: ${id} not found`);

    category.user = user;

    await this.categoryRepository.save(category);

    return this.findOne(id);
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    await this.categoryRepository.remove(category);
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
