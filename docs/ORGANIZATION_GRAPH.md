# Organization graph & Company Map

## Model

- **Structure**: `Department` → `Team` → `TeamMembership(role: MEMBER|LEAD, isPrimary)`; departments have a `head`.
- **Employment reporting**: `ReportingLine(reportId → managerId, type: PRIMARY|DOTTED, startedAt, endedAt, reason)`. At most one active PRIMARY per person (partial unique index). Dotted lines model indirect/functional managers.
- **Temporary delegation**: `Delegation(delegator → delegate, startsAt, expiresAt, revokedAt)`; while active, the delegate inherits the delegator's direct reports.
- **Project responsibility is separate from employment reporting**: `ProjectMember(role: LEAD|CONTRIBUTOR|VIEWER)`. Someone can report to one manager while being led by another person on a project.

Reorganizations end lines and create new ones — history (`GET /api/reporting/:id/history`) and the audit log keep the before/after.

## Algorithms (`packages/core/src/hierarchy.ts`)

| Function | Approach | Complexity |
| --- | --- | --- |
| `buildIndex(edges)` | adjacency maps `reportsOf`, `managersOf`, `primaryManagerOf` | O(E) |
| `reportingSubtree(idx, m, {primaryOnly, maxDepth})` | BFS with visited set and depths | O(V + E) |
| `managementChain(idx, p)` | follow primary manager pointers with a seen-set (terminates on corrupt cycles) | O(depth) |
| `wouldCreateCycle(idx, report, manager)` | cycle iff `manager` is in `report`'s subtree | O(V + E) |
| `findCycle(edges)` | iterative three-color DFS (no recursion limit; tested on 20 000-deep chains) | O(V + E) |
| `validateReportingChange(...)` | unknown / cross-tenant / inactive / self / duplicate primary / cycle | O(V + E) |

Delegation is applied when building an AuthContext by adding DOTTED edges from the delegator's direct reports to the delegate, then running the same subtree traversal.

## Company Map API

`GET /api/graph/people?expand=<teamIds>&focus=<memberId>&all=true`

- Always: company, departments (head, counts), teams (lead, counts).
- People only for expanded teams, plus the focused person's reporting subtree and management chain.
- Edges: `contains`, `belongs_to`, `leads`, `reports_to`, `dotted_line`.

`GET /api/graph/work?expand=<projectIds>`

- Goals and initiatives the viewer can see (restricted ones need a relationship), projects at summary or details level, owning teams, unresolved dependencies **only if both endpoints are visible**, and milestones only for expanded projects with details access.
- Goal/initiative counts and progress are computed from visible projects only — hidden projects contribute nothing, not even to counts.

The browser never receives unauthorized nodes; there is nothing to hide with CSS.

## Frontend (`apps/web/src/components/map`)

- Custom React Flow nodes per entity type with avatar/initials, title, role/type, team, status/health and selection/highlight/dim states.
- ELK layouts: `layered` top-down and left-to-right (hierarchical edges rank; dependencies, dotted and ownership edges are drawn but excluded from ranking) and `mrtree` compact tree.
- Progressive disclosure: company → departments (click) → teams (click) → people. Expand all / collapse.
- Search with match count and Enter-to-jump; department and health/status filters; reporting-subtree focus; neighbor highlighting; back history; minimap; zoom/fit controls; inspector panel that follows dependency edges.
- **List view**: the same authorized graph as an ARIA `tree` (keyboard and screen-reader friendly).
