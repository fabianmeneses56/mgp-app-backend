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

The app expects a `.env` file with `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `PORT`, `HOST_API`, `JWT_SECRET`, `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_URL`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`. `TypeOrmModule.forRoot` runs with `synchronize: true` and `autoLoadEntities: true` (see `src/app.module.ts`), so entity changes apply to the DB schema automatically on boot — there are no migrations.

## Architecture

NestJS REST API with a global `api` prefix (`src/main.ts`) and a global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`) — DTOs must declare every accepted field with `class-validator` decorators or requests get rejected. Exercise images are uploaded to Cloudflare R2 (see below), not served from local disk.

Four feature modules/providers, each following the standard Nest CRUD module shape (`*.module.ts` / `*.controller.ts` / `*.service.ts` / `dto/` / `entities/`) where applicable:

- **auth** — user registration/login/JWT issuing, plus the auth building blocks every other module relies on (see below).
- **categories** — owned by a `User` via `ManyToOne`; a category has many `Exercise`s.
- **exercises** — owned indirectly through their `Category`, which is in turn scoped to the requesting user.
- **cloudflare-r2** — global module (`CloudflareR2Module`) exporting `CloudflareR2Service`, wraps the S3-compatible R2 client used for exercise image storage.

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

### File uploads (exercises → Cloudflare R2)

`ExercisesController` uses `FileInterceptor('image', ...)` with `memoryStorage()` (`exercises.controller.ts`), restricted to jpeg/png/webp and 5MB, so the file arrives as an in-memory `Buffer` (`image.buffer`) rather than a path on disk. `ExercisesService` uploads that buffer to R2 via `CloudflareR2Service.uploadFile(key, buffer, mimetype)`, with keys built as `exercises/<uuid><ext>` (`buildImageKey`), and stores the returned public URL in `Exercise.imageUrl`. `CloudflareR2Service` (`src/cloudflare-r2/cloudflare-r2.service.ts`) wraps an S3-compatible client (`@aws-sdk/client-s3`) pointed at the R2 endpoint, configured via `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_URL`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`. `ExercisesService` deletes the R2 object when a DB write fails after upload, when an exercise's image is replaced, or when the exercise is removed — the key is recovered from the stored URL via `extractKeyFromUrl` (strips the configured public URL prefix).

### Units

`Exercise.weightGrams` is the canonical stored value; `weightUnit` (`g`/`kg`/`lb`) is just the unit the client submitted. `ExercisesService.convertWeightToGrams()` is the single place that converts incoming `weight`+`weightUnit` to grams — always go through it rather than writing to `weightGrams` directly.
