---
id: 02
title: Cloudflare R2 — Subida de imágenes de ejercicios a object storage
state: Implemented
date: 2026-07-01
depends_on: exercises (módulo existente)
---

**Objetivo:** Reemplazar el almacenamiento local de imágenes de ejercicios
(`static/uploads/exercises`) por Cloudflare R2, eliminando la capa de disco local
y guardando en `exercise.imageUrl` la URL pública del objeto en R2.

---

## Scope

### Incluido

- Nuevo módulo compartido `cloudflare-r2` con un `CloudflareR2Service` que encapsula
  `PutObjectCommand` y `DeleteObjectCommand` del SDK de AWS v3 (compatible con R2).
- Reemplazo de `diskStorage` por `memoryStorage` en el `FileInterceptor` de
  `ExercisesController` — el archivo nunca toca el disco local.
- `ExercisesService` delega upload y delete a `CloudflareR2Service` en lugar de
  operar sobre el filesystem.
- `exercise.imageUrl` pasa a guardar la URL pública de R2
  (`${CLOUDFLARE_R2_PUBLIC_URL}/${key}`).
- Variables de entorno nuevas documentadas en el `.env` (con valores placeholder):
  `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`,
  `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME`,
  `CLOUDFLARE_R2_PUBLIC_URL`.
- Eliminación de toda la lógica de disco local en `ExercisesService`
  (`deleteImageIfExists`, `extractFilename`, imports de `fs/promises`).
- Eliminación del middleware `ServeStaticModule` o `useStaticAssets` de `main.ts`
  que sirve `/uploads`.

### No incluido

- Migración de imágenes existentes en `static/uploads/exercises` (se descartan).
- Dominio custom en R2 (se usa el endpoint público de R2 directo).
- Signed URLs / acceso privado.
- Subida de imágenes en módulos distintos a `exercises`.
- Transformaciones de imagen (resize, compresión, etc.).
- Validación de dimensiones o resolución de la imagen.

---

## Data Model

No se introducen entidades ni columnas nuevas.

### Cambio en `exercise.imageUrl`

| Antes                           | Después                                       |
| ------------------------------- | --------------------------------------------- |
| `/uploads/exercises/{uuid}.jpg` | `https://pub-xxx.r2.dev/exercises/{uuid}.jpg` |

El tipo y la nulabilidad de la columna no cambian. TypeORM no requiere ninguna acción
de schema; `synchronize: true` no genera ninguna migración.

### Variables de entorno nuevas (`.env`)

```env
CLOUDFLARE_R2_ACCOUNT_ID=placeholder
CLOUDFLARE_R2_ACCESS_KEY_ID=placeholder
CLOUDFLARE_R2_SECRET_ACCESS_KEY=placeholder
CLOUDFLARE_R2_BUCKET_NAME=placeholder
CLOUDFLARE_R2_PUBLIC_URL=https://pub-placeholder.r2.dev
```

---

## Implementation Plan

1. **Instalar dependencias**
   - Añadir `@aws-sdk/client-s3` al proyecto (`yarn add @aws-sdk/client-s3`).

2. **Crear `CloudflareR2Module`** en `src/cloudflare-r2/`:
   - `cloudflare-r2.service.ts` — servicio con dos métodos públicos:
     - `uploadFile(key: string, buffer: Buffer, mimetype: string): Promise<string>`
       — ejecuta `PutObjectCommand` y devuelve la URL pública
       (`${CLOUDFLARE_R2_PUBLIC_URL}/${key}`).
     - `deleteFile(key: string): Promise<void>` — ejecuta `DeleteObjectCommand`;
       si el objeto no existe, no lanza error.
   - El cliente S3 se instancia en el constructor usando las variables de entorno.
   - `cloudflare-r2.module.ts` — `@Global()` + exporta `CloudflareR2Service`
     para que cualquier módulo lo inyecte sin importar el módulo explícitamente.

3. **Registrar `CloudflareR2Module`** en `AppModule`.

4. **Actualizar `ExercisesController`**:
   - Reemplazar `diskStorage` por `memoryStorage` (de `multer`).
   - El tipo del parámetro `image` cambia de `{ filename: string }` a
     `Express.Multer.File`.

5. **Actualizar `ExercisesService`**:
   - Inyectar `CloudflareR2Service`.
   - En `create`: si llega `image`, llamar a
     `cloudflareR2Service.uploadFile(`exercises/${randomUUID()}${ext}`, buffer, mimetype)`.
     Guardar la URL devuelta en `imageUrl`. Si el save de DB falla, llamar a
     `cloudflareR2Service.deleteFile(key)` para hacer rollback.
   - En `update`: igual que create para la imagen nueva. Si el save de DB tiene éxito
     y había imagen anterior, llamar a `deleteFile` con la key extraída de la URL anterior.
     Si el save falla, hacer rollback de la imagen nueva.
   - En `remove`: si el ejercicio tiene `imageUrl`, llamar a `deleteFile` con la key
     extraída de la URL.
   - Eliminar `deleteImageIfExists`, `extractFilename` y los imports de `fs/promises`
     y `path`.

6. **Extraer la key desde la URL pública**:
   - La key es el segmento de la URL después del dominio público:
     `imageUrl.replace(CLOUDFLARE_R2_PUBLIC_URL + '/', '')`.
   - Esta lógica va en un método privado de `ExercisesService`.

7. **Eliminar el middleware de archivos estáticos** que sirve `/uploads` en `main.ts`
   (o en el módulo donde esté configurado).

8. **Añadir las cinco variables al `.env`** con valores placeholder y documentarlas.

9. **Verificar** arrancando la app con `yarn start:dev` que no hay errores de
   compilación y que `POST /api/exercises` con imagen devuelve una URL de R2 en
   `imageUrl` (requiere credenciales reales para prueba end-to-end).

---

## Acceptance Criteria

- [ ] `POST /api/exercises` con una imagen válida devuelve `201` y `imageUrl` contiene
      una URL que empieza por `CLOUDFLARE_R2_PUBLIC_URL` (no por `/uploads`).
- [ ] `PATCH /api/exercises/:id` con una imagen nueva reemplaza `imageUrl` por la nueva
      URL de R2 y elimina el objeto anterior de R2.
- [ ] `DELETE /api/exercises/:id` elimina el objeto de R2 asociado al ejercicio.
- [ ] Si el save de DB falla tras subir la imagen, el objeto recién subido a R2 se
      elimina (rollback).
- [ ] `POST /api/exercises` sin imagen devuelve `201` con `imageUrl: null` — el flujo
      sin imagen no está roto.
- [ ] Archivos con mimetype distinto a jpeg/png/webp devuelven `400`.
- [ ] Archivos mayores a 5 MB devuelven `400`.
- [ ] La app arranca sin errores cuando las variables de entorno de R2 tienen valores
      placeholder (el cliente S3 se instancia pero no se usa hasta que llega una request).
- [ ] No existe ninguna referencia a `diskStorage`, `fs/promises`, ni a
      `static/uploads` en el módulo de exercises tras el cambio.
- [ ] El endpoint `/uploads/...` ya no está montado en la app.

---

## Decisions Taken and Discarded

- **`memoryStorage` en lugar de `diskStorage`:** El archivo se mantiene en memoria
  durante el request y se sube directamente a R2 sin tocar el disco local. Se descartó
  escribir primero a disco y luego hacer upload porque agrega un paso innecesario y
  complejidad de limpieza.

- **Patrón server-side proxy en lugar de presigned URLs:** El archivo pasa por NestJS
  (client → servidor → R2). Se descartó el patrón de presigned URL (client → R2
  directamente) porque requiere dos round-trips del cliente, manejo de objetos huérfanos
  y mayor complejidad. Para un proyecto personal con tráfico bajo, el proxy es la
  elección correcta.

- **`CloudflareR2Module` global y compartido:** Se creó un módulo `@Global()` en lugar
  de meter la lógica de R2 directamente en `ExercisesService`, para que otros módulos
  puedan inyectar `CloudflareR2Service` en el futuro sin importar el módulo
  explícitamente. Se descartó encapsularlo en exercises porque anticipa que categories
  u otros módulos puedan necesitar subida de imágenes.

- **Key con prefijo `exercises/`:** Los objetos se guardan bajo el prefijo
  `exercises/{uuid}.ext` dentro del bucket. Facilita organizar objetos por tipo de
  recurso si en el futuro se agregan imágenes en otros módulos. Se descartó usar
  la raíz del bucket sin prefijo.

- **URL pública directa de R2 (sin dominio custom):** Se almacena la URL pública del
  bucket de R2 tal cual. Se descartó un dominio custom porque aún no está configurado;
  cuando se añada, bastará con actualizar `CLOUDFLARE_R2_PUBLIC_URL` en `.env` sin
  tocar el código.

- **No migración de imágenes existentes:** Las imágenes en `static/uploads/exercises`
  se descartan. Migrarlas fue descartado porque el usuario confirmó que no tienen valor
  y agregan complejidad innecesaria al spec.

- **Rollback manual en caso de error de DB:** Si el save falla tras subir la imagen,
  se llama a `deleteFile` para limpiar R2. Se descartó usar transacciones distribuidas
  porque la atomicidad entre R2 y Postgres no es un requisito en este contexto.

---

## Identified Risks

- **Presión de memoria en uploads concurrentes:** Con `memoryStorage`, cada archivo
  ocupa hasta 5 MB en RAM durante el request. Para un proyecto personal con tráfico
  bajo esto no es un problema, pero hay que tenerlo en cuenta si el uso escala.

- **Objetos huérfanos en R2:** Si el servidor sube la imagen a R2 pero luego se cae
  antes de hacer el rollback (error de DB + crash), el objeto queda en R2 sin referencia
  en la BD. Mitigación: el tamaño máximo es 5 MB y en un proyecto personal el volumen
  es bajo — se acepta el riesgo sin añadir un job de limpieza.

- **Credenciales de R2 no configuradas en producción:** Si las variables de entorno
  quedan con valor `placeholder`, cualquier upload fallará en runtime con un error del
  SDK. La app arranca sin error pero el fallo aparece en la primera request con imagen.
