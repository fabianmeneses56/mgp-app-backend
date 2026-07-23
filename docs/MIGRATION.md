# Migración del backend MGP: Railway → VPS (Hostinger)

> **Estado**: Fases 1–4 completas (PR mergeado, VPS bootstrapeado, datos migrados desde Railway, stack en producción sirviendo en `https://$DOMAIN/api` con TLS y auto-deploy verificado). Fase 5 (cutover) pendiente: falta apuntar la app Expo/RN al nuevo dominio y decidir cuándo apagar Railway.
>
> Nota: Railway corre Postgres 18, no 17 como se asumió originalmente — `docker-compose.prod.yml` usa `postgres:18-alpine` (el mount de datos también cambió a `/var/lib/postgresql`, requerido por la imagen 18+). Backup diario automático corriendo vía cron (`~/backups/daily-backup.sh`, 3am, retiene 14 días).

## Contexto

El backend NestJS (`mgp-app-backend`) y su Postgres corren hoy en Railway con auto-deploy en cada push a `main`. El objetivo es moverlos a este VPS para eliminar topes de uso y costos de Railway, conservando la misma experiencia: HTTPS, auto-deploy en push a `main`, migraciones automáticas en boot (`NODE_ENV=production` → `migrationsRun: true`) y los datos de producción actuales.

## Verificación del VPS (hecha)

| Aspecto | Estado |
|---|---|
| SO / Arch | Ubuntu 24.04.4 LTS, x86_64 — OK |
| Recursos | 1 CPU, 3.8 GB RAM, 41 GB libres — suficiente para app + Postgres + Caddy |
| IP pública | IPv4 fija (también IPv6) |
| Docker / Node / nginx | **NO instalados** |
| sudo del usuario `claude` | **Requiere contraseña** → no puedo instalar paquetes ni tocar firewall solo |
| Puertos escuchando | Solo 22 (SSH) |
| gh CLI | Autenticado como `fabianmeneses56`, scope `repo` + `workflow` → puedo crear PR y setear secrets |

**Conclusión de autonomía**: puedo hacer todo excepto el bootstrap root. El usuario debe ejecutar **una sola vez** `! sudo bash deploy/setup-vps.sh` (instala Docker, agrega `claude` al grupo docker, abre puertos 80/443, crea swap de 2 GB). También debe pegar la `DATABASE_URL` pública de Railway y el `JWT_SECRET` de producción cuando se los pida.

## Decisiones tomadas (confirmadas con el usuario)

- **TLS**: dominio gratuito `sslip.io` derivado de la IP del VPS + Caddy con Let's Encrypt automático. El dominio final se setea vía la variable `DOMAIN` en `.env.production` (no se commitea a git); la URL del API queda `https://$DOMAIN/api`.
- **Auto-deploy**: GitHub Actions con SSH al VPS en cada push a `main`.
- **Datos**: se migran desde Railway con `pg_dump`/`pg_restore`.

## Fase 1 — PR con la infraestructura de despliegue (100% autónomo)

Crear rama `feat/vps-deployment` y PR con estos archivos nuevos:

1. **`Dockerfile`** — multi-stage con `node:22-alpine`:
   - Stage build: `yarn install --frozen-lockfile` + `yarn build`.
   - Stage prod: solo `dependencies` (`yarn install --production`), copia `dist/`, corre `node dist/main` como usuario no root. Nota: `bcrypt` es nativo → se compila en la imagen (alpine necesita `python3 make g++` en el stage de deps).
2. **`.dockerignore`** — `node_modules`, `dist`, `postgres/`, `.env*`, `.git`.
3. **`docker-compose.prod.yml`** — 3 servicios en red interna:
   - `db`: `postgres:17-alpine`, volumen nombrado `pgdata`, **sin** puerto publicado al host, healthcheck `pg_isready`.
   - `app`: build del Dockerfile, `env_file: .env.production`, `depends_on: db (healthy)`, expone 3000 solo a la red interna, `restart: unless-stopped`.
   - `caddy`: `caddy:2-alpine`, puertos `80:80` y `443:443`, volúmenes `caddy_data`/`caddy_config`, monta `Caddyfile`.
4. **`Caddyfile`** — `{$DOMAIN} { reverse_proxy app:3000 }` (TLS automático; `DOMAIN` se inyecta desde `.env.production` vía `docker-compose.prod.yml`, así el dominio/IP real no queda hardcodeado en el repo público).
5. **`.env.production.example`** — plantilla: `NODE_ENV=production`, `DB_HOST=db`, `DB_PORT=5432`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `PORT=3000`, `DOMAIN`, `HOST_API=https://$DOMAIN/api`, `JWT_SECRET`, las 5 vars `CLOUDFLARE_R2_*`, `CORS_ORIGIN=` (vacío; cliente es app nativa). El real `.env.production` vive solo en el VPS, nunca en git.
6. **`deploy/setup-vps.sh`** — bootstrap root (lo ejecuta el usuario una vez): instala Docker CE + compose plugin desde el repo oficial, `usermod -aG docker claude`, crea swap de 2 GB (build de Nest en 1 CPU/4 GB lo agradece), `ufw allow OpenSSH && ufw allow 80,443/tcp && ufw --force enable`.
7. **`deploy/deploy.sh`** — script idempotente que usa el workflow y sirve para deploy manual: `git pull --ff-only origin main && docker compose -f docker-compose.prod.yml up -d --build && docker image prune -f`.
8. **`.github/workflows/deploy.yml`** — en `push` a `main`: acción SSH (`appleboy/ssh-action`) que ejecuta `deploy/deploy.sh` en el VPS. Usa secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`.
9. **`docs/MIGRATION.md`** — este mismo plan paso a paso, para revisión del usuario en el repo.

Además (autónomo, fuera del PR):
- Generar keypair SSH ed25519 dedicado en el VPS (`~/.ssh/github-deploy`), agregar la pública a `~/.ssh/authorized_keys`.
- `gh secret set VPS_HOST/VPS_USER/VPS_SSH_KEY/VPS_PORT` en el repo.

## Fase 2 — Bootstrap del VPS (requiere al usuario, 1 comando)

```
! sudo bash deploy/setup-vps.sh
```
Tras esto, verifico `docker ps` funciona para `claude` (puede requerir re-login para el grupo; el script usa `sg docker` como fallback o se reinicia la sesión).

## Fase 3 — Configuración y migración de datos

1. Usuario pega la `DATABASE_URL` **pública** de Railway (dashboard → Postgres → Connect → Public Network) y el `JWT_SECRET` de producción de Railway (mantenerlo conserva las sesiones activas de los usuarios; si prefiere no compartirlo, se genera uno nuevo y todos re-loguean).
2. Creo `.env.production` en el VPS (permisos 600) con password de DB nueva generada aleatoriamente + las credenciales R2 (pedirlas o copiarlas del dashboard si el `.env` local no existe — **no hay `.env` en este VPS**, así que las 5 vars R2 también las debe pegar el usuario).
3. Levanto solo `db`, luego dump + restore usando el cliente pg 17 en contenedor (cliente ≥ servidor Railway, restore a 17 siempre seguro):
   ```
   docker run --rm postgres:17-alpine pg_dump "$RAILWAY_URL" -Fc > backup.dump
   docker compose -f docker-compose.prod.yml exec -T db pg_restore -U $DB_USERNAME -d $DB_NAME --no-owner --no-privileges < backup.dump
   ```
4. **Chequeo crítico de migraciones**: verificar que la tabla `migrations` restaurada registra `Initial1783522657671`. Si Railway se creó con `synchronize` y la tabla no existe/está vacía, insertar el registro a mano antes de arrancar la app — si no, `migrationsRun: true` intentará re-crear tablas existentes y el boot fallará.
5. Guardar `backup.dump` como respaldo de rollback.

## Fase 4 — Primer despliegue y verificación

1. `docker compose -f docker-compose.prod.yml up -d --build`.
2. Verificar: logs de app sin errores, Caddy obtuvo certificado, y smoke tests:
   - `curl https://$DOMAIN/api/...` → login con un usuario real devuelve JWT.
   - Endpoint autenticado (categorías/ejercicios) devuelve los datos migrados.
   - `docker compose restart app` → reboot limpio (migraciones no re-fallan).
3. Probar el pipeline: merge del PR a `main` → el workflow despliega solo → confirmar en Actions.

## Fase 5 — Cutover y limpieza

1. Usuario actualiza la URL base del API en la app Expo/React Native a `https://$DOMAIN/api` y publica el update (EAS Update/OTA o build).
2. Railway queda vivo como fallback hasta confirmar que todo funciona (los datos nuevos escritos en el VPS **no** se sincronizan de vuelta — minimizar la ventana).
3. Cuando esté confirmado: desconectar el auto-deploy de Railway y borrar/pausar los servicios para frenar el consumo.
4. Programar backup diario de Postgres: cron del usuario `claude` con `pg_dump` al disco (y opcional: subirlo al bucket R2 existente).

## Riesgos y mitigaciones

- **1 CPU en build**: el build de imagen (tsc + bcrypt nativo) tarda varios minutos y compite con la app corriendo. Mitigado con swap; si molesta, futuro: build en GitHub Actions y push de imagen (GHCR).
- **sslip.io + rate limits de Let's Encrypt**: dominio compartido por IP; si LE limita, alternativa ZeroSSL vía Caddy (automático).
- **JWT_SECRET distinto** → sesiones caducan: mitigado copiando el de Railway.
- **Desfase de datos en cutover**: re-dump final justo antes de cambiar la URL en la app si pasaron días.

## Verificación end-to-end (resumen)

- `curl -I https://$DOMAIN/api` responde con TLS válido.
- Login de usuario existente (dato migrado) → 200 + JWT.
- CRUD de ejercicio con imagen → sube a R2 y devuelve URL pública.
- Push de un commit trivial a `main` → deploy automático visible en `gh run watch`.
- Reinicio del VPS (`docker compose ... restart: unless-stopped` + Docker habilitado en systemd) → todo vuelve solo.
