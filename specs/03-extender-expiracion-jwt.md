# Spec 03 — Extender expiración del JWT

- **Estado:** Implemented
- **Dependencias:** ninguna
- **Fecha:** 2026-07-11

**Objetivo:** Extender la expiración del JWT emitido en login/register/check-status de `2h` a `30d` para que las sesiones no expiren por uso esporádico (una vez al día o menos).

---

## Alcance

### Incluye

- Cambiar `expiresIn: '2h'` a `expiresIn: '30d'` en `JwtModule.registerAsync` (`src/auth/auth.module.ts:28`), el único lugar donde se configura la expiración del JWT.

### No incluye

- Refresh tokens ni ningún endpoint nuevo (descartado; ver spec de frontend `05-manejo-sesion-expirada.md`).
- Cambios a `/auth/check-status`, `/auth/login` ni `/auth/register` más allá del efecto indirecto de que el token que emiten dura más.
- Invalidación server-side de tokens (logout global, blacklist, etc.) — sigue sin existir, igual que hoy.
- Hacer configurable la expiración vía variable de entorno — se hardcodea `'30d'` igual que está hoy hardcodeado `'2h'`, para no ampliar el alcance de este spec.

---

## Modelo de datos

Esta spec no introduce ni modifica estructuras de datos. No hay entidades, DTOs ni tablas afectadas — es un cambio de configuración puntual (`signOptions.expiresIn`) en `JwtModule.registerAsync`.

---

## Plan de implementación

1. **Modificar `src/auth/auth.module.ts`**: cambiar `expiresIn: '2h'` a `expiresIn: '30d'` dentro de `signOptions` en `JwtModule.registerAsync`.

2. **Verificación manual**:
   - Hacer login (`POST /auth/login`) y decodificar el JWT devuelto (ej. en jwt.io) → el claim `exp` debe reflejar ~30 días desde `iat`, no 2 horas.
   - Llamar a `GET /auth/check-status` con un token recién emitido → sigue respondiendo 200 igual que antes (sin regresión).
   - Llamar a `GET /auth/check-status` con un token vencido (o uno firmado con `exp` en el pasado, si se quiere probar sin esperar 30 días) → sigue respondiendo `401 Unauthorized`, comportamiento que el spec de frontend depende para su interceptor.

---

## Criterios de aceptación

- [ ] Un JWT emitido por `POST /auth/login` tiene `exp - iat` ≈ 30 días (2,592,000 segundos).
- [ ] Un JWT emitido por `POST /auth/register` tiene la misma expiración de 30 días (usa el mismo `getJwtToken`).
- [ ] `GET /auth/check-status` sigue devolviendo un nuevo token con la misma expiración de 30 días al reenviarse (mismo comportamiento de hoy, solo con el valor nuevo).
- [ ] Un token con `exp` vencido sigue siendo rechazado con `401 Unauthorized` por `JwtStrategy` — no se relaja la validación de expiración, solo se extiende el plazo.
- [ ] No se modificó ningún otro archivo del módulo de auth (`auth.service.ts`, `auth.controller.ts`, `jwt.strategy.ts` quedan idénticos).

---

## Decisiones tomadas y descartadas

- **`30d` hardcodeado** en vez de variable de entorno (`JWT_EXPIRES_IN`) — se descartó por alcance: el proyecto ya hardcodea `expiresIn` hoy (`'2h'`), así que mantener el mismo patrón es el cambio más chico posible; hacerlo configurable es una mejora independiente que puede proponerse después si hace falta.

- **Extender expiración en vez de refresh tokens** — mismo razonamiento que en la spec de frontend: para una app personal de uso esporádico, extender el plazo del token actual resuelve el síntoma reportado sin la complejidad de un mecanismo de renovación (nuevo endpoint, storage adicional, rotación).

- **No se toca la validación de expiración en `JwtStrategy`** — se descartó cualquier cambio ahí porque la validación de `exp` la maneja `passport-jwt` internamente antes de llegar a `validate()`; el spec solo necesita cambiar el valor de expiración al firmar, no la lógica de verificación.

---

## Riesgos identificados

- **Ventana de exposición más larga si el token es robado** — al no existir invalidación server-side (blacklist, refresh rotation), un JWT filtrado (device robado, log filtrado, etc.) es válido por 30 días en vez de 2 horas. Aceptado como trade-off razonable para una app personal de un solo usuario; si en el futuro se necesita revocación, requiere una spec aparte (blacklist o migración a refresh tokens).
