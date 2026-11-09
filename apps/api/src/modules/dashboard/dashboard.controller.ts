import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { Db } from "../../common/db.service";
import { Auth, Public } from "../../common/decorators";
import { notFound } from "../../common/errors";
import { requireOrg, type RequestAuth } from "../../common/request-auth";
import { isDemo } from "../auth/auth.controller";
import { DEMO_PERSONAS } from "../dev/personas";
import { SEARCH_TYPES, SearchService, type SearchType } from "../search/search.service";
import { AdminService } from "./admin.service";
import { DashboardService } from "./dashboard.service";
import { DirectoryService } from "./directory.service";

const uuid = new ParseUUIDPipe({ version: "4" });
const UUID_RE = /^[0-9a-f-]{36}$/i;

@Controller()
export class DashboardController {
  constructor(
    private readonly dashboards: DashboardService,
    private readonly directory: DirectoryService,
    private readonly admin: AdminService,
    private readonly search: SearchService,
    private readonly db: Db,
  ) {}

  @Get("dashboard/employee")
  employee(@Auth() auth: RequestAuth) {
    return this.dashboards.employee(requireOrg(auth).ctx);
  }

  @Get("dashboard/manager")
  manager(@Auth() auth: RequestAuth, @Query("teamId") teamId?: string, @Query("projectId") projectId?: string, @Query("memberId") memberId?: string, @Query("status") status?: string, @Query("sinceDays") sinceDays?: string) {
    const id = (v?: string) => (v && UUID_RE.test(v) ? v : undefined);
    return this.dashboards.manager(requireOrg(auth).ctx, { teamId: id(teamId), projectId: id(projectId), memberId: id(memberId), status, sinceDays: sinceDays ? Math.min(365, Math.max(1, Number(sinceDays) || 30)) : undefined });
  }

  @Get("dashboard/lead")
  lead(@Auth() auth: RequestAuth) {
    return this.dashboards.lead(requireOrg(auth).ctx);
  }

  @Get("dashboard/leadership")
  leadership(@Auth() auth: RequestAuth, @Query("sinceDays") sinceDays?: string) {
    return this.dashboards.leadership(requireOrg(auth).ctx, sinceDays ? Math.min(180, Math.max(1, Number(sinceDays) || 14)) : 14);
  }

  @Get("dashboard/admin")
  adminOverview(@Auth() auth: RequestAuth) {
    return this.dashboards.admin(requireOrg(auth).ctx);
  }

  @Get("people/:id")
  person(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.directory.person(requireOrg(auth).ctx, id);
  }

  @Get("teams/:id")
  team(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.directory.team(requireOrg(auth).ctx, id);
  }

  @Get("departments/:id")
  department(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.directory.department(requireOrg(auth).ctx, id);
  }

  @Get("onboarding")
  onboarding(@Auth() auth: RequestAuth) {
    return this.directory.onboarding(requireOrg(auth).ctx);
  }

  @Post("onboarding/complete")
  @HttpCode(200)
  completeOnboarding(@Auth() auth: RequestAuth) {
    return this.directory.completeOnboarding(requireOrg(auth).ctx);
  }

  @Get("search")
  find(@Auth() auth: RequestAuth, @Query("q") q = "", @Query("types") types?: string, @Query("limit") limit?: string) {
    const t = types ? (types.split(",").filter((x) => SEARCH_TYPES.includes(x as SearchType)) as SearchType[]) : SEARCH_TYPES;
    return this.search.search(requireOrg(auth).ctx, q.slice(0, 100), t, limit ? Math.min(20, Math.max(1, Number(limit) || 6)) : 6);
  }

  @Get("admin/audit")
  audit(@Auth() auth: RequestAuth, @Query("cursor") cursor?: string, @Query("action") action?: string, @Query("resourceType") resourceType?: string) {
    return this.admin.audit(requireOrg(auth).ctx, { cursor: cursor && !Number.isNaN(Date.parse(cursor)) ? cursor : undefined, action: action?.slice(0, 60), resourceType: resourceType?.slice(0, 40) });
  }

  @Get("admin/permissions/inspect")
  inspect(@Auth() auth: RequestAuth, @Query("memberId") memberId = "", @Query("resourceType") resourceType = "", @Query("resourceId") resourceId = "") {
    const types = ["project", "update", "blocker", "meeting", "member", "team"] as const;
    if (!UUID_RE.test(memberId) || !UUID_RE.test(resourceId) || !types.includes(resourceType as (typeof types)[number])) throw notFound();
    return this.admin.inspect(requireOrg(auth).ctx, memberId, resourceType as (typeof types)[number], resourceId);
  }

  /* --------------------------- local development only --------------------------- */

  @Public()
  @Get("dev/personas")
  personas() {
    if (!isDemo()) throw notFound();
    return DEMO_PERSONAS;
  }

  @Public()
  @Get("dev/mailbox")
  async mailbox() {
    if (!isDemo()) throw notFound();
    return this.db.system.mailMessage.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  }
}
