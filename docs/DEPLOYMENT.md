# Deployment & operations

WorkMesh is **not deployed publicly**. This guide describes how to run it as a real service; nothing here has been provisioned.

## Components

| Component | Image / process | Notes |
| --- | --- | --- |
| Web | `apps/web/Dockerfile` (Next.js standalone, non-root, port 3002) | `NEXT_PUBLIC_API_URL` is a build argument |
| API | `apps/api/Dockerfile` (non-root, port 8020, healthcheck) | stateless; scale horizontally behind a load balancer |
| Worker | same API image, `node apps/api/dist/worker.js` | set `WORKER_INLINE=false` on API instances when running separate workers |
| PostgreSQL 16 | managed service recommended | two roles: owner (migrations) and `workmesh_app` (`NOBYPASSRLS`) |
| Redis 7 | managed service | BullMQ + pub/sub; `maxmemory-policy noeviction` |

## Production configuration

Required: `NODE_ENV=production`, `DATABASE_URL` (owner role, used for migrations and system tables), `APP_DATABASE_URL` (app role), `REDIS_URL`, `WEB_ORIGIN` (exact origin), `COOKIE_SECURE=true`, a strong `METRICS_TOKEN`. The API refuses to start if `DEMO_MODE` is on, cookies are not secure, or the metrics token is weak. Keep secrets in the platform's secret store, never in images.

## Release procedure

1. Build and push images.
2. Run migrations as a one-off job with the owner role:

```bash
docker run --rm --env-file prod.env workmesh-api pnpm --filter @workmesh/api exec prisma migrate deploy
```

3. Roll API and worker instances; then the web app.

The first time, create the app role (see `infra/postgres/init/01-roles.sh`) before migrating — the migration grants it table privileges.

## HTTPS reverse proxy

Serve web and API under one site (e.g. `app.example.com` and `app.example.com/api` or `api.example.com`) behind TLS. Forward `X-Forwarded-*` (the API trusts one proxy hop), enable WebSocket upgrades for `/socket.io`, set HSTS, and keep `/api/metrics` on an internal network or behind the bearer token.

## Tenant provisioning

Self-service: `POST /api/auth/register` creates the organization, owner membership and profile. The onboarding wizard adds departments, teams, invitations and the first goal. Never run the demo seed in production (it refuses unless `ALLOW_DEMO_SEED=true`).

## Backup & restore

- Nightly `pg_dump -Fc` (owner role) plus point-in-time recovery on the managed database; test restores monthly into a staging database.
- Restore: `pg_restore --clean --no-owner -d workmesh dump.pgcustom`, then re-run `GRANT`s from the security migration if the app role was recreated.
- Redis holds no system of record (outbox lives in Postgres); losing it only delays notifications until the poller re-enqueues.

## Monitoring

`/api/health` (readiness: DB, RLS enforcement, Redis, queue) and `/api/health/live` (liveness). Prometheus metrics: request latency, job duration/failures, notifications delivered, realtime messages, Node process metrics. Alert on readiness failures, `workmesh_job_failures_total` growth and outbox rows with `processedAt IS NULL` older than a few minutes.

## Scaling notes and constraints

- Designed for tenants of ~20–150 people; per-request AuthContext loads the org's teams, reporting lines and projects. At thousands of members, move to incremental/materialized relationship tables or a dedicated authorization service (see ADR-2).
- Multiple API instances: switch the Throttler to a Redis store; the AuthContext cache stays correct across instances because it is version-stamped from the database.
- Search uses PostgreSQL FTS; a dedicated engine is only warranted at much larger content volumes.
