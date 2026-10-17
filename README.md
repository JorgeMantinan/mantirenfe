# MantiRenfe

[![CI](https://github.com/JorgeMantinan/mantirenfe/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JorgeMantinan/mantirenfe/actions/workflows/ci.yml)

Sistema de alertas sobre la red ferroviaria española: vigila disponibilidad de asientos, retrasos, supresiones e incidencias de trenes de Renfe (y comparativa multioperador con OUIGO) y avisa por notificación push o email cuando ocurre algo relevante en el tren o la ruta que te interesa. Caso de uso: se libera un asiento en el tren que querías y recibes el aviso a tiempo para cambiar de billete.

## Características

| Área                      | Qué hace                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| Alertas de disponibilidad | Sondeo periódico de asientos libres por tren/ruta/hora y notificación cuando aparece un hueco |
| Retrasos                  | Alertas cuando el retraso supera un umbral configurable, con datos GTFS-RT en tiempo real     |
| Incidencias y supresiones | Avisos de trenes suprimidos y avisos operativos (feeds GTFS `alerts.pb`)                      |
| Mapa en tiempo real       | Posiciones de trenes en un mapa (Leaflet) actualizadas desde GTFS-RT                          |
| Estadísticas              | Panel con histórico de disponibilidad y puntualidad por ruta                                  |
| Comparador multioperador  | Datos de Renfe (AVE/LD, CER) + OUIGO vía Punto de Acceso Nacional (NAP)                       |
| Multi-canal               | Web Push (VAPID), email SMTP y push móvil (Expo)                                              |
| Usuarios                  | Auth con Supabase (JWT verificado contra JWKS), alertas personales y criterios propios        |
| Multiplataforma           | Web PWA instalable + app móvil React Native (Expo, EAS builds)                                |

## Stack

| Capa             | Tecnología                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| API              | NestJS + TypeScript, REST con OpenAPI/Swagger, auth JWT (Passport) validada contra Supabase JWKS                                              |
| Worker           | Proceso Node separado: Redis + BullMQ (colas, reintentos, rate-limiting), sondeo de fuentes y notificaciones                                  |
| Web              | React + Vite (TypeScript), PWA instalable, React Router, i18next, Leaflet/React-Leaflet, Tailwind + Radix UI                                  |
| Móvil            | React Native + Expo (EAS), notificaciones push                                                                                                |
| Datos            | PostgreSQL (Supabase) + Prisma; roles separados (DML en runtime vs migraciones)                                                               |
| Fuentes de datos | GTFS-RT (posición, retrasos, alertas), GTFS estático (horarios, trips, stops), API de disponibilidad de venta (DWR), feeds OUIGO desde el NAP |
| Calidad y ops    | Sentry, logging estructurado con Pino, endpoint `/health` con métricas de sondeo                                                              |
| Monorepo         | Turborepo + pnpm (`apps/api`, `apps/web`, `apps/mobile`, `apps/worker`, `packages/database`, `packages/shared-types`, `packages/venta`)       |
| Testing          | Vitest (unit) + Playwright (E2E de humo contra producción)                                                                                    |
| CI/CD            | GitHub Actions: `ci.yml` (lint+typecheck+test+build), `e2e.yml`, `sync-gtfs.yml`, `backup.yml`                                                |
| Infraestructura  | Docker multi-stage por servicio + `docker-compose` local (postgres, redis, api, worker, web), Husky + commitlint                              |

## Estructura

```
mantirenfe/
├── apps/
│   ├── api/               NestJS: REST + Swagger, auth JWT, health
│   ├── web/               React + Vite (PWA)
│   ├── mobile/            Expo (React Native)
│   └── worker/            Sondeo GTFS/DWR + colas BullMQ + notificaciones
├── packages/
│   ├── database/          Prisma schema, migraciones y seeds
│   ├── shared-types/      Tipos compartidos
│   └── venta/             Lógica de acceso a la fuente de disponibilidad (DWR/mock)
├── docker-compose.yml     Postgres + Redis + api + worker + web (local)
├── Dockerfile             Build multi-stage (api/worker)
├── render.yaml            Blueprint: servicios API y worker en Render
└── vercel.json            Web en Vercel (rewrites /api → Render)
```

## Requisitos

- Node.js >= 20
- pnpm 11
- Docker (para postgres y redis locales) o instancias propias
- Proyecto Supabase (Auth + PostgreSQL)
- Cuenta NAP con ApiKey para OUIGO (opcional; sin ella se omite ese feed)
- Cuenta SMTP para emails (opcional; sin SMTP el worker solo avisa por push)

## Puesta en marcha

```bash
pnpm install
cp .env.example .env          # Supabase, Redis, VAPID, feeds GTFS, etc.
docker compose up -d          # postgres + redis locales
pnpm db:generate && pnpm db:migrate
pnpm dev                      # api (:3000) + web (:5173) + worker
```

Verificación en local: `FUENTE_DISPONIBILIDAD=mock` para desarrollar sin depender de la venta de Renfe.

Calidad:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Móvil:

```bash
pnpm --filter=@mantirenfe/mobile dev    # expo start
```

## Tests

```bash
pnpm test        # vitest en api, web, worker, mobile (turbo)
pnpm lint
pnpm typecheck
```

E2E de humo contra producción (`.github/workflows/e2e.yml`): corre tras el sync diario de GTFS para detectar regresiones (tripIds, endpoints, ciclo de alertas).

## Variables de entorno

Definidas en `.env.example` (copiar a `.env` en la raíz). Variables principales:

| Grupo                   | Variables                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entorno                 | `NODE_ENV`                                                                                                                                                             |
| Base de datos           | `DATABASE_URL`, `DATABASE_URL_APP` (rol restringido de runtime)                                                                                                        |
| Redis                   | `REDIS_URL`, `REDIS_PASSWORD`                                                                                                                                          |
| API                     | `API_PORT`, `WEB_ORIGIN`, `TRUST_PROXY_HOPS`, `SUPABASE_URL`, `POSICIONES_CACHE_SEG`                                                                                   |
| Auth                    | `SUPABASE_JWT_SECRET`, `JWT_SECRET`, `SUPABASE_JWT_AUDIENCE` (opcional)                                                                                                |
| Supabase (web)          | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`                                                                                                                          |
| Web Push                | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                                                                                                               |
| Email (SMTP, opcional)  | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_DESDE`                                                                                                      |
| Fuentes de datos        | `FUENTE_DISPONIBILIDAD`, `GTFS_RT_URLS`, `GTFS_RT_TRIP_UPDATES_URL`, `GTFS_RT_ALERTS_URL`, `GTFS_ZIP_URLS`, `GTFS_DIAS_VENTANA`, `DWR_CACHE_SEG`, `RETRASO_UMBRAL_SEG` |
| OUIGO (opcional)        | `GTFS_ZIP_URLS_OUIGO`, `NAP_API_KEY`                                                                                                                                   |
| Sentry (opcional)       | `SENTRY_DSN`, `VITE_SENTRY_DSN`                                                                                                                                        |
| Móvil (Expo)            | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`                                                                                     |
| Monetización (opcional) | `VITE_AFF_TRAINLINE_URL`, `VITE_AFF_OMIO_URL`, `VITE_AFF_TRAVELPAYOUTS_URL`, `VITE_DONACIONES_URL`, `VITE_ADSENSE_CLIENT`, `VITE_ADSENSE_SLOT`                         |

## Despliegue

- Web: Vercel ([mantirenfe.vercel.app](https://mantirenfe.vercel.app)), build con `pnpm turbo build --filter=@mantirenfe/web` (`vercel.json`); las llamadas `/api` se reescriben a la API en Render.
- API y worker: Render (`render.yaml`, blueprint de dos servicios Docker con health check `/api/health`).
- Base de datos: Supabase; Redis en la nube (Upstash/Render).
- Sync diario de GTFS y backup semanal de BD: GitHub Actions programados (`sync-gtfs.yml`, `backup.yml`).

## Estado

- Desplegada y operativa en producción (web + API + worker).
- App móvil con EAS build listo, aún no publicada en tiendas.
- OUIGO se importa solo si hay `NAP_API_KEY`; iryo no publica GTFS (no hay nada que configurar).
- Pendientes declarados: alertas por vagón, filtros de bonos (estudiante, discapacidad), integración con servicios de viaje a destino.

## Licencia

Código visible bajo [PolyForm Noncommercial 1.0.0](LICENSE): uso personal, de aprendizaje o investigación permitido; cualquier uso comercial requiere autorización expresa. Los datos de Renfe/MITRAMS conservan su propia licencia (LDA) y deben citarse ("Powered by MITRAMS").

© 2026 Jorge Mantiñán Montero. No afiliado a Renfe Operadora ni al MITRAMS; los datos proceden de fuentes públicas citadas.
