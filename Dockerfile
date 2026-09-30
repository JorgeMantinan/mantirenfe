# Despliegue de producción (Render): API + worker en un mismo servicio.
# El worker vive dentro del contenedor para que el tráfico HTTP a /api/health
# (UptimeRobot cada 5 min) mantenga despierto también el sondeo de alertas.
#
# Base node:22-slim (Debian 12): el engine musl de Prisma necesita libssl1.1,
# que Alpine ya no incluye. Debian 12 tampoco trae libssl1.1 (solo OpenSSL 3),
# así que se instala desde snapshot.debian.org para que funcione tanto el
# engine debian-openssl-1.1.x como el debian-openssl-3.0.x de Prisma.
FROM node:22-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget \
  && rm -rf /var/lib/apt/lists/* \
  && wget -q https://snapshot.debian.org/archive/debian/20230601T000000Z/pool/main/o/openssl/libssl1.1_1.1.1n-0+deb11u4_amd64.deb \
  && dpkg -i libssl1.1_1.1.1n-0+deb11u4_amd64.deb \
  && rm libssl1.1_*.deb
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN DATABASE_URL="postgresql://user:pass@localhost:5432/build" pnpm --filter @mantirenfe/database db:generate
RUN pnpm turbo build --filter=@mantirenfe/api --filter=@mantirenfe/worker

FROM node:22-slim AS runner
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget \
  && rm -rf /var/lib/apt/lists/* \
  && wget -q https://snapshot.debian.org/archive/debian/20230601T000000Z/pool/main/o/openssl/libssl1.1_1.1.1n-0+deb11u4_amd64.deb \
  && dpkg -i libssl1.1_1.1.1n-0+deb11u4_amd64.deb \
  && rm libssl1.1_*.deb
WORKDIR /repo
RUN corepack enable
COPY --from=build /repo /repo
EXPOSE 3000
# SERVICIO=api | worker | ambos (default): permite separar API y worker en dos
# servicios de Render (512 MB cada uno en free) sin duplicar la imagen.
ENV SERVICIO=ambos
CMD ["sh", "-c", "if [ \"$SERVICIO\" = \"api\" ]; then exec node apps/api/dist/main.js; elif [ \"$SERVICIO\" = \"worker\" ]; then exec node apps/worker/dist/main.js; else node apps/api/dist/main.js & node apps/worker/dist/main.js & wait; fi"]
