import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { CloudflareR2Service } from 'src/cloudflare-r2/cloudflare-r2.service';
import {
  EXERCISE_IMAGE_ORPHANED,
  ExerciseImageOrphanedEvent,
} from '../events/exercise-image-orphaned.event';

@Injectable()
export class ExerciseImageListener {
  private readonly logger = new Logger(ExerciseImageListener.name);

  constructor(
    private readonly cloudflareR2Service: CloudflareR2Service,
    private readonly configService: ConfigService,
  ) {}

  @OnEvent(EXERCISE_IMAGE_ORPHANED, { async: true })
  async handleImageOrphaned({ imageUrl }: ExerciseImageOrphanedEvent) {
    const key = this.extractKeyFromUrl(imageUrl);

    try {
      await this.cloudflareR2Service.deleteFile(key);
    } catch (error) {
      // Best-effort: nadie espera este borrado y no hay reintentos, así que un
      // fallo solo deja un objeto huérfano en R2 y debe quedar en el log.
      this.logger.error(`Failed to delete orphaned R2 object ${key}`, error);
    }
  }

  private extractKeyFromUrl(imageUrl: string) {
    const publicUrl = this.configService.get<string>(
      'CLOUDFLARE_R2_PUBLIC_URL',
    );

    return imageUrl.replace(`${publicUrl}/`, '');
  }
}
