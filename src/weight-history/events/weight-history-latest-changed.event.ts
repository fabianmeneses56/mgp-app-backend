import { WeightUnit } from 'src/exercises/enums/weight-unit.enum';

export const WEIGHT_HISTORY_LATEST_CHANGED = 'weight-history.latest-changed';

/**
 * Se emite cuando cambia cuál es el registro más reciente de un ejercicio, ya
 * sea por crear, editar o borrar una entrada del historial. El historial es la
 * fuente de verdad del peso; quien mantenga una proyección de ese valor
 * (hoy `Exercise.weightGrams`) se actualiza escuchando este evento.
 */
export class WeightHistoryLatestChangedEvent {
  constructor(
    public readonly exerciseId: string,
    public readonly weightGrams: number,
    public readonly weightUnit: WeightUnit,
  ) {}
}
