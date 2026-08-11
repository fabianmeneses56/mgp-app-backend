import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CloudflareR2Service } from 'src/cloudflare-r2/cloudflare-r2.service';
import { ExerciseImageListener } from './exercise-image.listener';
import { ExerciseImageOrphanedEvent } from '../events/exercise-image-orphaned.event';

describe('ExerciseImageListener', () => {
  let listener: ExerciseImageListener;

  const cloudflareR2Service = {
    deleteFile: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    configService.get.mockReturnValue('https://public-url');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExerciseImageListener,
        { provide: CloudflareR2Service, useValue: cloudflareR2Service },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    listener = module.get(ExerciseImageListener);
  });

  it('deletes the R2 object using the key extracted via CLOUDFLARE_R2_PUBLIC_URL', async () => {
    await listener.handleImageOrphaned(
      new ExerciseImageOrphanedEvent(
        'https://public-url/exercises/old-key.png',
      ),
    );

    expect(configService.get).toHaveBeenCalledWith('CLOUDFLARE_R2_PUBLIC_URL');
    expect(cloudflareR2Service.deleteFile).toHaveBeenCalledWith(
      'exercises/old-key.png',
    );
  });

  it('swallows a deleteFile failure so the emitter is never affected', async () => {
    cloudflareR2Service.deleteFile.mockRejectedValue(new Error('R2 down'));

    await expect(
      listener.handleImageOrphaned(
        new ExerciseImageOrphanedEvent(
          'https://public-url/exercises/old-key.png',
        ),
      ),
    ).resolves.toBeUndefined();
  });
});
