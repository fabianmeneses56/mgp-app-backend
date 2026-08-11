import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Exercise } from '../entities/exercise.entity';
import {
  WEIGHT_HISTORY_LATEST_CHANGED,
  WeightHistoryLatestChangedEvent,
} from 'src/weight-history/events/weight-history-latest-changed.event';

@Injectable()
export class ExerciseWeightProjectionListener {
  constructor(
    @InjectRepository(Exercise)
    private readonly exerciseRepository: Repository<Exercise>,
  ) {}

  /**
   * A diferencia de la limpieza de imágenes, esto es consistencia de datos y no
   * un side-effect best-effort: `suppressErrors: false` junto al `emitAsync` del
   * emisor hace que un fallo aquí aborte la petición, igual que cuando esta
   * escritura vivía dentro de WeightHistoryService.
   */
  @OnEvent(WEIGHT_HISTORY_LATEST_CHANGED, { suppressErrors: false })
  async handleLatestChanged({
    exerciseId,
    weightGrams,
    weightUnit,
  }: WeightHistoryLatestChangedEvent) {
    await this.exerciseRepository.update(exerciseId, {
      weightGrams,
      weightUnit,
    });
  }
}
