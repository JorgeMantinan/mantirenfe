FROM node:26-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mantirenfe/database db:generate
RUN pnpm turbo build --filter=@mantirenfe/api

FROM node:26-alpine AS runner
ENV NODE_ENV=production
WORKDIR /repo
RUN corepack enable
# Sin privilegios en runtime: el proceso corre como `node`, no root
COPY --from=build --chown=node:node /repo /repo
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
