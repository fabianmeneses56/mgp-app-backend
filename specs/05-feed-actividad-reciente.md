# Spec 05 — Feed de actividad reciente

- **Estado:** Approved
- **Dependencias:** spec 01 (weight-history), patrón de eventos ya implementado
  (`@nestjs/event-emitter`, PR #7)
- **Fecha:** 2026-08-14

**Objetivo:** Exponer `GET /api/activity`, un endpoint que devuelve las últimas
creaciones y ediciones de categorías, ejercicios y entradas de peso del usuario
autenticado, todas con un mismo shape de respuesta, alimentado por una tabla
`activity_log` que se llena vía eventos.

---

## Alcance

### Incluye

- Nuevo módulo `activity` (`src/activity/`) con entity, service, controller,
  listener y evento, siguiendo el shape estándar de módulos del proyecto.
- Nueva tabla `activity_log` (entidad `ActivityLog`) donde cada creación o
  edición inserta una fila con snapshot mínimo (descripción y, para pesos,
  valor), scopeada al usuario.
- Un único evento `activity.recorded` (constante + clase de payload en
  `src/activity/events/`), emitido con `emit()` (fire-and-forget) desde:
  - `CategoriesService` — `create` y `update`.
  - `ExercisesService` — `create` y `update`.
  - `WeightHistoryService` — `create` y `update`.
- `ActivityListener` (`@OnEvent`, `async: true`) que inserta la fila; si el
  insert falla, la operación principal no se ve afectada.
- `GET /api/activity?limit=N` — protegido con `@Auth()`, devuelve la actividad
  del usuario ordenada por `createdAt DESC`. `limit` opcional, default 20,
  máximo 50; fuera de rango o no numérico → `400`.
- DTO de query (`FindActivityDto`) con validación `class-validator`.
- Migración generada con `yarn migration:generate` para la tabla nueva
  (producción corre con `synchronize: false`).
- Tests unitarios de `ActivityService` y del listener, siguiendo el patrón de
  mocks de la spec 04.

### No incluye

- Registro de **eliminaciones** (acordado: solo creaciones y ediciones).
- Cambios derivados/automáticos: el sync de `exercise.weightGrams` disparado
  por weight-history **no** genera fila propia — una acción del usuario, una fila.
- Backfill de datos existentes: el feed empieza vacío en producción.
- Paginación con `offset`/cursor — solo `limit`.
- Filtros por tipo (`?type=exercise`), rangos de fecha o búsqueda.
- Purga/retención de filas viejas del log.
- Endpoints de escritura sobre `activity_log` (solo se escribe vía listener).
- Cambios en las entidades existentes (`Category`, `Exercise`, `WeightHistory`
  no ganan columnas `createdAt` — el timestamp vive en `activity_log`).

---

## Modelo de datos

### Nueva entidad: `ActivityLog` (`src/activity/entities/activity-log.entity.ts`)

```ts
export enum ActivityType {
  CATEGORY = 'category',
  EXERCISE = 'exercise',
  WEIGHT_HISTORY = 'weight_history',
}

export enum ActivityAction {
  CREATED = 'created',
  UPDATED = 'updated',
}

@Entity({ name: 'activity_log' })
@Index(['user', 'createdAt'])
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: ActivityType })
  type!: ActivityType;

  @Column({ type: 'enum', enum: ActivityAction })
  action!: ActivityAction;

  // id del recurso que originó la actividad (no es FK: si el recurso
  // se borra después, la fila del feed sobrevive)
  @Column({ type: 'uuid' })
  entityId!: string;

  // snapshot del nombre al momento de la acción (para weight_history,
  // el nombre del ejercicio al que pertenece la entrada)
  @Column({ type: 'text' })
  description!: string;

  // solo para type = weight_history; null en el resto
  @Column({ type: 'integer', nullable: true })
  weightGrams!: number | null;

  @Column({ type: 'enum', enum: WeightUnit, nullable: true })
  weightUnit!: WeightUnit | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
```

### Evento: `src/activity/events/activity-recorded.event.ts`

```ts
export const ACTIVITY_RECORDED = 'activity.recorded';

export class ActivityRecordedEvent {
  constructor(
    public readonly userId: string,
    public readonly type: ActivityType,
    public readonly action: ActivityAction,
    public readonly entityId: string,
    public readonly description: string,
    public readonly weightGrams: number | null = null,
    public readonly weightUnit: WeightUnit | null = null,
  ) {}
}
```

### DTO de query: `src/activity/dto/find-activity.dto.ts`

- `limit?: number` — `@IsOptional() @IsInt() @Min(1) @Max(50) @Type(() => Number)`.
  Default 20 (aplicado en el service).

### Shape de respuesta (`GET /api/activity`)

Array de items, todos con el mismo shape (campos de peso en `null` cuando no aplican):

```json
[
  {
    "id": "uuid",
    "type": "weight_history",
    "action": "created",
    "entityId": "uuid-del-item",
    "description": "Press banca",
    "weightGrams": 80000,
    "weightUnit": "kg",
    "createdAt": "2026-08-14T10:30:00.000Z"
  },
  {
    "id": "uuid",
    "type": "category",
    "action": "updated",
    "entityId": "uuid-del-item",
    "description": "Pecho",
    "weightGrams": null,
    "weightUnit": null,
    "createdAt": "2026-08-14T09:12:00.000Z"
  }
]
```

### Notas

- `WeightUnit` se reutiliza de `src/exercises/enums/weight-unit.enum.ts`.
- `entityId` deliberadamente **no** es FK: el feed es un log inmutable y no debe
  romperse ni vaciarse cuando se borra el recurso original.
- El índice compuesto `(user, createdAt)` cubre la única query del endpoint
  (filtrar por usuario, ordenar por fecha desc).
- La relación con `User` sí es FK con `CASCADE`: si se borra un usuario, su
  actividad no debe quedar huérfana.

---

## Plan de implementación

Cada paso deja la app arrancando (`yarn start:dev`) y `yarn test` en verde.

1. **Esqueleto del módulo `activity`.** Crear `ActivityLog` (entidad + enums),
   `activity-recorded.event.ts`, y `ActivityModule` con
   `TypeOrmModule.forFeature([ActivityLog])` e importando `AuthModule`.
   Registrarlo en `AppModule`. Verificar que `synchronize: true` crea la tabla
   `activity_log` localmente.

2. **`ActivityService`** (`src/activity/activity.service.ts`) con dos métodos:
   - `record(event: ActivityRecordedEvent)` — crea y guarda la fila mapeando
     el payload del evento (`user: { id: event.userId }`).
   - `findAllByUser(user, limit)` — `find` con `where: { user: { id } }`,
     `order: { createdAt: 'DESC' }`, `take: limit` (default 20).

3. **`ActivityListener`** (`src/activity/listeners/activity.listener.ts`) —
   `@OnEvent(ACTIVITY_RECORDED, { async: true })`, delega en
   `activityService.record()` y captura/loguea errores con `Logger`: un insert
   fallido del log jamás rompe ni ensucia la operación principal.

4. **Controller + DTO.** `FindActivityDto` y `ActivityController` con
   `GET /activity` (`@Auth()`, `@GetUser()`), que delega en `findAllByUser`.
   Verificar a mano: el endpoint responde `[]` con un JWT válido y `401` sin él.

5. **Emisión desde `CategoriesService`.** En `create` y `update`, tras el
   `save` exitoso, `eventEmitter.emit(ACTIVITY_RECORDED, new ActivityRecordedEvent(...))`
   con `type: CATEGORY` y `description: category.name` (el nombre resultante,
   no el previo).

6. **Emisión desde `ExercisesService`.** En `create` y `update`, **después de
   `commitTransaction()`** (nunca dentro de la transacción: si luego hay
   rollback quedaría actividad fantasma), con `type: EXERCISE` y
   `description: exercise.name`. Ya inyecta `EventEmitter2`, no hay wiring nuevo.

7. **Emisión desde `WeightHistoryService`.** En `create` y `update`, tras el
   save exitoso, con `type: WEIGHT_HISTORY`, `entityId: entry.id`,
   `description: exercise.name` (el ejercicio ya está cargado para validar
   ownership), y `weightGrams`/`weightUnit` finales de la entrada. El evento
   `weight-history.latest-changed` existente no se toca — son dos eventos
   con propósitos distintos.

8. **Migración.** Con el Postgres local arriba:
   `yarn migration:generate src/migrations/AddActivityLog`, revisar el archivo
   generado (tabla, enums, índice, FK a users) y commitearlo.

9. **Tests unitarios**, patrón de la spec 04 (mocks inline con `jest.fn()`):
   - `src/activity/activity.service.spec.ts` — `record` mapea el evento a la
     entidad; `findAllByUser` filtra por usuario, ordena desc y aplica
     default 20 / límite recibido.
   - `src/activity/listeners/activity.listener.spec.ts` — delega en `record`
     y no propaga si `record` rechaza.
   - En los specs existentes de los tres services: los métodos `create`/`update`
     emiten `ACTIVITY_RECORDED` con el payload correcto, y los caminos de error
     (rollback, excepción) **no** emiten.

---

## Criterios de aceptación

- [ ] `GET /api/activity` con JWT válido devuelve `200` con un array donde cada
      item tiene exactamente `id`, `type`, `action`, `entityId`, `description`,
      `weightGrams`, `weightUnit`, `createdAt` — mismo shape para los tres tipos.
- [ ] Sin JWT devuelve `401`.
- [ ] El feed solo contiene actividad del usuario autenticado: la actividad de
      otro usuario nunca aparece.
- [ ] Los items vienen ordenados por `createdAt` descendente.
- [ ] Sin `?limit` devuelve como máximo 20 items; `?limit=5` devuelve como
      máximo 5; `?limit=0`, `?limit=51` y `?limit=abc` devuelven `400`.
- [ ] Crear una categoría, un ejercicio y una entrada de peso genera una fila
      cada uno con `action: "created"`; editarlos genera `action: "updated"`.
- [ ] Una entrada de peso registra `description` con el nombre del ejercicio y
      sus `weightGrams`/`weightUnit`; categorías y ejercicios llevan esos dos
      campos en `null`.
- [ ] Crear/editar una entrada de peso genera **exactamente una** fila (el sync
      de `exercise.weightGrams` no genera fila propia).
- [ ] Un `create` de ejercicio que termina en rollback no deja ninguna fila en
      `activity_log`.
- [ ] Borrar el recurso original (ejercicio, categoría o entrada) no borra ni
      altera sus filas de actividad ya registradas.
- [ ] Si el insert del log falla, el endpoint que originó la acción responde
      igual que hoy (el error solo se loguea).
- [ ] Existe `src/migrations/*-AddActivityLog.ts` commiteada y `yarn build` pasa.
- [ ] `yarn test` y `yarn lint` en verde, incluyendo los specs nuevos de
      `activity` y las aserciones de emisión agregadas a los specs existentes.

---

## Decisiones tomadas y descartadas

- **Tabla `activity_log` vs consulta UNION al vuelo** — se eligió la tabla
  dedicada. La alternativa (agregar `createdAt` a las tres entidades y unir las
  tablas en la query) solo puede mostrar creaciones, no ediciones, y la query
  crece con cada tipo nuevo. Con la tabla, el endpoint es un `find` simple y
  agregar un tipo futuro es solo emitir un evento más.

- **Eventos + listener vs llamada directa a `ActivityService`** — se eligió el
  evento único `activity.recorded`, siguiendo el patrón observer ya presente en
  el proyecto (PR #7). La llamada directa acoplaría los tres módulos de dominio
  al de actividad. Consecuencia asumida: el registro es best-effort — con
  `emit()` fire-and-forget, una fila puede perderse si el insert falla, y eso
  es aceptable para un feed informativo.

- **Snapshot mínimo vs solo referencia** — cada fila guarda `description` (y
  peso cuando aplica) al momento de la acción. Se descartó guardar solo
  `entityId` y resolver el nombre al leer: obligaría a joins polimórficos y el
  feed quedaría roto al renombrar o borrar el recurso. El snapshot hace al log
  inmutable y autosuficiente. Costo asumido: un rename posterior no se refleja
  en filas viejas — correcto para un historial.

- **`entityId` sin FK** — a propósito, para que borrar un recurso no borre su
  rastro del feed. La FK a `users` sí existe (con `CASCADE`) porque la
  actividad de un usuario eliminado no tiene valor.

- **Solo creaciones y ediciones, sin borrados** — pedido del usuario. Si se
  quieren borrados después, el modelo ya lo soporta (agregar `DELETED` al enum
  y emitir en los `remove`) en una spec propia.

- **Una fila por acción del usuario** — los cambios derivados (sync de
  `exercise.weightGrams` al registrar un peso) no generan fila. El feed narra
  lo que el usuario hizo, no lo que el sistema propagó.

- **Emisión post-commit en `ExercisesService`** — el evento se emite después de
  `commitTransaction()`, nunca dentro. Insertar el log dentro de la transacción
  fue descartado: acoplaría el log a la transacción de dominio y un fallo del
  log podría tumbar la operación real.

- **`limit` con tope 50, sin `offset`** — el caso de uso es una pantalla de
  "actividad reciente", no navegar todo el historial. Paginación completa, si
  hace falta, va en spec propia.

- **Sin backfill ni retención** — el feed empieza vacío al deployar y las filas
  no se purgan. Con un solo usuario real, el volumen no justifica retención;
  si el log crece demasiado, la purga es una spec futura.

- **Ruta plana `GET /api/activity`** — el scope al usuario ya lo da el JWT;
  anidar bajo `/users/me/` solo agregaría verbosidad.

---

## Riesgos identificados

| Riesgo | Mitigación |
| --- | --- |
| **Registro best-effort: filas perdidas en silencio.** Con `emit()` fire-and-forget, si el insert del log falla la operación de dominio igual responde `200` y el usuario nunca se entera de que la actividad no quedó registrada. | Asumido a cambio del desacople. El listener loguea el error con `Logger` incluyendo `type`, `action` y `entityId`, así que la pérdida queda rastreable en los logs del VPS aunque no llegue al cliente. |
| **Crecimiento sin techo de `activity_log`.** Cada creación y edición inserta una fila y nada las borra nunca. | El índice `(user, createdAt)` y el `take` acotado a 50 mantienen la query barata sin importar el tamaño de la tabla. Con un solo usuario real el volumen es despreciable; la retención va en spec propia si algún día hace falta. |
| **`description` desincronizada tras un rename.** Renombrar un ejercicio deja las filas viejas mostrando el nombre anterior, lo que puede leerse como un bug. | Es el comportamiento deseado de un log histórico, no un defecto. Queda documentado en decisiones; si el frontend necesitara el nombre actual, tiene `entityId` para resolverlo. |
| **Emisión duplicada o faltante al tocar los services.** Los tres services se modifican en pasos distintos (5, 6 y 7); es fácil emitir en un camino de error o olvidar `update`. | Los tests de la spec 04 se extienden con aserciones explícitas de que los caminos de error (rollback, excepción propagada) **no** emiten, y de que `create`/`update` emiten exactamente una vez. |
| **Migración olvidada.** Producción corre con `synchronize: false`: si la migración no se genera, la tabla no existe en el VPS y el endpoint revienta con `500` en cada request. | Paso 8 explícito en el plan y criterio de aceptación propio. Además el listener captura sus errores, así que una tabla faltante degrada el feed pero no rompe crear ejercicios ni pesos. |
