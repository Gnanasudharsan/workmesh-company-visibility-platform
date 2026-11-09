# syntax=docker/dockerfile:1.7
# WorkMesh API (NestJS) — multi-stage build. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t workmesh-api .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @workmesh/api... --filter @workmesh/core
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/api apps/api
RUN pnpm --filter @workmesh/core build && pnpm --filter @workmesh/api build

FROM node:22-alpine AS runtime
RUN corepack enable && addgroup -S workmesh && adduser -S workmesh -G workmesh
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=workmesh:workmesh /repo /repo
USER workmesh
EXPOSE 8020
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:8020/api/health/live || exit 1
# Migrations run as a separate one-off step in production:
#   docker run --rm --env-file .env workmesh-api pnpm --filter @workmesh/api exec prisma migrate deploy
CMD ["node", "apps/api/dist/main.js"]
