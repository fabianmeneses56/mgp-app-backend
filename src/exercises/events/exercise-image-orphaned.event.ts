export const EXERCISE_IMAGE_ORPHANED = 'exercise.image.orphaned';

/**
 * Se emite cuando una imagen deja de estar referenciada por un ejercicio:
 * al borrar el ejercicio, al reemplazar su imagen, o al revertir una subida
 * cuya escritura en base de datos falló.
 */
export class ExerciseImageOrphanedEvent {
  constructor(public readonly imageUrl: string) {}
}
