FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mantirenfe/database db:generate
RUN pnpm turbo build --filter=@mantirenfe/worker

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /repo
RUN corepack enable
COPY --from=build /repo /repo
CMD ["node", "apps/worker/dist/main.js"]
