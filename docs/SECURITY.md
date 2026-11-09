# Security & threat model

## Assets

Organizational structure, confidential project content (e.g. an acquisition), employees' work updates and drafts, blockers, meeting decisions, credentials and sessions.

## Actors

| Actor | Capability |
| --- | --- |
| Member of another tenant (incl. its owner) | Valid session in *their* org; may guess or obtain IDs |
| Curious employee | Valid session; may craft requests, change URLs, call the API directly |
| Administrator | Configuration rights; should not read confidential content |
| Executive | Seniority; should see summaries, not confidential details |
| External attacker | No session; can phish links, attempt CSRF, brute force |
| Compromised dependency / SQL injection | Database access as the app role |

## Threats and mitigations

| Threat | Mitigation | Evidence |
| --- | --- | --- |
| Cross-tenant read/write by ID | Org from server session; tenant-scoped transaction with **RLS** (`FORCE`, app role `NOBYPASSRLS`); 404 for invisible records | `tenancy.int.spec.ts`, Journey G |
| Tenant context leaking via pooled connections | `set_config(..., true)` transaction-local; no setting → zero rows | `tenancy.int.spec.ts` |
| SQLi reading password hashes | App role has **no grants** on `users`/`sessions`; Prisma parameterized queries; FTS input reduced to `[a-z0-9]` tokens | `tenancy.int.spec.ts` |
| Over-sharing through UI-only hiding | Server returns only authorized nodes/rows/fields; summary presenter strips details | `authorization.int.spec.ts` |
| Leaks via search, graph, export, counts, notifications, realtime | All filtered server-side; restricted projects contribute nothing to counts or edges; notification recipients re-authorized and titles omit project names they can't see; realtime carries IDs only to per-member rooms | authorization + workflows + realtime suites |
| Admin/executive snooping | Policy: admin = configuration; executive = summaries; permission inspector can't probe invisible resources | policy matrix, inspector test |
| Stale access after removal | `authzVersion` bump in the same transaction; delegations/grants expire on time | Examples E/F tests |
| CSRF | `SameSite=Lax` cookies, Origin check, double-submit `X-CSRF-Token` on every write | `CSRF` test |
| Session theft | 256-bit random opaque tokens, HTTP-only cookies, only SHA-256 stored, sliding expiry, revocation on password reset, never in URLs | auth code, reset test |
| Credential stuffing | Argon2id (19 MiB, t=2), timing-equalized login, rate-limited auth endpoints | — |
| Invitation abuse | Hashed single-use tokens, 7-day expiry, rotation on resend, revocation, atomic claim | invitation tests |
| XSS | React escaping, no `dangerouslySetInnerHTML`, CSP on the web app, `X-Content-Type-Options`, `X-Frame-Options: DENY` | — |
| CSV formula injection | Cells starting with `= + - @ \t \r` are prefixed | integration test |
| Cached private data | API sets `Cache-Control: private, no-store` | — |
| Log leakage | No request bodies logged; cookie/authorization/CSRF headers redacted; mail links never logged; audit metadata sanitized | — |
| Demo credentials in production | `DEMO_MODE` and seeding refuse to run in production; demo password random per seed and git-ignored | config code |
| Exposed monitoring | `/api/metrics` requires a bearer token; Swagger disabled in production | — |

## Security review findings (this build)

| Finding | Status |
| --- | --- |
| CSV export allowed spreadsheet formula injection | **Fixed** (`e0f84ca`) with test |
| Realtime subscriber never subscribed (availability) | **Fixed** (`e48b000`) |
| Rate limiting and AuthContext cache are per process | Accepted for single-instance deployments; use Redis-backed throttling when scaling out |
| CSP allows `'unsafe-inline'` scripts (Next.js hydration without nonces) | Known limitation; nonce-based CSP is future work |
| Registration reveals whether an email already has an account | Accepted UX trade-off; login and password reset do not enumerate |
| Work emails are visible to all org members in the directory | By design (company directory) |
| Cross-tenant FK references | Prevented by tenant-scoped lookups before writes; composite tenant FKs would add defense in depth (future) |

No critical unresolved issues are known. `pnpm audit --prod` is clean after Nest 11.2.8 and overrides for `multer`, `path-to-regexp`, `deepmerge-ts`. Gitleaks scans the full history in CI.

## Privacy commitments

WorkMesh never monitors keystrokes, mouse, screens, webcams, browser history or online time, and computes no productivity scores or rankings. Freshness labels describe information, never people. Drafts are visible only to their authors. The in-app statement lives at `/privacy`.
