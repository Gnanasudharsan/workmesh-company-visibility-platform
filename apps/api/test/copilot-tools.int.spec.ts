import "./copilot-env";
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { Db } from "../src/common/db.service";
import { resetConfigCache } from "../src/config";
import { AuthzService } from "../src/modules/policy/authz.service";
import { CopilotToolRunner } from "../src/modules/copilot/tool-runner";
import { ATLAS_CANARIES, C, FORBIDDEN, plantCanaries } from "./copilot-fixtures";
import { bootstrap, EMAIL, login, type Client, type Seed } from "./helpers";

/**
 * Ask the Mesh tool layer, exercised end to end: real login → DEMO-only tool endpoint → the same
 * runner the agent loop uses → existing services under RLS. The copilot must see exactly what the
 * persona already sees through the existing API, nothing more.
 */

const PERSONAS = ["maya", "daniel", "priya", "elena", "sam", "noah"] as const;
type Persona = (typeof PERSONAS)[number];
/** Personas with no access to Project Atlas, its initiative or the restricted goal. */
const NO_ATLAS = ["maya", "daniel", "priya", "sam", "noah"] as const;


const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const UUID_1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Labels the tools add themselves (record kinds, the not-found flag, edge direction). */
const LABEL_KEYS = new Set(["type", "found", "direction"]);

type ToolCase = [tool: string, input: Record<string, unknown>];
interface ToolBody {
  tool: string;
  result: Record<string, unknown> & { found: boolean };
  records: Array<{ type: string; id: string; title: string }>;
}

/** Canonical existing endpoint for each record kind the tools return. */
const CANONICAL: Record<string, (id: string) => string> = {
  project: (id) => `/api/projects/${id}`,
  person: (id) => `/api/people/${id}`,
  team: (id) => `/api/teams/${id}`,
  department: (id) => `/api/departments/${id}`,
  goal: (id) => `/api/goals/${id}`,
  initiative: (id) => `/api/initiatives/${id}`,
  milestone: (id) => `/api/milestones/${id}`,
  update: (id) => `/api/updates/${id}`,
  blocker: (id) => `/api/blockers/${id}`,
  work_item: (id) => `/api/work-items/${id}`,
  decision: () => `/api/decisions`,
  dependency: () => `/api/dependencies`,
};

/** Existing list endpoints that back each tool call. */
function listRefs([tool, input]: ToolCase): string[] {
  const id = typeof input.project === "string" && UUID_1.test(input.project) ? input.project : null;
  const q = (s: unknown) => encodeURIComponent(String(s));
  switch (tool) {
    case "search_records":
      return [`/api/search?q=${q(input.query)}${input.types ? `&types=${(input.types as string[]).join(",")}` : ""}`];
    case "find_helpers":
      return [`/api/search?q=${q(input.topic)}&types=people,teams,projects&limit=5`];
    case "project_blockers":
      return id ? [`/api/blockers?projectId=${id}&open=true`, `/api/dependencies?projectId=${id}`] : [];
    case "project_dependencies":
      return id ? [`/api/dependencies?projectId=${id}`] : [];
    case "project_changes":
      return id ? [`/api/projects/${id}/activity`, `/api/updates?projectId=${id}`, `/api/blockers?projectId=${id}`] : [];
    case "goals_at_risk":
      return ["/api/goals"];
    default:
      return [];
  }
}

function walk(v: unknown, out: { strings: string[]; ids: string[]; records: Array<{ type: string; id: string }> }, key?: string) {
  if (v === null || v === undefined || (key && LABEL_KEYS.has(key))) return;
  if (typeof v === "string") (UUID_1.test(v) ? out.ids : out.strings).push(v);
  else if (Array.isArray(v)) v.forEach((x) => walk(x, out));
  else if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.type === "string" && typeof o.id === "string") out.records.push({ type: o.type, id: o.id });
    for (const [k, x] of Object.entries(o)) walk(x, out, k);
  }
}

function stringLeaves(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => stringLeaves(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => stringLeaves(x, out));
  return out;
}

describe("Ask the Mesh tool layer", () => {
  let app: INestApplication;
  let seed: Seed;
  let prisma: PrismaClient;
  const c = {} as Record<Persona | "rachel", Client>;
  const P = () => seed.work.projects;
  const N = () => seed.northstar.people;
  const refCache = new Map<string, unknown | null>();

  beforeAll(async () => {
    ({ app, seed, prisma } = await bootstrap());
    await plantCanaries(prisma, seed);
    for (const k of [...PERSONAS, "rachel"] as const) c[k] = await login(app, EMAIL[k]);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });


  const tool = async (who: Persona | "rachel", name: string, input: unknown): Promise<ToolBody> => {
    const res = await c[who].post(`/api/copilot/dev/tools/${name}`, input as object);
    if (res.status !== 200) throw new Error(`${who} ${name} ${JSON.stringify(input)} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as ToolBody;
  };

  const get = async (who: Persona, url: string): Promise<unknown | null> => {
    const key = `${who} ${url}`;
    if (!refCache.has(key)) {
      const res = await c[who].get(url);
      refCache.set(key, res.status === 200 ? res.body : null);
    }
    return refCache.get(key)!;
  };

  /** Inputs covering every tool, every visibility class and the restricted records. */
  function cases(): ToolCase[] {
    const keys = ["CHK", "PGW", "SBX", "CHS", "ENT", "HIR", "ATL", "PLG"] as const;
    return [
      ["search_records", { query: "checkout" }],
      ["search_records", { query: "canary" }],
      ["search_records", { query: "atlas diligence acquisition" }],
      ["search_records", { query: "pricing", types: ["projects", "milestones", "teams"] }],
      ...keys.flatMap((k): ToolCase[] => [
        ["get_project", { project: P()[k]! }],
        ["project_blockers", { project: P()[k]! }],
        ["project_dependencies", { project: P()[k]! }],
        ["project_changes", { project: P()[k]!, sinceDays: 30 }],
      ]),
      ["get_project", { project: "Checkout Launch" }],
      ...(["maya", "leo", "yuki", "elena", "rachel", "julia"] as const).map((k): ToolCase => ["person_work", { person: N()[k]! }]),
      ["person_work", { person: "me" }],
      ["find_helpers", { topic: "payments" }],
      ["find_helpers", { topic: "pricing" }],
      ["find_helpers", { topic: "acquisition" }],
      ["goals_at_risk", {}],
    ];
  }

  /**
   * Parity: every record a tool returns is readable by the persona at its canonical endpoint,
   * and every id and every string value in the tool output appears in what the existing API
   * returns to that persona.
   */
  async function assertParity(who: Persona, kase: ToolCase, body: ToolBody) {
    const out = { strings: [] as string[], ids: [] as string[], records: [] as Array<{ type: string; id: string }> };
    walk(body.result, out);
    const urls = new Set(listRefs(kase));
    for (const r of out.records) {
      const canon = CANONICAL[r.type];
      if (!canon) continue;
      const url = canon(r.id);
      const payload = await get(who, url);
      expect({ who, kase, record: r, visible: payload !== null }).toEqual({ who, kase, record: r, visible: true });
      urls.add(url);
    }
    const payloads = (await Promise.all([...urls].map((u) => get(who, u)))).filter((p) => p !== null);
    const refText = payloads.map((p) => JSON.stringify(p)).join("\n");
    const refIds = new Set(refText.match(UUID_G) ?? []);
    const refStrings = payloads.flatMap((p) => stringLeaves(p));
    const missingIds = out.ids.filter((id) => !refIds.has(id));
    const missingStrings = out.strings.filter((s) => !refStrings.some((r) => r.includes(s)));
    expect({ who, kase, missingIds, missingStrings }).toEqual({ who, kase, missingIds: [], missingStrings: [] });
  }

  describe.each(PERSONAS)("as %s", (who) => {
    it(
      "every tool returns only what the existing API already shows this persona, and no canary",
      async () => {
        for (const kase of cases()) {
          const body = await tool(who, kase[0], kase[1]);
          const text = JSON.stringify(body);
          const leaked = FORBIDDEN[who].filter((canary) => text.includes(canary));
          expect({ who, kase, leaked }).toEqual({ who, kase, leaked: [] });
          if (body.result.found) await assertParity(who, kase, body);
          // The citation ledger only ever holds what the result itself contains.
          for (const r of body.records) expect(text.split(r.id).length).toBeGreaterThan(2);
        }
      },
      300_000,
    );

    it("aggregates match the existing API and cover only visible projects", async () => {
      const goals = (await get(who, "/api/goals")) as { goals: Array<{ id: string; projectCount: number; atRisk: number; blocked: number; progress: number | null }> };
      const body = await tool(who, "goals_at_risk", {});
      const toolGoals = (body.result.goals ?? []) as Array<{ id: string; projectCount: number; atRisk: number; blocked: number; progress: number | null }>;
      expect(toolGoals.map((g) => g.id).sort()).toEqual(goals.goals.map((g) => g.id).sort());
      for (const g of toolGoals) {
        const api = goals.goals.find((x) => x.id === g.id)!;
        expect({ projectCount: g.projectCount, atRisk: g.atRisk, blocked: g.blocked, progress: g.progress }).toEqual({ projectCount: api.projectCount, atRisk: api.atRisk, blocked: api.blocked, progress: api.progress });
      }
      const visible = ((await get(who, "/api/projects")) as Array<{ id: string }>).map((p) => p.id);
      const counted = toolGoals.reduce((n, g) => n + g.projectCount, 0);
      expect(counted).toBeLessThanOrEqual(visible.length);
    });
  });

  describe("restricted records look exactly like records that don't exist", () => {
    const pairs = (): Array<[string, unknown, unknown]> => [
      ...["get_project", "project_blockers", "project_dependencies"].flatMap((t): Array<[string, unknown, unknown]> => [
        [t, { project: P().ATL }, { project: randomUUID() }],
        [t, { project: "Project Atlas" }, { project: "Project Zephyr" }],
        [t, { project: "ATL" }, { project: "ZPH" }],
      ]),
      ["project_changes", { project: P().ATL, sinceDays: 30 }, { project: randomUUID(), sinceDays: 30 }],
      ["project_changes", { project: "Project Atlas" }, { project: "Project Zephyr" }],
      ["search_records", { query: "Project Atlas" }, { query: "Project Zephyr" }],
      ["search_records", { query: "Atlas" }, { query: "Zephyr" }],
      ["search_records", { query: "acquisition" }, { query: "zymurgy" }],
      ["search_records", { query: "diligence" }, { query: "zymurgy" }],
      ["search_records", { query: "canary" }, { query: "zymurgy" }],
      ["search_records", { query: "Strategic expansion options" }, { query: "Quokka expansion options" }],
      ["search_records", { query: "Atlas evaluation", types: ["initiatives", "goals"] }, { query: "Zephyr evaluation", types: ["initiatives", "goals"] }],
      ["find_helpers", { topic: "Atlas" }, { topic: "Zephyr" }],
      ["find_helpers", { topic: "acquisition" }, { topic: "zymurgy" }],
    ];

    it.each(NO_ATLAS)("for %s: Atlas ≡ a made-up name, byte for byte", async (who) => {
      for (const [name, restricted, madeUp] of pairs()) {
        const a = await tool(who, name, restricted);
        const b = await tool(who, name, madeUp);
        expect({ name, restricted, result: a.result, records: a.records }).toEqual({ name, restricted, result: { found: false }, records: [] });
        expect(JSON.stringify(a.result)).toBe(JSON.stringify(b.result));
      }
    });

    it("positive control: Elena (Atlas lead) does receive the planted records", async () => {
      const text = JSON.stringify(
        await Promise.all([
          tool("elena", "get_project", { project: "Project Atlas" }),
          tool("elena", "project_blockers", { project: P().ATL }),
          tool("elena", "project_changes", { project: P().ATL, sinceDays: 30 }),
          tool("elena", "project_dependencies", { project: P().CHK }),
          tool("elena", "goals_at_risk", {}),
        ]),
      );
      for (const canary of ATLAS_CANARIES) expect({ canary, seen: text.includes(canary) }).toEqual({ canary, seen: true });
    });

    it("positive control: Rachel (Sales) sees Enterprise Pricing details; Sam (member) sees Hiring", async () => {
      expect(JSON.stringify(await tool("rachel", "get_project", { project: P().ENT }))).toContain(C.ent);
      expect(JSON.stringify(await tool("sam", "get_project", { project: P().HIR }))).toContain(C.hir);
    });

    it("a hidden upstream project leaves no trace on a visible downstream project", async () => {
      for (const who of ["maya", "daniel", "priya", "sam"] as const) {
        const deps = await tool(who, "project_dependencies", { project: P().CHK });
        const blockers = await tool(who, "project_blockers", { project: P().CHK });
        const text = JSON.stringify([deps, blockers]);
        expect(text).not.toContain(P().ATL);
        expect(text).not.toContain("Atlas");
      }
    });
  });

  describe("tenant isolation", () => {
    it("Noah (Meridian) receives no Northstar data from any tool", async () => {
      const ns = seed.northstar.orgId;
      const md = seed.meridian.orgId;
      const [projects, people, goals, teams] = await Promise.all([
        prisma.project.findMany({ where: { organizationId: ns }, select: { id: true, name: true } }),
        prisma.employeeProfile.findMany({ where: { membership: { organizationId: ns } }, select: { membershipId: true, displayName: true } }),
        prisma.companyGoal.findMany({ where: { organizationId: ns }, select: { id: true, title: true } }),
        prisma.team.findMany({ where: { organizationId: ns }, select: { id: true } }),
      ]);
      const meridianText = JSON.stringify(await prisma.project.findMany({ where: { organizationId: md } })) + JSON.stringify(await prisma.employeeProfile.findMany({ where: { membership: { organizationId: md } } }));
      const nsIds = new Set([...projects.map((p) => p.id), ...people.map((p) => p.membershipId), ...goals.map((g) => g.id), ...teams.map((t) => t.id)]);
      const nsNames = [...projects.map((p) => p.name), ...people.map((p) => p.displayName), ...goals.map((g) => g.title)].filter((n) => !meridianText.includes(n));

      const outputs: ToolBody[] = [];
      for (const [name, input] of cases()) {
        const body = await tool("noah", name, input);
        // A Northstar id resolves to nothing in Meridian. (Names may legitimately match Meridian's own
        // records, e.g. "payments"; the id/name leak check below covers those.)
        if (Object.values(input).some((v) => typeof v === "string" && UUID_1.test(v))) expect({ name, input, result: body.result }).toEqual({ name, input, result: { found: false } });
        outputs.push(body);
      }
      outputs.push(await tool("noah", "get_project", { project: seed.work.meridian.projectId }));
      const text = JSON.stringify(outputs);
      const leakedIds = (text.match(UUID_G) ?? []).filter((id) => nsIds.has(id));
      const leakedNames = nsNames.filter((n) => text.includes(n));
      expect({ leakedIds, leakedNames }).toEqual({ leakedIds: [], leakedNames: [] });
      // Positive control: Noah's own tenant is visible.
      expect(outputs.at(-1)!.result.found).toBe(true);
      expect((await tool("noah", "goals_at_risk", {})).result.found).toBe(true);
    });
  });

  describe("read-only by construction", () => {
    it("a tool transaction rejects writes at the database", async () => {
      const db = app.get(Db);
      const runner = app.get(CopilotToolRunner);
      const authz = app.get(AuthzService);
      const orgId = seed.northstar.orgId;
      const membershipId = N().maya!;
      const { userId } = await prisma.membership.findUniqueOrThrow({ where: { id: membershipId }, select: { userId: true } });
      const loaded = await db.runAsTenant(orgId, () => authz.load(orgId, membershipId, userId));
      const auth = { orgId, membershipId, ctx: loaded!.ctx, scope: loaded!.scope, requestId: "read-only-test" };
      const before = await prisma.blocker.count({ where: { title: "should never exist" } });
      await expect(
        runner.readOnly(auth, () => db.tx.blocker.create({ data: { organizationId: orgId, title: "should never exist", reporterId: membershipId } })),
      ).rejects.toThrow(/read-only transaction/);
      expect(await prisma.blocker.count({ where: { title: "should never exist" } })).toBe(before);
      // Reads still work in the same kind of transaction.
      await expect(runner.readOnly(auth, () => db.tx.project.count())).resolves.toBeGreaterThan(0);
    });
  });

  describe("the DEMO-only tool endpoint", () => {
    const withEnv = async (env: Record<string, string>, fn: () => Promise<void>) => {
      const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
      Object.assign(process.env, env);
      resetConfigCache();
      try {
        await fn();
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
        resetConfigCache();
      }
    };

    it("is 404 unless both COPILOT_ENABLED and DEMO_MODE are on", async () => {
      await withEnv({ COPILOT_ENABLED: "false" }, async () => {
        await c.maya.post("/api/copilot/dev/tools/goals_at_risk", {}).expect(404);
        await c.maya.get("/api/copilot/dev/tools").expect(404);
      });
      await withEnv({ DEMO_MODE: "false" }, async () => {
        await c.maya.post("/api/copilot/dev/tools/goals_at_risk", {}).expect(404);
      });
      await c.maya.get("/api/copilot/dev/tools").expect(200);
    });

    it("requires a session and a CSRF token, validates input, and 404s unknown tools", async () => {
      await request(app.getHttpServer()).post("/api/copilot/dev/tools/goals_at_risk").send({}).expect(401);
      await c.maya.agent.post("/api/copilot/dev/tools/goals_at_risk").set("Origin", "http://localhost:3002").send({}).expect(403);
      await c.maya.post("/api/copilot/dev/tools/no_such_tool", {}).expect(404);
      const bad = await c.maya.post("/api/copilot/dev/tools/get_project", { project: 42 }).expect(400);
      expect(bad.body.code).toBe("VALIDATION_FAILED");
      await c.maya.post("/api/copilot/dev/tools/get_project", { project: "Checkout Launch", extra: true }).expect(400);
    });
  });
});
