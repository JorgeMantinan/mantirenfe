# MantiRenfe

> **No pierdas tu asiento** — sistema de alertas sobre la red ferroviaria española: disponibilidad de asientos, retrasos, incidencias y posiciones en tiempo real.

**🌐 Demo en producción:** [mantirenfe.vercel.app](https://mantirenfe.vercel.app) · **🎯 Estado:** desplegada y operativa

---

## Qué es

Aplicación que vigila por ti los trenes de Renfe (y comparativa multioperador): cuando se libera un asiento en el tren que te interesa, cuando tu tren sufre un retraso o una supresión, o cuando aparece una incidencia en la ruta, **recibes una notificación push o email**.

Caso de uso real: has comprado billete para las 19:00 porque no había hueco en el de las 17:00; a las 13:20 la app te avisa de que se ha liberado un asiento en el de 17:00 para que canbiese a tiempo.

## Funcionalidades

| Área                             | Qué hace                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| 🪑 **Alertas de disponibilidad** | Sondeo periódico de asientos libres por tren/ruta/hora y notificación cuando aparece un hueco. |
| ⏱️ **Retrasos**                  | Alertas cuando el retraso supera un umbral configurable, usando datos GTFS-RT en tiempo real.  |
| 🚨 **Incidencias y supresiones** | Avisos de trenes suprimidos y avisos operativos (feeds GTFS `alerts.pb`).                      |
| 🗺️ **Mapa en tiempo real**       | Posiciones de trenes en un mapa (Leaflet) actualizadas desde GTFS-RT.                          |
| 📈 **Estadísticas**              | Panel con histórico de disponibilidad y puntualidad por ruta.                                  |
| 📡 **Comparador multioperador**  | Datos de Renfe (AVE/LD, CER) + OUIGO vía Punto de Acceso Nacional.                             |
| 🔔 **Multi-canal**               | Web Push (VAPID), email SMTP y push móvil (FCM/Expo).                                          |
| 👤 **Usuarios**                  | Auth con Supabase (JWT + verificación JWKS), alertas personales y criterios propios.           |
| 📱 **Multiplataforma**           | Web PWA instalable + app móvil React Native (Expo, EAS builds).                                |

## Stack técnico

| Capa             | Tecnología                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| API              | **NestJS + TypeScript**, REST documentada con **OpenAPI/Swagger**, auth JWT (Passport) validada contra Supabase JWKS                            |
| Worker           | Proceso Node separado: **Redis + BullMQ** (colas, reintentos, rate-limiting), sondeo de fuentes y disparo de notificaciones                     |
| Web              | **React + Vite (TypeScript)**, PWA instalable, React Router, i18next, Leaflet/React-Leaflet, Tailwind + Radix UI                                |
| Móvil            | **React Native + Expo** (EAS), notificaciones push                                                                                              |
| Datos            | **PostgreSQL (Supabase) + Prisma** — roles separados (DML en runtime vs migraciones)                                                            |
| Fuentes de datos | **GTFS-RT** (posición, retrasos, alertas), **GTFS estático** (horarios, trips, stops), API de disponibilidad de venta, feeds OUIGO desde el NAP |
| Calidad y ops    | **Sentry**, logging estructurado con **Pino**, endpoint `/health` con métricas de sondeo                                                        |
| Monorepo         | **Turborepo + pnpm** (`apps/api`, `apps/web`, `apps/mobile`, `apps/worker`, `packages/shared-types`, `packages/database`)                       |
| Testing          | Vitest (unit) + **Playwright (e2e)**                                                                                                            |
| CI/CD            | **GitHub Actions**: `ci.yml` (lint+typecheck+test+build), `e2e.yml`, `sync-gtfs.yml` (sincronización de datos), `backup.yml`                    |
| Infraestructura  | **Docker multi-stage** por servicio + `docker-compose` local (postgres, redis, api, worker, web), Husky + commitlint                            |

## Arquitectura

```
                        ┌─────────────┐
   usuario ──► web/PWA ─┤   API REST   │◄──── móvil (Expo)
                        │  (NestJS)    │
                        └──────┬───────┘
                               │ PostgreSQL (Prisma/Supabase)
                        ┌──────┴───────┐        ┌──────────────┐
                        │    Redis     │◄──────►│    worker     │
                        │  (BullMQ)    │  cola  │  sondeo +     │
                        └──────────────┘        │  notificaciones│
                                                └──────┬───────┘
                     GTFS-RT / GTFS estático / venta   │
                        ──────────────────────────────►│ push · email
```

**Decisiones de diseño:**

- _Worker separado de la API_: el sondeo de fuentes de Renfe es lento y frágil; no puede bloquear peticiones de usuario. Cola con reintentos y backoff.
- _Caché por ruta+fecha_: evita martilleo a las fuentes de datos (caché DWR compartida, caché de posiciones GTFS-RT).
- _Endpoints de salud accionables_: `/api/health` expone `ultimoSondeoGlobal` y `alertas.retrasoMinutos` para monitoreo gratis (UptimeRobot/BetterStack) que dispare si el worker deja de sondear.
- _Cumplimiento de licencias_: los datos GTFS del MITRAMS exigen atribución — la web incluye "Powered by MITRAMS"; OUIGO se consume con ApiKey oficial del NAP.

## Cómo se construyó

Desarrollado de extremo a extremo por **Jorge Mantiñán Montero**, con IA como acelerador de desarrollo. Decisiones de arquitectura (separación api/worker, modelado de alertas, manejo de fuentes frágiles), revisión de código y despliegue: propias. Ver `apps/mobile/AGENTS.md` para las convenciones de la app móvil.

## Puesta en marcha

```bash
pnpm install
cp .env.example .env             # Supabase, Redis, VAPID, feeds GTFS...
docker compose up -d             # postgres + redis locales
pnpm db:generate && pnpm db:migrate
pnpm dev                         # api (:3000) + web (:5173) + worker
pnpm test && pnpm typecheck      # calidad
```

Verificación en local: `FUENTE_DISPONIBILIDAD="mock"` para desarrollo sin depender de la venta de Renfe.

## Roadmap

- [ ] App móvil publicada en Play Store / App Store (EAS build listo)
- [ ] Alertas de disponibilidad por vagón más cercano a la puerta
- [ ] Alertas de billetes con bonos (estudiante, discapacidad) y filtros por perfil
- [ ] Integración BlaBlaCar / hoteles al llegar a destino

## Licencia

Código visible bajo **[PolyForm Noncommercial 1.0.0](LICENSE)**: puedes verlo, clonarlo, estudiarlo y
usarlo para fines personales, de aprendizaje o de investigación. **Cualquier uso comercial requiere mi
autorización expresa.** Los datos de Renfe/MITRAMS conservan su propia licencia (LDA) y deben citarse.

© 2026 Jorge Mantiñán Montero — contacto a través de [LinkedIn](https://www.linkedin.com/in/jorge-manti%C3%B1%C3%A1n-montero/).

---

<p align="center"><sub>Proyecto personal · España · 2026 — No afiliado a Renfe Operadora ni al MITRAMS. Los datos proceden de fuentes públicas citadas.</sub></p>
