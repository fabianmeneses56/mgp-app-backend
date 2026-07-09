---
id: 01
title: Weight History — CRUD de historial de pesos por ejercicio
state: Implemented
date: 2026-06-26
depends_on: exercises (módulo existente)
---

**Objetivo:** Exponer cuatro endpoints REST anidados bajo ejercicios que permitan crear,
listar, editar y eliminar entradas del historial de pesos de un ejercicio, manteniendo
el campo `weightGrams` del ejercicio sincronizado con el registro más reciente.

---

## Scope

### Incluido

- Nuevo módulo `weight-history` con su controller, service, entity y DTOs.
- 4 endpoints anidados bajo `/api/exercises/:exerciseId/weight-history`:
  - `POST   /` — crear entrada
  - `GET    /` — listar todas las entradas del ejercicio (ordenadas desc por fecha)
  - `PATCH  /:entryId` — editar una entrada
  - `DELETE /:entryId` — eliminar una entrada
- Todos los endpoints protegidos con `@Auth()` (usuario autenticado).
- Validación de ownership: el ejercicio referenciado debe pertenecer al usuario autenticado.
- Conversión de peso a gramos al crear/editar (usando la misma lógica de `convertWeightToGrams()`).
- Sincronización de `exercise.weightGrams` y `exercise.weightUnit` al crear, editar o eliminar
  una entrada: siempre refleja el valor del registro más reciente por fecha.

### No incluido

- Paginación del historial.
- Endpoints de lectura individual de una entrada (`GET /:entryId`).
- Gráficas o agregaciones sobre el historial.
- Historial de pesos del ejercicio (campo `weightGrams`) previo a este feature
  (no se migran datos históricos del campo existente).

---

## Data Model

### Nueva entidad: `WeightHistory`

```ts
@Entity({ name: 'weight_history' })
export class WeightHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  weightGrams: number;

  @Column({ type: 'enum', enum: WeightUnit, default: WeightUnit.KILOGRAM })
  weightUnit: WeightUnit;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'timestamptz' })
  date: Date;

  @ManyToOne(() => Exercise, (exercise) => exercise.weightHistory, {
    onDelete: 'CASCADE',
  })
  exercise: Exercise;
}
```

### Cambios en entidad existente: `Exercise`

Agregar la relación inversa:

```ts
@OneToMany(() => WeightHistory, (wh) => wh.exercise)
weightHistory: WeightHistory[];
```

### DTOs

- `CreateWeightHistoryDto`: `weight` (number, >0), `weightUnit` (enum: g/kg/lb), `note?` (string), `date` (string ISO).
- `UpdateWeightHistoryDto`: todos los campos de create opcionales (PartialType).

### Notas

- `WeightUnit` se reutiliza del enum ya definido en `exercise.entity.ts`.
- `date` se guarda como `timestamptz`; el frontend manda ISO string.
- Al eliminar un ejercicio, el `CASCADE` borra automáticamente su historial.

---

## Implementation Plan

1. **Crear la entidad `WeightHistory`** en `src/weight-history/entities/weight-history.entity.ts`
   con los campos del modelo. Agregar la relación `@OneToMany` en `Exercise`.

2. **Crear los DTOs** en `src/weight-history/dto/`:
   - `create-weight-history.dto.ts`
   - `update-weight-history.dto.ts` (PartialType de create)

3. **Crear `WeightHistoryService`** en `src/weight-history/weight-history.service.ts` con:
   - `create(exerciseId, dto, user)` — valida ownership, convierte peso, inserta entrada,
     llama a `syncExerciseWeight()`.
   - `findAll(exerciseId, user)` — valida ownership, devuelve entradas ordenadas por `date DESC`.
   - `update(exerciseId, entryId, dto, user)` — valida ownership del ejercicio y que la entrada
     pertenezca a ese ejercicio, actualiza, llama a `syncExerciseWeight()`.
   - `remove(exerciseId, entryId, user)` — valida ownership, elimina entrada,
     llama a `syncExerciseWeight()`.
   - `syncExerciseWeight(exerciseId)` — busca la entrada más reciente por `date`; si existe,
     actualiza `exercise.weightGrams` y `exercise.weightUnit`; si no quedan entradas, no modifica.

4. **Crear `WeightHistoryController`** en `src/weight-history/weight-history.controller.ts`
   con prefijo de ruta `exercises/:exerciseId/weight-history`, todos los endpoints decorados
   con `@Auth()` y `@GetUser()`.

5. **Crear `WeightHistoryModule`** en `src/weight-history/weight-history.module.ts`:
   - Importa `AuthModule` y `TypeOrmModule.forFeature([WeightHistory, Exercise])`.
   - Exporta lo necesario para que NestJS registre el repositorio de `Exercise`
     (necesario para `syncExerciseWeight()`).

6. **Registrar `WeightHistoryModule`** en `AppModule`.

7. **Verificar** que `synchronize: true` de TypeORM crea la tabla `weight_history`
   al iniciar la app con `yarn start:dev`.

---

## Acceptance Criteria

- [ ] `POST /api/exercises/:exerciseId/weight-history` con credenciales válidas y datos
      correctos devuelve `201` y la entrada creada con `id`, `weightGrams`, `weightUnit`,
      `note`, `date`.
- [ ] Tras crear una entrada, `exercise.weightGrams` y `exercise.weightUnit` reflejan
      el valor del registro con fecha más reciente.
- [ ] `GET /api/exercises/:exerciseId/weight-history` devuelve `200` con el array de
      entradas ordenado por `date` descendente.
- [ ] `PATCH /api/exercises/:exerciseId/weight-history/:entryId` actualiza solo los
      campos enviados y devuelve `200` con la entrada actualizada.
- [ ] Tras editar una entrada, `exercise.weightGrams` se resincroniza correctamente.
- [ ] `DELETE /api/exercises/:exerciseId/weight-history/:entryId` devuelve `200` y
      elimina la entrada. Si quedan otras entradas, `exercise.weightGrams` se actualiza
      al registro más reciente restante.
- [ ] Cualquier endpoint con un `exerciseId` que no pertenece al usuario autenticado
      devuelve `403` o `404`.
- [ ] Un `entryId` que no pertenece al `exerciseId` indicado devuelve `404`.
- [ ] Requests sin JWT devuelven `401`.
- [ ] `weight <= 0` o `weightUnit` fuera del enum devuelven `400`.
- [ ] Al eliminar un ejercicio, su historial completo se elimina en cascada (sin huérfanos).

---

## Decisions Taken and Discarded

- **Ruta anidada vs plana:** Se eligió la ruta anidada
  (`/exercises/:exerciseId/weight-history`) porque deja el ownership explícito en la URL
  y es consistente con la jerarquía del dominio. Ruta plana descartada.

- **Almacenamiento en gramos:** Se almacena `weightGrams` internamente (igual que
  `Exercise.weightGrams`) y se conserva `weightUnit` como referencia de la unidad
  enviada por el cliente. Guardar solo el valor crudo sin convertir fue descartado
  para mantener consistencia con el resto del sistema.

- **Sincronización de `exercise.weightGrams`:** Al crear, editar o eliminar una entrada,
  el campo `weightGrams` del ejercicio se actualiza automáticamente al valor del registro
  más reciente por fecha. Se descartó dejar ese campo desacoplado del historial porque
  el frontend lo usa como "peso principal" del ejercicio.

- **Sin endpoint `GET /:entryId`:** No hay caso de uso en el frontend que requiera leer
  una sola entrada; se descartó para no agregar superficie innecesaria.

- **Sin paginación:** El historial de un ejercicio se devuelve completo. Se descartó
  paginar por simplicidad; si el historial crece significativamente en el futuro,
  se puede agregar en un spec separado.

- **`syncExerciseWeight` no modifica si no quedan entradas:** Si se elimina la última
  entrada del historial, `exercise.weightGrams` conserva su valor anterior. Resetear
  a 0 fue descartado porque podría romper la UI que usa ese valor como referencia.
