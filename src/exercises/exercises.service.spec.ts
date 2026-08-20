import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { Exercise } from './entities/exercise.entity';
import { ExerciseWeightRepository } from './exercise-weight.repository';
import { WeightUnit } from './enums/weight-unit.enum';
import { CategoriesService } from 'src/categories/categories.service';
import { CloudflareR2Service } from 'src/cloudflare-r2/cloudflare-r2.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User } from 'src/auth/entities/user.entity';
import { Category } from 'src/categories/entities/category.entity';
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

describe('ExercisesService', () => {
  let service: ExercisesService;

  const exerciseRepository = {
    findOne: jest.fn(),
    preload: jest.fn(),
    remove: jest.fn(),
  };

  const exerciseWeightRepository = {
    createExercise: jest.fn(),
    updateExercise: jest.fn(),
  };

  const categoriesService = {
    findOneByUser: jest.fn(),
  };

  const cloudflareR2Service = {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
  };

  const eventEmitter = {
    emit: jest.fn(),
  };

  const expectOrphanedEmit = (imageUrl: string) =>
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EXERCISE_IMAGE_ORPHANED,
      new ExerciseImageOrphanedEvent(imageUrl),
    );

  const user = { id: 'f4b1a2c3-1111-4a11-8b11-abcdef123456' } as User;
  const category = { id: 'cat-id' } as Category;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExercisesService,
        { provide: getRepositoryToken(Exercise), useValue: exerciseRepository },
        {
          provide: ExerciseWeightRepository,
          useValue: exerciseWeightRepository,
        },
        { provide: CategoriesService, useValue: categoriesService },
        { provide: CloudflareR2Service, useValue: cloudflareR2Service },
        { provide: EventEmitter2, useValue: eventEmitter },
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
      exerciseWeightRepository.createExercise.mockImplementation(
        (data: Record<string, unknown>) =>
          Promise.resolve({ id: 'new-id', ...data }),
      );
    });

    it('without an image: resolves the category via categoriesService.findOneByUser, converts the weight and delegates to exerciseWeightRepository.createExercise', async () => {
      const result = await service.create(dto as any, user);

      expect(categoriesService.findOneByUser).toHaveBeenCalledWith(
        dto.category,
        user,
      );
      expect(exerciseWeightRepository.createExercise).toHaveBeenCalledWith({
        name: dto.name,
        weightGrams: 60000,
        weightUnit: WeightUnit.KILOGRAM,
        imageUrl: null,
        category,
      });
      expect(result).toEqual(
        expect.objectContaining({
          name: dto.name,
          weightGrams: 60000,
          weightUnit: WeightUnit.KILOGRAM,
          imageUrl: null,
          category,
        }),
      );
    });

    it('emits ACTIVITY_RECORDED with type EXERCISE and action CREATED after createExercise resolves', async () => {
      const result = await service.create(dto as any, user);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ACTIVITY_RECORDED,
        new ActivityRecordedEvent(
          user.id,
          ActivityType.EXERCISE,
          ActivityAction.CREATED,
          (result as Exercise).id,
          (result as Exercise).name,
        ),
      );
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
      expect(exerciseWeightRepository.createExercise).toHaveBeenCalledWith(
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
      expect(exerciseWeightRepository.createExercise).not.toHaveBeenCalled();
    });

    it('when createExercise fails: emits the orphaned-image event for the uploaded image and throws InternalServerErrorException', async () => {
      const image = {
        buffer: Buffer.from('fake'),
        mimetype: 'image/png',
        originalname: 'photo.png',
      } as Express.Multer.File;
      cloudflareR2Service.uploadFile.mockResolvedValue(
        'https://public-url/exercises/some-uuid.png',
      );
      exerciseWeightRepository.createExercise.mockRejectedValue(
        new Error('db down'),
      );

      await expect(
        service.create(dto as any, user, image),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expectOrphanedEmit('https://public-url/exercises/some-uuid.png');
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        ACTIVITY_RECORDED,
        expect.anything(),
      );
    });

    it('throws BadRequestException on a unique-violation error (code 23505) and does not emit activity', async () => {
      exerciseWeightRepository.createExercise.mockRejectedValue({
        code: '23505',
        detail: 'dup',
      });

      await expect(service.create(dto as any, user)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(eventEmitter.emit).not.toHaveBeenCalled();
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
      exerciseWeightRepository.updateExercise.mockResolvedValue(undefined);
    });

    it('throws BadRequestException when weightUnit is provided without weight', async () => {
      await expect(
        service.update(id, { weightUnit: WeightUnit.POUND } as any, user),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('calls exerciseWeightRepository.updateExercise with recordWeightEntry: false when weight is not provided', async () => {
      await service.update(id, { name: 'New name' } as any, user);

      expect(exerciseWeightRepository.updateExercise).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New name' }),
        false,
      );
    });

    it('calls exerciseWeightRepository.updateExercise with recordWeightEntry: true when weight is provided', async () => {
      await service.update(id, { weight: 65 } as any, user);

      expect(exerciseWeightRepository.updateExercise).toHaveBeenCalledWith(
        expect.objectContaining({ weightGrams: 65000 }),
        true,
      );
    });

    it('emits ACTIVITY_RECORDED with type EXERCISE and action UPDATED with the resultant name', async () => {
      await service.update(id, { name: 'New name' } as any, user);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ACTIVITY_RECORDED,
        new ActivityRecordedEvent(
          user.id,
          ActivityType.EXERCISE,
          ActivityAction.UPDATED,
          id,
          'New name',
        ),
      );
    });

    it('a new image over a previous one: uploads the new one and emits the orphaned-image event for the previous one', async () => {
      const withPreviousImage = {
        ...currentExercise,
        imageUrl: 'https://public-url/exercises/old-key.png',
      };
      exerciseRepository.findOne.mockResolvedValue(withPreviousImage);
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
      expectOrphanedEmit('https://public-url/exercises/old-key.png');
    });

    it('throws NotFoundException when preload returns undefined', async () => {
      exerciseRepository.preload.mockResolvedValue(undefined);

      await expect(
        service.update(id, { name: 'New name' } as any, user),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('when updateExercise fails: emits the orphaned-image event for the new image only and leaves the previous one alone', async () => {
      const withPreviousImage = {
        ...currentExercise,
        imageUrl: 'https://public-url/exercises/old-key.png',
      };
      exerciseRepository.findOne.mockResolvedValue(withPreviousImage);
      cloudflareR2Service.uploadFile.mockResolvedValue(
        'https://public-url/exercises/new-key.png',
      );
      exerciseWeightRepository.updateExercise.mockRejectedValue(
        new Error('db down'),
      );
      const image = {
        buffer: Buffer.from('fake'),
        mimetype: 'image/png',
        originalname: 'photo.png',
      } as Express.Multer.File;

      await expect(
        service.update(id, {} as any, user, image),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expectOrphanedEmit('https://public-url/exercises/new-key.png');
      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('removes the exercise and emits the orphaned-image event for its R2 object', async () => {
      const exercise = {
        id: 'e4b1a2c3-2222-4a11-8b11-abcdef123456',
        imageUrl: 'https://public-url/exercises/old-key.png',
      };
      exerciseRepository.findOne.mockResolvedValue(exercise);

      await service.remove(exercise.id, user);

      expect(exerciseRepository.remove).toHaveBeenCalledWith(exercise);
      expectOrphanedEmit('https://public-url/exercises/old-key.png');
    });

    it('does not emit when the exercise has no imageUrl', async () => {
      const exercise = {
        id: 'e4b1a2c3-2222-4a11-8b11-abcdef123456',
        imageUrl: null,
      };
      exerciseRepository.findOne.mockResolvedValue(exercise);

      await service.remove(exercise.id, user);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
