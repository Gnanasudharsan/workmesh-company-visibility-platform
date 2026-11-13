import { Injectable } from "@nestjs/common";
import type { AuthContext } from "@workmesh/core";
import { DirectoryService } from "../dashboard/directory.service";
import { DependenciesService } from "../graph/dependencies.service";
import { SearchService, type SearchType } from "../search/search.service";
import { BlockersService } from "../updates/blockers.service";
import { UpdatesService } from "../updates/updates.service";
import { GoalsService } from "../work/goals.service";
import { ProjectsService } from "../work/projects.service";

/** The existing services the copilot reads through. Nothing else is reachable from a tool. */
export interface CopilotServices {
  search: Pick<SearchService, "search">;
  projects: Pick<ProjectsService, "get" | "activity">;
  blockers: Pick<BlockersService, "list">;
  updates: Pick<UpdatesService, "list">;
  dependencies: Pick<DependenciesService, "explorer">;
  goals: Pick<GoalsService, "tree">;
  directory: Pick<DirectoryService, "person" | "team">;
}

/** Every method a tool can call. Each one is a read; the facade test pins this list. */
export const READ_METHODS = ["self", "search", "project", "projectActivity", "blockers", "updates", "dependencies", "goalTree", "person", "team"] as const;

/**
 * Builds the read-only API one request's tools use. The `AuthContext` is bound here, once, from the
 * session, so a tool can neither choose whose permissions apply nor reach a write method, `Db` or a
 * Prisma client. Every call goes to the existing policy-checked service method, which reads the
 * request's `ViewerScope` and RLS-scoped transaction from the execution context.
 */
export function createReadApi(s: CopilotServices, ctx: AuthContext) {
  const api = {
    /** The signed-in member's id, so "what am I working on?" resolves without a lookup. */
    self: () => ctx.membershipId,
    search: (q: string, types: SearchType[], limit = 6) => s.search.search(ctx, q, types, limit),
    project: (id: string) => s.projects.get(ctx, id),
    /** Details-only activity; the service itself 404s below details access. */
    projectActivity: (id: string) => s.projects.activity(id),
    blockers: (f: { projectId: string; open?: boolean }) => s.blockers.list(ctx, { scope: "all", ...f }),
    /** Published updates only: drafts are never passed to the model. */
    updates: (f: { projectId?: string; authorId?: string; since?: Date; limit?: number }) => s.updates.list(ctx, { ...f, drafts: false }),
    dependencies: (focusProjectId: string) => s.dependencies.explorer(ctx, focusProjectId),
    goalTree: () => s.goals.tree(ctx),
    person: (id: string) => s.directory.person(ctx, id),
    team: (id: string) => s.directory.team(ctx, id),
  } satisfies Record<(typeof READ_METHODS)[number], (...args: never[]) => unknown>;
  return Object.freeze(api);
}

export type ReadApi = ReturnType<typeof createReadApi>;

@Injectable()
export class CopilotReadFacade {
  private readonly services: CopilotServices;

  constructor(
    search: SearchService,
    projects: ProjectsService,
    blockers: BlockersService,
    updates: UpdatesService,
    dependencies: DependenciesService,
    goals: GoalsService,
    directory: DirectoryService,
  ) {
    this.services = { search, projects, blockers, updates, dependencies, goals, directory };
  }

  forRequest(ctx: AuthContext): ReadApi {
    return createReadApi(this.services, ctx);
  }
}
