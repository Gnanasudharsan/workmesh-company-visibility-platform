# syntax=docker/dockerfile:1.7
# WorkMesh web (Next.js standalone). Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t workmesh-web .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @workmesh/web... --filter @workmesh/core
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:8020
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @workmesh/core build && pnpm --filter @workmesh/web build

FROM node:22-alpine AS runtime
RUN addgroup -S workmesh && adduser -S workmesh -G workmesh
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3002 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=workmesh:workmesh /repo/apps/web/.next/standalone ./
COPY --from=build --chown=workmesh:workmesh /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=workmesh:workmesh /repo/apps/web/public ./apps/web/public
USER workmesh
EXPOSE 3002
CMD ["node", "apps/web/server.js"]
