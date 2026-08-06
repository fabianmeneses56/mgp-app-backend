import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { Exercise } from './entities/exercise.entity';
import { WeightHistory } from 'src/weight-history/entities/weight-history.entity';
import { WeightUnit } from './enums/weight-unit.enum';
import { CategoriesService } from 'src/categories/categories.service';
import { CloudflareR2Service } from 'src/cloudflare-r2/cloudflare-r2.service';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/auth/entities/user.entity';
import { Category } from 'src/categories/entities/category.entity';

describe('ExercisesService', () => {
  let service: ExercisesService;

  const exerciseRepository = {
    findOne: jest.fn(),
    preload: jest.fn(),
    remove: jest.fn(),
  };

  const weightHistoryRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const categoriesService = {
    findOneByUser: jest.fn(),
  };

  const cloudflareR2Service = {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
  };

  const historyRepositoryInTx = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const manager = {
    create: jest.fn(),
    save: jest.fn(),
    getRepository: jest.fn(),
  };

  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: false,
    manager,
  };

  const dataSource = {
    createQueryRunner: jest.fn(() => queryRunner),
  };

  const user = { id: 'f4b1a2c3-1111-4a11-8b11-abcdef123456' } as User;
  const category = { id: 'cat-id' } as Category;

  beforeEach(async () => {
    jest.clearAllMocks();
    queryRunner.isTransactionActive = false;
    queryRunner.startTransaction.mockImplementation(() => {
      queryRunner.isTransactionActive = true;
    });
    manager.getRepository.mockReturnValue(historyRepositoryInTx);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExercisesService,
        { provide: getRepositoryToken(Exercise), useValue: exerciseRepository },
        {
          provide: getRepositoryToken(WeightHistory),
          useValue: weightHistoryRepository,
        },
        { provide: CategoriesService, useValue: categoriesService },
        { provide: CloudflareR2Service, useValue: cloudflareR2Service },
        { provide: ConfigService, useValue: configService },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(ExercisesService);
  });

  describe('create', () => {
    const dto = {
      name: 'Bench Press',
      weight: 60,
      weightUnit: WeightUnit.KILOGRAM,
      category: 'cat-id',
    };

    beforeEach(() => {
      categoriesService.findOneByUser.mockResolvedValue(category);
      manager.create.mockImplementation(
        (_entity: unknown, data: Partial<Exercise>) => ({ ...data }),
      );
      manager.save.mockResolvedValue(undefined);
      historyRepositoryInTx.create.mockImplementation(
        (data: Partial<WeightHistory>) => ({ ...data }),
      );
      historyRepositoryInTx.save.mockResolvedValue(undefined);
    });

    it('without an image: resolves the category via categoriesService.findOneByUser, converts the weight, commits the transaction and records a WeightHistory entry with the same transaction manager', async () => {
      const result = await service.create(dto as any, user);

      expect(categoriesService.findOneByUser).toHaveBeenCalledWith(
        dto.category,
        user,
      );
      expect(manager.create).toHaveBeenCalledWith(Exercise, {
        name: dto.name,
        weightGrams: 60000,
        weightUnit: WeightUnit.KILOGRAM,
        imageUrl: null,
        category,
      });
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(manager.getRepository).toHaveBeenCalledWith(WeightHistory);
      expect(historyRepositoryInTx.create).toHaveBeenCalledWith({
        weightGrams: 60000,
        weightUnit: WeightUnit.KILOGRAM,
        note: null,
        date: expect.any(Date) as Date,
        exercise: result,
      });
      expect(historyRepositoryInTx.save).toHaveBeenCalled();
      expect(weightHistoryRepository.create).not.toHaveBeenCalled();
      expect(result).toEqual({
        name: dto.name,
        weightGrams: 60000,
        weightUnit: WeightUnit.KILOGRAM,
        imageUrl: null,
        category,
      });
    });

    it('with an image: uploads it to R2 with a key formatted as exercises/<uuid><ext> using the extension from originalname', async () => {
      const image = {
        buffer: Buffer.from('fake'),
        mimetype: 'image/png',
        originalname: 'photo.png',
      } as Express.Multer.File;
      cloudflareR2Service.uploadFile.mockResolvedValue(
        'https://public-url/exercises/some-uuid.png',
      );

      await service.create(dto as any, user, image);

      expect(cloudflareR2Service.uploadFile).toHaveBeenCalledWith(
        expect.stringMatching(/^exercises\/[0-9a-f-]{36}\.png$/),
        image.buffer,
        image.mimetype,
      );
      expect(manager.create).toHaveBeenCalledWith(
        Exercise,
        expect.objectContaining({
          imageUrl: 'https://public-url/exercises/some-uuid.png',
        }),
      );
    });

    it("propagates categoriesService's exception for another user's category and uploads nothing to R2", async () => {
      const image = {
        buffer: Buffer.from('fake'),
        mimetype: 'image/png',
        originalname: 'photo.png',
      } as Express.Multer.File;
      categoriesService.findOneByUser.mockRejectedValue(
        new NotFoundException('category not found'),
      );

      await expect(
        service.create(dto as any, user, image),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(cloudflareR2Service.uploadFile).not.toHaveBeenCalled();
      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('when save fails: rolls back the transaction, deletes the uploaded key and throws InternalServerErrorException', async () => {
      const image = {
        buffer: Buffer.from('fake'),
        mimetype: 'image/png',
        originalname: 'photo.png',
      } as Express.Multer.File;
      cloudflareR2Service.uploadFile.mockResolvedValue(
        'https://public-url/exercises/some-uuid.png',
      );
      manager.save.mockRejectedValue(new Error('db down'));

      await expect(
        service.create(dto as any, user, image),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      const uploadedKey = cloudflareR2Service.uploadFile.mock
        .calls[0][0] as string;
      expect(cloudflareR2Service.deleteFile).toHaveBeenCalledWith(uploadedKey);
    });

    it('throws BadRequestException on a unique-violation error (code 23505)', async () => {
      manager.save.mockRejectedValue({ code: '23505', detail: 'dup' });

      await expect(service.create(dto as any, user)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('calls queryRunner.release() on both the happy path and the error path', async () => {
      await service.create(dto as any, user);
      expect(queryRunner.release).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      queryRunner.isTransactionActive = false;
      queryRunner.startTransaction.mockImplementation(() => {
        queryRunner.isTransactionActive = true;
      });
      manager.getRepository.mockReturnValue(historyRepositoryInTx);
      categoriesService.findOneByUser.mockResolvedValue(category);
      manager.create.mockImplementation(
        (_entity: unknown, data: Partial<Exercise>) => ({ ...data }),
      );
      manager.save.mockRejectedValue(new Error('db down'));

      await expect(service.create(dto as any, user)).rejects.toThrow();
      expect(queryRunner.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException without touching the repository when id is not a UUID', async () => {
      await expect(service.findOne('not-a-uuid')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(exerciseRepository.findOne).not.toHaveBeenCalled();
    });

    it('with a user: filters by category: { user: { id: user.id } }', async () => {
      const id = 'e4b1a2c3-2222-4a11-8b11-abcdef123456';
      const exercise = { id };
      exerciseRepository.findOne.mockResolvedValue(exercise);

      await service.findOne(id, user);

      expect(exerciseRepository.findOne).toHaveBeenCalledWith({
        where: { id, category: { user: { id: user.id } } },
        relations: { category: true },
      });
    });

    it('without a user: does not apply that filter', async () => {
      const id = 'e4b1a2c3-2222-4a11-8b11-abcdef123456';
      const exercise = { id };
      exerciseRepository.findOne.mockResolvedValue(exercise);

      await service.findOne(id);

      expect(exerciseRepository.findOne).toHaveBeenCalledWith({
        where: { id },
        relations: { category: true },
      });
    });
  });

  describe('update', () => {
    const id = 'e4b1a2c3-2222-4a11-8b11-abcdef123456';
    const currentExercise = {
      id,
      name: 'Bench Press',
      weightGrams: 60000,
      weightUnit: WeightUnit.KILOGRAM,
      imageUrl: null as string | null,
      category,
    };

    beforeEach(() => {
      exerciseRepository.findOne.mockResolvedValue(currentExercise);
      exerciseRepository.preload.mockImplementation(
        (data: Partial<Exercise>) => ({ ...data }),
      );
      manager.save.mockResolvedValue(undefined);
      historyRepositoryInTx.create.mockImplementation(
        (data: Partial<WeightHistory>) => ({ ...data }),
      );
      historyRepositoryInTx.save.mockResolvedValue(undefined);
    });

    it('throws BadRequestException when weightUnit is provided without weight', async () => {
      await expect(
        service.update(id, { weightUnit: WeightUnit.POUND } as any, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not record a WeightHistory entry when weight is not provided', async () => {
      await service.update(id, { name: 'New name' } as any, user);

      expect(historyRepositoryInTx.create).not.toHaveBeenCalled();
    });

    it('records a WeightHistory entry when weight is provided', async () => {
      await service.update(id, { weight: 65 } as any, user);

      expect(historyRepositoryInTx.create).toHaveBeenCalledWith(
        expect.objectContaining({ weightGrams: 65000 }),
      );
      expect(historyRepositoryInTx.save).toHaveBeenCalled();
    });

    it('a new image over a previous one: uploads the new one and deletes the previous one using the key extracted via CLOUDFLARE_R2_PUBLIC_URL', async () => {
      const withPreviousImage = {
        ...currentExercise,
        imageUrl: 'https://public-url/exercises/old-key.png',
      };
      exerciseRepository.findOne.mockResolvedValue(withPreviousImage);
      configService.get.mockReturnValue('https://public-url');
      cloudflareR2Service.uploadFile.mockResolvedValue(
        'https://public-url/exercises/new-key.png',
      );
      const image = {
        buffer: Buffer.from('fake'),
        mimetype: 'image/png',
        originalname: 'photo.png',
      } as Express.Multer.File;

      await service.update(id, {} as any, user, image);

      expect(cloudflareR2Service.uploadFile).toHaveBeenCalledWith(
        expect.stringMatching(/^exercises\/[0-9a-f-]{36}\.png$/),
        image.buffer,
        image.mimetype,
      );
      expect(cloudflareR2Service.deleteFile).toHaveBeenCalledWith(
        'exercises/old-key.png',
      );
    });

    it('throws NotFoundException when preload returns undefined', async () => {
      exerciseRepository.preload.mockResolvedValue(undefined);

      await expect(
        service.update(id, { name: 'New name' } as any, user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('when save fails: rolls back, deletes the new image and does not touch the previous one', async () => {
      const withPreviousImage = {
        ...currentExercise,
        imageUrl: 'https://public-url/exercises/old-key.png',
      };
      exerciseRepository.findOne.mockResolvedValue(withPreviousImage);
      configService.get.mockReturnValue('https://public-url');
      cloudflareR2Service.uploadFile.mockResolvedValue(
        'https://public-url/exercises/new-key.png',
      );
      manager.save.mockRejectedValue(new Error('db down'));
      const image = {
        buffer: Buffer.from('fake'),
        mimetype: 'image/png',
        originalname: 'photo.png',
      } as Express.Multer.File;

      await expect(
        service.update(id, {} as any, user, image),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      const uploadedKey = cloudflareR2Service.uploadFile.mock
        .calls[0][0] as string;
      expect(cloudflareR2Service.deleteFile).toHaveBeenCalledWith(uploadedKey);
      expect(cloudflareR2Service.deleteFile).not.toHaveBeenCalledWith(
        'exercises/old-key.png',
      );
    });
  });

  describe('remove', () => {
    it('removes the exercise and its R2 object', async () => {
      const exercise = {
        id: 'e4b1a2c3-2222-4a11-8b11-abcdef123456',
        imageUrl: 'https://public-url/exercises/old-key.png',
      };
      exerciseRepository.findOne.mockResolvedValue(exercise);
      configService.get.mockReturnValue('https://public-url');

      await service.remove(exercise.id, user);

      expect(exerciseRepository.remove).toHaveBeenCalledWith(exercise);
      expect(cloudflareR2Service.deleteFile).toHaveBeenCalledWith(
        'exercises/old-key.png',
      );
    });

    it('does not call deleteFile when the exercise has no imageUrl', async () => {
      const exercise = {
        id: 'e4b1a2c3-2222-4a11-8b11-abcdef123456',
        imageUrl: null,
      };
      exerciseRepository.findOne.mockResolvedValue(exercise);

      await service.remove(exercise.id, user);

      expect(cloudflareR2Service.deleteFile).not.toHaveBeenCalled();
    });
  });
});
