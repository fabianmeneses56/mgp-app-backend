import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { User } from 'src/auth/entities/user.entity';

describe('CategoriesService', () => {
  let service: CategoriesService;

  const categoryRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    preload: jest.fn(),
    remove: jest.fn(),
  };

  const user = { id: 'f4b1a2c3-1111-4a11-8b11-abcdef123456' } as User;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: getRepositoryToken(Category),
          useValue: categoryRepository,
        },
      ],
    }).compile();

    service = module.get(CategoriesService);
  });

  describe('create', () => {
    it('creates the category with the user attached and saves it', async () => {
      const dto = { name: 'Legs' };
      const created = { ...dto, user };
      categoryRepository.create.mockReturnValue(created);
      categoryRepository.save.mockResolvedValue(created);

      const result = await service.create(dto, user);

      expect(categoryRepository.create).toHaveBeenCalledWith({
        ...dto,
        user,
      });
      expect(categoryRepository.save).toHaveBeenCalledWith(created);
      expect(result).toEqual({ ...created });
    });

    it('throws BadRequestException on a unique-violation error', async () => {
      categoryRepository.create.mockReturnValue({});
      categoryRepository.save.mockRejectedValue({
        code: '23505',
        detail: 'already exists',
      });

      await expect(
        service.create({ name: 'Legs' }, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws InternalServerErrorException on an unexpected error', async () => {
      categoryRepository.create.mockReturnValue({});
      categoryRepository.save.mockRejectedValue(new Error('boom'));

      await expect(
        service.create({ name: 'Legs' }, user),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException without querying the repository when id is not a UUID', async () => {
      await expect(service.findOne('not-a-uuid')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(categoryRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the repository returns null', async () => {
      categoryRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.findOne('f4b1a2c3-1111-4a11-8b11-abcdef123456'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the found category', async () => {
      const category = { id: 'f4b1a2c3-1111-4a11-8b11-abcdef123456' };
      categoryRepository.findOneBy.mockResolvedValue(category);

      const result = await service.findOne(category.id);

      expect(result).toEqual(category);
    });
  });

  describe('findOneByUser', () => {
    it('queries with where: { id, user: { id: user.id } }', async () => {
      const category = { id: 'cat-id' };
      categoryRepository.findOne.mockResolvedValue(category);

      const result = await service.findOneByUser('cat-id', user);

      expect(categoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'cat-id', user: { id: user.id } },
      });
      expect(result).toEqual(category);
    });

    it('throws NotFoundException with a "not found for this user" message when there is no result', async () => {
      categoryRepository.findOne.mockResolvedValue(null);

      await expect(service.findOneByUser('cat-id', user)).rejects.toThrow(
        /not found for this user/,
      );
    });
  });

  describe('findOnePlain', () => {
    it('delegates to findOne', async () => {
      const category = { id: 'cat-id' };
      const spy = jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(category as Category);

      const result = await service.findOnePlain('cat-id');

      expect(spy).toHaveBeenCalledWith('cat-id');
      expect(result).toEqual(category);
    });
  });

  describe('update', () => {
    it('does not call preload nor save when findOneByUser throws', async () => {
      categoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('cat-id', { name: 'New' }, user),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(categoryRepository.preload).not.toHaveBeenCalled();
      expect(categoryRepository.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when preload returns undefined', async () => {
      categoryRepository.findOne.mockResolvedValue({ id: 'cat-id' });
      categoryRepository.preload.mockResolvedValue(undefined);

      await expect(
        service.update('cat-id', { name: 'New' }, user),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(categoryRepository.save).not.toHaveBeenCalled();
    });

    it('saves and then returns findOne on the happy path', async () => {
      const id = 'f4b1a2c3-1111-4a11-8b11-abcdef123456';
      const preloaded = { id, name: 'New' };
      const updated = { id, name: 'New', extra: true };
      categoryRepository.findOne.mockResolvedValue({ id });
      categoryRepository.preload.mockResolvedValue(preloaded);
      categoryRepository.save.mockResolvedValue(preloaded);
      categoryRepository.findOneBy.mockResolvedValue(updated);

      const result = await service.update(id, { name: 'New' }, user);

      expect(categoryRepository.save).toHaveBeenCalledWith(preloaded);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('validates ownership and removes the category', async () => {
      const category = { id: 'cat-id' };
      categoryRepository.findOne.mockResolvedValue(category);

      await service.remove('cat-id', user);

      expect(categoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'cat-id', user: { id: user.id } },
      });
      expect(categoryRepository.remove).toHaveBeenCalledWith(category);
    });
  });
});
