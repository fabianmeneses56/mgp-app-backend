# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `yarn start:dev` — run the app in watch mode (requires Postgres up, see below)
- `yarn build` — `nest build`
- `yarn lint` — eslint with `--fix` over `src`, `apps`, `libs`, `test`
- `yarn test` — unit tests (jest, rootDir `src`, matches `*.spec.ts`)
- `yarn test:watch` / `yarn test:cov` — watch mode / coverage
- `yarn test:e2e` — e2e tests via `test/jest-e2e.json`
- Run a single test file: `yarn test src/auth/auth.service.spec.ts`
- Run a single test by name: `yarn test -t "test name"`
- `docker-compose up -d` — starts the Postgres 14.3 container (`mgpdb`) that the app connects to; reads `DB_PASSWORD`/`DB_NAME` from `.env`

## Environment

The app expects a `.env` file with `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `PORT`, `HOST_API`, `JWT_SECRET`. `TypeOrmModule.forRoot` runs with `synchronize: true` and `autoLoadEntities: true` (see `src/app.module.ts`), so entity changes apply to the DB schema automatically on boot — there are no migrations.

## Architecture

NestJS REST API with a global `api` prefix (`src/main.ts`) and a global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`) — DTOs must declare every accepted field with `class-validator` decorators or requests get rejected. Static file serving for uploaded images is mounted at `/uploads` from `static/uploads`.

Three feature modules, each following the standard Nest CRUD module shape (`*.module.ts` / `*.controller.ts` / `*.service.ts` / `dto/` / `entities/`):

- **auth** — user registration/login/JWT issuing, plus the auth building blocks every other module relies on (see below).
- **categories** — owned by a `User` via `ManyToOne`; a category has many `Exercise`s.
- **exercises** — owned indirectly through their `Category`, which is in turn scoped to the requesting user.

### Auth pattern (`src/auth`)

Authorization is JWT-based via Passport (`JwtStrategy` in `strategies/jwt.strategy.ts`), composed through a single decorator:

- `@Auth(...roles: ValidRoles[])` (`decorators/auth.decorator.ts`) combines `RoleProtected` (sets role metadata) with `UseGuards(AuthGuard(), UserRoleGuard)`. Use this on any route that requires a logged-in user; pass `ValidRoles` values to restrict by role (no roles passed = any authenticated user).
- `@GetUser()` (`decorators/get-user.decorator.ts`) pulls the authenticated `User` off the request (populated by `JwtStrategy.validate`); `@GetUser('email')` extracts a single field.
- `ValidRoles` enum (`interfaces/valid-roles.ts`): `admin`, `super-user`, `user`. `User.roles` is a Postgres text array column defaulting to `['user']`.
- Other modules import `AuthModule` (which exports `TypeOrmModule`, `JwtStrategy`, `PassportModule`, `JwtModule`) to get access to these guards/decorators and the `User` entity/repository.

### Ownership scoping

Resources are scoped to the authenticated user rather than enforced by a global guard:

- `CategoriesService` filters/sets `user` directly on category rows.
- `ExercisesService.getUserCategory()` re-validates that the `category` referenced in a create/update DTO actually belongs to the requesting user before attaching it to the exercise — this is the main place ownership leaks would happen if changed carelessly.

### File uploads (exercises)

`ExercisesController` uses `FileInterceptor('image', ...)` with a local `diskStorage` config (`exercises.controller.ts`) writing into `static/uploads/exercises`, filenames randomized via `randomUUID()`, restricted to jpeg/png/webp and 5MB. `ExercisesService` deletes the on-disk file when a DB write fails after upload, and when an exercise's image is replaced or the exercise is removed (`deleteImageIfExists`/`extractFilename`).

### Units

`Exercise.weightGrams` is the canonical stored value; `weightUnit` (`g`/`kg`/`lb`) is just the unit the client submitted. `ExercisesService.convertWeightToGrams()` is the single place that converts incoming `weight`+`weightUnit` to grams — always go through it rather than writing to `weightGrams` directly.
