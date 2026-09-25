# Despliegue de producción (Render): API + worker en un mismo servicio.
# El worker vive dentro del contenedor para que el tráfico HTTP a /api/health
# (UptimeRobot cada 5 min) mantenga despierto también el sondeo de alertas.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN DATABASE_URL="postgresql://user:pass@localhost:5432/build" pnpm --filter @mantirenfe/database db:generate
RUN pnpm turbo build --filter=@mantirenfe/api --filter=@mantirenfe/worker

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /repo
RUN corepack enable
COPY --from=build /repo /repo
EXPOSE 3000
CMD ["sh", "-c", "node apps/api/dist/main.js & node apps/worker/dist/main.js & wait"]
