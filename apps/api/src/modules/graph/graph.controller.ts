import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { DEPENDENCY_STATES, type DependencyState } from "@workmesh/core";
import { z } from "zod";
import { Auth } from "../../common/decorators";
import { requireOrg, type RequestAuth } from "../../common/request-auth";
import { V, zOptDate } from "../../common/zod.pipe";
import { DependenciesService } from "./dependencies.service";
import { GraphService } from "./graph.service";

const uuid = new ParseUUIDPipe({ version: "4" });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (v?: string) => (v ? v.split(",").filter((x) => UUID_RE.test(x)).slice(0, 50) : []);

const dependencySchema = z.object({
  upstreamProjectId: z.uuid(),
  downstreamProjectId: z.uuid(),
  description: z.string().trim().min(3).max(500),
  ownerId: z.uuid().nullable().optional(),
  isCritical: z.boolean().optional(),
  needBy: zOptDate,
  upstreamMilestoneId: z.uuid().nullable().optional(),
  downstreamMilestoneId: z.uuid().nullable().optional(),
});

@Controller()
export class GraphController {
  constructor(
    private readonly graph: GraphService,
    private readonly deps: DependenciesService,
  ) {}

  @Get("graph/people")
  people(@Query("expand") expand?: string, @Query("focus") focus?: string, @Query("all") all?: string) {
    return this.graph.peopleGraph({ expandTeams: ids(expand), focus: focus && UUID_RE.test(focus) ? focus : undefined, expandAll: all === "true" });
  }

  @Get("graph/work")
  work(@Auth() auth: RequestAuth, @Query("expand") expand?: string) {
    return this.graph.workGraph(requireOrg(auth).ctx, { expandProjects: ids(expand) });
  }

  @Get("dependencies")
  explorer(@Auth() auth: RequestAuth, @Query("projectId") projectId?: string) {
    return this.deps.explorer(requireOrg(auth).ctx, projectId && UUID_RE.test(projectId) ? projectId : undefined);
  }

  @Post("dependencies")
  create(@Auth() auth: RequestAuth, @Body(V(dependencySchema)) body: z.infer<typeof dependencySchema>) {
    return this.deps.create(requireOrg(auth).ctx, body);
  }

  @Patch("dependencies/:id")
  update(
    @Auth() auth: RequestAuth,
    @Param("id", uuid) id: string,
    @Body(V(z.object({ state: z.enum(DEPENDENCY_STATES).optional(), ownerId: z.uuid().nullable().optional(), isCritical: z.boolean().optional(), needBy: zOptDate, description: z.string().trim().min(3).max(500).optional() })))
    body: { state?: DependencyState; ownerId?: string | null; isCritical?: boolean; needBy?: Date | null; description?: string },
  ) {
    return this.deps.update(requireOrg(auth).ctx, id, body);
  }

  @Delete("dependencies/:id")
  @HttpCode(204)
  remove(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.deps.remove(requireOrg(auth).ctx, id);
  }
}
