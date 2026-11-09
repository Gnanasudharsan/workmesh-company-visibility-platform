# Multi-tenancy

Each company is an `Organization`. Isolation is enforced in **two independent layers**; either one alone would prevent cross-tenant reads.

## 1. Application layer

- The active organization lives on the **server-side session** (`sessions.activeOrganizationId`). No endpoint accepts an organization id to decide which tenant to read.
- `POST /api/auth/switch-organization` only succeeds if the user has an `ACTIVE` membership there; otherwise it returns 404 (no tenant enumeration).
- The membership is re-checked on **every request**, so deactivation locks someone out immediately.
- Services resolve referenced IDs (team, manager, project, milestone…) through the tenant-scoped client, so a foreign ID simply isn't found.

## 2. Database layer — Row-Level Security

```sql
CREATE FUNCTION wm_current_org() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING ("organizationId" = wm_current_org())
  WITH CHECK ("organizationId" = wm_current_org());
```

Applied to all 35 tenant tables. Requests run as `workmesh_app` (`NOBYPASSRLS`):

```ts
// apps/api/src/common/db.service.ts
await this.app.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`; // transaction-local
  return fn(); // every query of the request uses tx
});
```

### Why transaction-local matters with connection pooling

`set_config(name, value, is_local => true)` lasts only until the transaction ends. A pooled connection handed to the next request therefore carries **no** tenant setting, and with no setting `wm_current_org()` is `NULL`, so every policy evaluates to false — zero rows. Setting the tenant once per connection (session-level) would leak context between requests; this design cannot.

### What the system client is used for

A separate owner-role client (bypasses RLS) is used only for: sessions and users, registration, invitation lookup/acceptance by token (the invitee has no tenant yet), the outbox poller, health checks and seeding. Code on that client always filters by `organizationId` explicitly.

## Other surfaces

| Surface | Isolation |
| --- | --- |
| Search | Runs in the tenant transaction and restricts to visible IDs in SQL |
| Graph & exports | Built from tenant-scoped, policy-filtered sets |
| Notifications | Rows are tenant-scoped; recipients are re-authorized individually |
| WebSockets | Org comes from the session cookie; sockets join only `m:<membershipId>`; `subscribe` for another org returns `FORBIDDEN`; dispatch double-checks the socket's org |
| Background jobs | Each job runs `runAsTenant(event.organizationId)` |
| Caches | AuthContext cache key includes org and member; values stamped with `authzVersion` |

## Tests

`apps/api/test/tenancy.int.spec.ts` (10 tests) and Playwright Journey G prove: a foreign tenant's **owner** gets 404 for 13 Northstar resource URLs and cannot mutate them; lists, search, graphs, CSV export and the directory contain nothing foreign; switching into the other org fails; the app role sees zero rows without context, only its own tenant with context (even for exact foreign IDs), cannot insert or update across tenants, does not carry context across pooled connections, and gets `permission denied` on `users`/`sessions`; realtime subscription to the other org is rejected.
