# Spec 04 — Base de tests unitarios de services

- **Estado:** Implemented
- **Dependencias:** ninguna (usa `jest`, `ts-jest` y `@nestjs/testing`, ya instalados)
- **Fecha:** 2026-08-05

**Objetivo:** Establecer una base de tests unitarios con Jest para los cuatro services del proyecto y la utilidad `convertWeightToGrams`, ejecutada como paso bloqueante del job `ci` en GitHub Actions.

---

## Alcance

### Incluye

- **Arreglar la config de jest** en `package.json`: agregar `moduleNameMapper: { "^src/(.*)$": "<rootDir>/$1" }` para que los imports absolutos `src/...` resuelvan. Sin esto no corre ningún test.
- **Borrar `test/app.e2e-spec.ts`** — prueba un `GET /` con `'Hello World!'` que no existe (no hay `app.controller.ts`).
- **Borrar `src/auth/auth.controller.spec.ts`** — es scaffold roto y los controllers quedan fuera de alcance.
- **Reescribir `src/auth/auth.service.spec.ts`** como test real de `AuthService`: `create`, `login`, `checkAuthStatus` y el manejo del error `23505`.
- **Crear cuatro archivos de test nuevos**:
  - `src/categories/categories.service.spec.ts`
  - `src/exercises/exercises.service.spec.ts`
  - `src/weight-history/weight-history.service.spec.ts`
  - `src/exercises/utils/convert-weight.spec.ts`
- **Mocks manuales inline con `jest.fn()`** en cada archivo, incluido el `QueryRunner` de `ExercisesService`. Cero dependencias nuevas, cero helpers compartidos.
- **Step `yarn test` en el job `ci`** de `.github/workflows/deploy.yml`. Como `deploy` declara `needs: ci`, un test rojo bloquea el deploy al VPS.

### No incluye

- Tests e2e ni de integración contra Postgres real. `test/jest-e2e.json` queda en el repo sin ningún archivo que lo use.
- Tests de controllers (`AuthController`, `CategoriesController`, `ExercisesController`, `WeightHistoryController`).
- Tests de `UserRoleGuard`, `JwtStrategy` y los decoradores `@Auth` / `@GetUser`.
- Tests de `CloudflareR2Service` y `BcryptPasswordHasher` — son wrappers de SDK/librería.
- Tests del decorador `LogExecutionTime`.
- Tests de validación de DTOs (`class-validator`).
- **`ExercisesService.findAll()` y `CategoriesService.findAllByUser()`** — quedan sin cobertura hasta que se corrija su comportamiento, en otra spec.
- Umbral de cobertura (`jest.coverageThreshold`). No se configura ninguno.
- Cualquier cambio al código de producción. Si un test revela un bug, se anota, no se arregla acá.
- Migrar los imports absolutos `src/...` a rutas relativas.

---

## Modelo de datos

Esta spec no introduce ni modifica entidades, DTOs, columnas ni migraciones. No hay nada que tocar en la base de datos.

Lo único que "aparece" son las estructuras de los dobles de prueba. Se definen inline en cada archivo, sin tipos compartidos.

### Mock de repositorio

Un objeto plano con solo los métodos que el service bajo prueba llama:

```ts
const categoryRepository = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  preload: jest.fn(),
  remove: jest.fn(),
};
```

Se inyecta con `getRepositoryToken(Category)` como `provide` en `Test.createTestingModule`.

### Mock del `QueryRunner` (solo `exercises.service.spec.ts`)

```ts
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

const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
```

`dataSource` se inyecta con `getDataSourceToken()`. `isTransactionActive` se muta a `true` en los tests de rollback, porque el `catch` de `create`/`update` lo consulta antes de hacer rollback.

Ojo con `manager.getRepository`: `recordWeightHistory` hace `manager.getRepository(WeightHistory)` y luego llama `create`/`save` sobre **ese** repositorio devuelto. El `jest.fn()` pelado no alcanza — hay que configurarlo para que devuelva un mock de repositorio:

```ts
const historyRepositoryInTx = { create: jest.fn(), save: jest.fn() };
manager.getRepository.mockReturnValue(historyRepositoryInTx);
```

Los asserts de "registra la entrada con el mismo `manager` de la transacción" van contra `historyRepositoryInTx`, no contra el mock de `getRepositoryToken(WeightHistory)`.

### Tokens de inyección por service

| Service                | Providers a mockear                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthService`          | `getRepositoryToken(User)`, `JwtService`, `PasswordHasher`                                                                                               |
| `CategoriesService`    | `getRepositoryToken(Category)`                                                                                                                           |
| `ExercisesService`     | `getRepositoryToken(Exercise)`, `getRepositoryToken(WeightHistory)`, `CategoriesService`, `CloudflareR2Service`, `ConfigService`, `getDataSourceToken()` |
| `WeightHistoryService` | `getRepositoryToken(WeightHistory)`, `getRepositoryToken(Exercise)`                                                                                      |

`convert-weight.spec.ts` no necesita `TestingModule`: importa la función y la llama directo.

### Fixtures

Objetos literales casteados, definidos en cada archivo:

```ts
const user = { id: 'f4b1a2c3-...', email: 'test@test.com' } as User;
```

Sin factories ni builders. Si un test necesita otro usuario, lo declara.

---

## Plan de implementación

Cada paso deja `yarn test` en verde y es commiteable por separado.

### 1. Limpiar la config y los scaffolds rotos

- En `package.json`, dentro de `"jest"`, agregar:
  ```json
  "moduleNameMapper": { "^src/(.*)$": "<rootDir>/$1" }
  ```
- Borrar `test/app.e2e-spec.ts`.
- Borrar `src/auth/auth.controller.spec.ts`.
- Borrar `src/auth/auth.service.spec.ts` (se recrea en el paso 3).
- Crear `src/exercises/utils/convert-weight.spec.ts` en el mismo commit, para que la suite no quede sin ningún test:
  - `WeightUnit.GRAM` redondea (`1500.4` → `1500`).
  - `WeightUnit.KILOGRAM` multiplica por 1000 (`2.5` → `2500`).
  - `WeightUnit.POUND` multiplica por 453.592 y redondea (`1` → `454`, `10` → `4536`).
  - Una unidad fuera del enum cae en `default` y redondea.

**Verificación:** `yarn test` → 1 suite, verde.

### 2. Fijar el patrón en `categories.service.spec.ts`

Es el service más simple con repositorio, así que fija el patrón que copian los demás. Tests:

- `create` → llama `create` con `{ ...dto, user }` y devuelve una copia de la categoría.
- `create` → error con `code: '23505'` → `BadRequestException`.
- `create` → error sin código → `InternalServerErrorException`.
- `findOne` → id que no es UUID → `NotFoundException`, sin tocar el repositorio.
- `findOne` → repositorio devuelve `null` → `NotFoundException`.
- `findOne` → devuelve la categoría encontrada.
- `findOneByUser` → consulta con `where: { id, user: { id: user.id } }`.
- `findOneByUser` → sin resultado → `NotFoundException` con el mensaje `not found for this user`.
- `findOnePlain` → delega en `findOne`.
- `update` → si `findOneByUser` lanza, no se llama `preload` ni `save`.
- `update` → `preload` devuelve `undefined` → `NotFoundException`.
- `update` → camino feliz: `save` y luego `findOne`.
- `remove` → valida propiedad y llama `repository.remove` con la categoría.

**Verificación:** `yarn test src/categories/categories.service.spec.ts`

### 3. Recrear `auth.service.spec.ts`

- `create` → hashea con `passwordHasher.hash`, guarda, y devuelve el usuario **sin** `password` y con `token`.
- `create` → error `23505` → `BadRequestException('Email is already registered')`.
- `create` → error genérico → `InternalServerErrorException`.
- `login` → `findOne` se llama con `select: { email: true, password: true, id: true }`.
- `login` → email inexistente → `UnauthorizedException('Credentials are not valid')`, sin llamar `compare`.
- `login` → password incorrecta → misma excepción y **mismo mensaje** que el caso anterior (no filtrar qué emails existen).
- `login` → credenciales válidas → devuelve el usuario con `token` firmado por `jwtService.sign` con `{ id: user.id }`.
- `checkAuthStatus` → devuelve el usuario recibido más un token nuevo.

**Verificación:** `yarn test src/auth/auth.service.spec.ts`

### 4. `weight-history.service.spec.ts`

- `create` → convierte peso a gramos, `note` ausente queda en `null`, y sincroniza el peso del ejercicio.
- `create` → `exerciseId` no UUID → `NotFoundException`.
- `create` → ejercicio inexistente o de otro usuario → `ForbiddenException`.
- `findAll` → valida propiedad y consulta con `order: { date: 'DESC' }`.
- `update` → solo `weight` → usa el `weightUnit` que ya tenía la entrada.
- `update` → `weight` + `weightUnit` → usa la unidad nueva.
- `update` → solo `note` o solo `date` → no recalcula `weightGrams`.
- `update` → `entryId` que no pertenece al ejercicio → `NotFoundException`.
- `remove` → borra la entrada y sincroniza.
- `syncExerciseWeight` (indirecto) → si no queda ninguna entrada, **no** se llama `exerciseRepository.update`.

**Bug conocido que este último test congela:** al borrar la última entrada del historial, el `return` temprano de `syncExerciseWeight` deja el ejercicio con el peso viejo para siempre. El test documenta el comportamiento actual, no lo avala — el arreglo va en otra spec, junto a `findAll()` y `findAllByUser()`.

**Verificación:** `yarn test src/weight-history/weight-history.service.spec.ts`

### 5. `exercises.service.spec.ts` — parte A: `create`

Incluye el setup del archivo (mocks de repositorios, `CategoriesService`, `CloudflareR2Service`, `ConfigService` y el `QueryRunner`).

- `create` sin imagen → resuelve la categoría con `categoriesService.findOneByUser`, convierte el peso, hace `commitTransaction` y registra una entrada en `WeightHistory` con el mismo `manager` de la transacción.
- `create` con imagen → sube a R2 y la key tiene el formato `exercises/<uuid><ext>` con la extensión de `originalname`.
- `create` → categoría de otro usuario: propaga la excepción de `categoriesService` y **no** sube nada a R2.
- `create` → falla el `save`: `rollbackTransaction`, `deleteFile` con la key subida, y `InternalServerErrorException`.
- `create` → falla con `code: '23505'` → `BadRequestException`.
- `create` → `release()` se llama en todos los caminos, incluido el de error.

**Verificación:** `yarn test src/exercises/exercises.service.spec.ts`

### 6. `exercises.service.spec.ts` — parte B: `findOne`, `update`, `remove`

Setup: los tests de `update` necesitan `exerciseRepository.findOne` mockeado para **dos** llamadas — el service llama `findOne(id, user)` al inicio (validación de ownership) y otra vez al final (`return this.findOne(id, user)`). Usar `mockResolvedValueOnce` encadenado o un `mockResolvedValue` que sirva para ambas.

- `findOne` → id no UUID → `NotFoundException` sin tocar el repositorio.
- `findOne` con `user` → filtra por `category: { user: { id: user.id } }`.
- `findOne` sin `user` → no aplica ese filtro.
- `update` → `weightUnit` sin `weight` → `BadRequestException`.
- `update` → sin `weight` → no registra entrada en `WeightHistory`.
- `update` → con `weight` → sí la registra.
- `update` → imagen nueva sobre una anterior: sube la nueva y borra la anterior con la key extraída vía `CLOUDFLARE_R2_PUBLIC_URL`.
- `update` → `preload` devuelve `undefined` → `NotFoundException`.
- `update` → falla el `save`: rollback, borra **la imagen nueva** y no toca la anterior.
- `remove` → borra el ejercicio y el objeto de R2.
- `remove` → ejercicio sin `imageUrl` → no llama `deleteFile`.

**Verificación:** `yarn test src/exercises`

### 7. Agregar el step de tests al CI

En `.github/workflows/deploy.yml`, job `ci`, después del step `Build`:

```yaml
- name: Test
  run: yarn test
```

Va después de `Build` porque un error de tipos rompe ambos pasos y el build da el diagnóstico más directo.

**Verificación:** abrir un PR contra `main` y ver los cuatro steps en verde (`Install dependencies`, `Lint`, `Build`, `Test`). Como `deploy` declara `needs: ci`, un test rojo frena el deploy al VPS.

---

## Criterios de aceptación

- [ ] `yarn test` termina con código de salida 0 y **0 suites fallidas** en un checkout limpio, sin Postgres corriendo y sin `.env`.
- [ ] Existen exactamente cinco archivos de test: `convert-weight.spec.ts`, `auth.service.spec.ts`, `categories.service.spec.ts`, `exercises.service.spec.ts` y `weight-history.service.spec.ts`.
- [ ] `test/app.e2e-spec.ts` y `src/auth/auth.controller.spec.ts` ya no existen en el repo.
- [ ] `package.json` tiene `moduleNameMapper` con `"^src/(.*)$": "<rootDir>/$1"` dentro de la config `"jest"`.
- [ ] Ningún test abre una conexión a base de datos ni hace una request HTTP real: no hay `TypeOrmModule`, `DataSource` real ni `supertest` en ningún `*.spec.ts`.
- [ ] Ningún test llama a la API de Cloudflare R2: `CloudflareR2Service` está mockeado en `exercises.service.spec.ts`.
- [ ] No se agregó ninguna dependencia nueva a `package.json` (ni `dependencies` ni `devDependencies`).
- [ ] No hay ningún archivo bajo `src/common/testing/` ni ningún helper de mocks compartido entre specs.
- [ ] No existe ningún test que invoque `ExercisesService.findAll()` ni `CategoriesService.findAllByUser()`.
- [ ] `git diff` de esta spec no toca ningún archivo `.service.ts`, `.controller.ts`, `.entity.ts` ni `dto/` — solo `*.spec.ts`, `package.json` y `deploy.yml`.
- [ ] `.github/workflows/deploy.yml` tiene un step `Test` que corre `yarn test` dentro del job `ci`.
- [ ] Un PR contra `main` con un test roto a propósito muestra el job `ci` en rojo y el job `deploy` sin ejecutarse.
- [ ] `yarn test src/exercises/exercises.service.spec.ts` verifica que `queryRunner.release()` se llama tanto en el camino feliz como en el de error.
- [ ] `yarn test src/auth/auth.service.spec.ts` verifica que el mensaje de `UnauthorizedException` es idéntico para email inexistente y para password incorrecta.
- [ ] `yarn lint` pasa sin errores sobre los archivos de test nuevos.

---

## Decisiones tomadas y descartadas

- **Solo tests unitarios de services** — es donde vive la lógica real del proyecto (ownership, conversión de peso, rollback de R2, transacciones) y corren sin infraestructura. Se descartaron los tests e2e contra el Postgres del docker-compose: obligan a levantar la base para correr la suite, y en CI habría que agregar un service container. Si hacen falta, van en su propia spec.

- **Los cuatro services de una sola vez** — se descartó partirlo en dos specs (`exercises` + `categories` primero) porque el costo mayor es fijar el patrón de mocks, y una vez fijado los tres services restantes son repetición.

- **Mocks manuales con `jest.fn()`** — se descartó `@golevelup/ts-jest`. Suma una dependencia para ahorrar unas pocas líneas de boilerplate por archivo, y en un proyecto de cinco specs no se amortiza.

- **Mocks inline, sin helpers compartidos** — cada archivo declara los suyos, incluido el mock de ~20 líneas del `QueryRunner`. Se descartó una factory en `src/common/testing/`: `ExercisesService` es el único service con transacciones, así que ese mock se usaría en un solo archivo. Un helper compartido acopla las specs entre sí y hace que un cambio en un service rompa tests de otro módulo.

- **Fixtures literales casteados (`as User`) en vez de builders** — se descartaron factories tipo `createUserFixture()` por el mismo motivo: acoplamiento entre specs y una capa de indirección que hay que leer antes de entender un test.

- **`moduleNameMapper` en la config de jest** — se descartó convertir los imports absolutos `src/...` a rutas relativas. Serían decenas de archivos de producción tocados en una spec de tests, y el criterio de aceptación dice explícitamente que no se toca código de producción.

- **Borrar los scaffolds en vez de repararlos** — `test/app.e2e-spec.ts` prueba un endpoint que no existe y `auth.controller.spec.ts` es un test de controller, fuera de alcance. Se descartó dejarlos con `describe.skip`: un test skippeado es deuda silenciosa.

- **`yarn test` bloqueante en el job `ci` existente** — se descartó un workflow separado y no bloqueante. Como `deploy` ya declara `needs: ci`, agregar el step ahí es una línea y hace que un test rojo frene el deploy al VPS. Un CI que no bloquea se termina ignorando.

- **Step `Test` después de `Build`** — decisión menor y reversible: si el código no compila, tanto el build como los tests fallan, y el error del build es más directo de leer.

- **Sin `coverageThreshold`** — se descartó configurar un umbral en esta spec. Un umbral sobre una base de tests recién creada obliga a elegir un número arbitrario y a mantenerlo desde el día uno. Se puede agregar en otra spec una vez que la cobertura real se estabilice.

- **`findAll()` de exercises y `findAllByUser()` de categories quedan sin cobertura** — se descartaron las otras dos opciones: testearlos congelaría comportamiento que ya se sabe incorrecto (`findAll` devuelve un string literal, `findAllByUser` devuelve `undefined` con un id no-UUID), y arreglarlos convertiría esta spec en una de refactor, donde un fallo sería ambiguo entre test y cambio de comportamiento.

- **Guards, strategy, decoradores, `CloudflareR2Service` y `BcryptPasswordHasher` fuera de alcance** — son adaptadores finos sobre `passport-jwt`, el SDK de S3 y `bcrypt`. Testearlos verifica sobre todo que la librería de terceros hace lo suyo. `LogExecutionTime` queda fuera por la misma razón: solo mide y loguea.

---

## Riesgos identificados

| Riesgo                                                                                                                                                                                                                       | Mitigación                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tests acoplados a la implementación.** Verificar con `toHaveBeenCalledWith` los argumentos exactos de cada llamada al repositorio hace que un refactor legítimo rompa tests que no describen un bug.                       | Afirmar sobre el valor devuelto o la excepción lanzada por defecto. `toHaveBeenCalledWith` se reserva para lo que sí es contrato: el `select` del login que no expone el hash, el filtro de ownership y el formato de la key de R2. |
| **El mock del `QueryRunner` no es TypeORM.** Los tests de `create`/`update` verifican que se llama `commit`/`rollback`/`release` en el orden correcto, no que la transacción realmente sea atómica en Postgres.              | Se asume explícitamente. La atomicidad real solo la cubre un test de integración, que está fuera de alcance. Los tests no deben leerse como garantía de que la transacción funciona en la base.                                     |
| **Tests dependientes de la fecha.** `ExercisesService.recordWeightHistory` y `WeightHistoryService.create` usan `new Date()`. Comparar contra una fecha construida en el test es una fuente clásica de fallos intermitentes. | Usar `expect.any(Date)` o `jest.useFakeTimers().setSystemTime(...)` en los tests que tocan fechas. Nunca comparar contra `new Date()` calculado dentro del test.                                                                    |
| **CI bloqueante + test intermitente = deploy frenado.** Con `needs: ci`, un test que falla una vez cada diez corridas bloquea un despliegue a producción.                                                                    | Ningún test hace I/O, red ni usa timers reales. La única fuente plausible de intermitencia son las fechas, cubierta arriba. Si aparece un test intermitente, se arregla o se borra — no se le pone `retry`.                         |
| **Falsa sensación de seguridad.** Cubrir los services deja sin red la validación de DTOs, los guards, el wiring de módulos y los controllers. Un cambio que rompa el `@Auth` de una ruta pasa el CI en verde.                | Se documenta acá. La spec no pretende cubrir el request completo; eso requiere tests e2e, en otra spec.                                                                                                                             |

---

## Qué **no** está en esta spec

- Tests e2e o de integración contra Postgres.
- Tests de controllers, guards, `JwtStrategy` y decoradores.
- Tests de `CloudflareR2Service`, `BcryptPasswordHasher` y `LogExecutionTime`.
- Cobertura de `ExercisesService.findAll()` y `CategoriesService.findAllByUser()`.
- Arreglar el comportamiento de esos dos métodos, ni el de `syncExerciseWeight` cuando se borra la última entrada del historial (el ejercicio queda con el peso viejo).
- Umbral de cobertura en `jest.coverageThreshold`.
- Cualquier modificación a código de producción.
- Actualizar `CLAUDE.md`, que hoy dice que el deploy es Railway cuando el workflow real despliega a un VPS.

Cada uno, si se hace, va en su propia spec.
