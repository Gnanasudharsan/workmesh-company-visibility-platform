import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { bootstrap, EMAIL, login, type Client, type Seed } from "./helpers";

/** Authorization matrix exercised end-to-end through the HTTP API against real data. */
describe("authorization through the API", () => {
  let app: INestApplication;
  let seed: Seed;
  let prisma: PrismaClient;
  const c: Record<string, Client> = {};
  const P = () => seed.work.projects;

  beforeAll(async () => {
    ({ app, seed, prisma } = await bootstrap());
    for (const k of ["maya", "daniel", "priya", "marcus", "aisha", "sam", "elena", "lars", "fatima", "zoe", "rachel"] as const) c[k] = await login(app, EMAIL[k]);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const access = async (who: string, key: string) => {
    const res = await c[who]!.get(`/api/projects/${P()[key]}`);
    return res.status === 404 ? "none" : (res.body.access as string);
  };

  it.each([
    // Example A: public roadmap yes, confidential acquisition no
    ["maya", "CHK", "details"],
    ["maya", "ATL", "none"],
    ["maya", "SBX", "summary"], // TEAM project of Platform, discoverable
    ["maya", "ENT", "none"], // TEAM project of Sales, not discoverable
    ["maya", "HIR", "none"], // members-only, not discoverable
    ["maya", "CHS", "summary"], // members-only, discoverable
    ["rachel", "ENT", "details"],
    // Example C: project lead sees details of a project she leads
    ["priya", "CHK", "details"],
    // Example D: executives see summaries, not restricted projects
    ["marcus", "CHS", "summary"], // department head: members-only projects give heads a summary, never details
    ["marcus", "ATL", "none"],
    ["marcus", "HIR", "summary"],
    // Explicit grant
    ["aisha", "ATL", "details"],
    // Admin configuration power does not imply content access
    ["sam", "ATL", "none"],
    ["sam", "ENT", "none"],
  ])("%s → %s = %s", async (who, key, expected) => {
    expect(await access(who, key)).toBe(expected);
  });

  it("summary responses never include detailed content", async () => {
    const res = await c.maya!.get(`/api/projects/${P().CHS}`).expect(200);
    expect(res.body.access).toBe("summary");
    expect(res.body.description).toBeNull();
    expect(res.body.members).toEqual([]);
    expect(res.body.milestoneList).toEqual([]);
    expect((await c.maya!.get(`/api/projects/${P().CHS}/work-items`)).status).toBe(404);
    expect((await c.maya!.get(`/api/milestones/${seed.work.milestones.CHS![0]}`)).status).toBe(404);
  });

  it("Example B: managers see shared updates in their reporting line but never private drafts", async () => {
    const mine = await c.maya!.get("/api/updates?drafts=true").expect(200);
    expect(mine.body).toHaveLength(1);
    const draftId = mine.body[0].id;
    expect((await c.daniel!.get(`/api/updates/${draftId}`)).status).toBe(404);
    expect((await c.marcus!.get(`/api/updates/${draftId}`)).status).toBe(404);
    expect((await c.sam!.get(`/api/updates/${draftId}`)).status).toBe(404);
    const feed = await c.daniel!.get(`/api/updates?authorId=${seed.northstar.people.maya}`).expect(200);
    expect(feed.body.length).toBeGreaterThan(0);
    expect(feed.body.every((u: { status: string }) => u.status === "PUBLISHED")).toBe(true);
    expect(JSON.stringify(feed.body)).not.toContain("mocking the processor");
  });

  it("Example C: a project lead sees contributor updates without managing them", async () => {
    const res = await c.priya!.get(`/api/updates?projectId=${P().CHK}`).expect(200);
    expect(res.body.some((u: { author: { name: string } }) => u.author.name === "Leo Martins")).toBe(true);
    // Leo's TEAM-visibility update on PGW is not visible to Priya (not Payments team? she is, via extra membership)
    const outsider = await c.zoe!.get(`/api/updates?projectId=${P().CHK}`).expect(200);
    expect(outsider.body.every((u: { visibility: string }) => u.visibility === "ORG")).toBe(true);
  });

  it("only the author can edit an update", async () => {
    const feed = await c.daniel!.get(`/api/updates?authorId=${seed.northstar.people.maya}`).expect(200);
    const u = feed.body[0];
    expect((await c.daniel!.patch(`/api/updates/${u.id}`, { currentFocus: "edited by manager", version: u.version })).status).toBe(403);
  });

  it("Example E: removing a project member revokes access immediately", async () => {
    expect(await access("lars", "CHS")).toBe("details");
    await c.fatima!.del(`/api/projects/${P().CHS}/members/${seed.northstar.people.lars}`).expect(204);
    expect(await access("lars", "CHS")).toBe("summary"); // discoverable summary only
    expect((await c.lars!.get(`/api/projects/${P().CHS}/work-items`)).status).toBe(404);
    await c.fatima!.put(`/api/projects/${P().CHS}/members/${seed.northstar.people.lars}`, { role: "CONTRIBUTOR" }).expect(200);
    expect(await access("lars", "CHS")).toBe("details");
  });

  it("Example F: delegated management grants Team Pulse access that ends when revoked", async () => {
    const zoe = seed.northstar.people.zoe!;
    const pulse = await c.fatima!.get("/api/dashboard/manager").expect(200);
    expect(pulse.body.reports.some((r: { person: { id: string } }) => r.person.id === zoe)).toBe(true);
    const person = await c.fatima!.get(`/api/people/${zoe}`).expect(200);
    expect(person.body.canSeeWork).toBe(true);

    const delegation = await prisma.delegation.findFirst({ where: { delegateId: seed.northstar.people.fatima, revokedAt: null } });
    await c.sam!.del(`/api/delegations/${delegation!.id}`).expect(204);
    const after = await c.fatima!.get(`/api/people/${zoe}`).expect(200);
    expect(after.body.canSeeWork).toBe(false);
    const pulse2 = await c.fatima!.get("/api/dashboard/manager").expect(200);
    expect(pulse2.body.reports.some((r: { person: { id: string } }) => r.person.id === zoe)).toBe(false);
  });

  it("an expired delegation grants nothing", async () => {
    // Daniel → Hannah delegation in the seed expired weeks ago; Hannah only sees her own reports.
    const hannah = await login(app, EMAIL.hannah);
    const res = await hannah.get(`/api/people/${seed.northstar.people.leo}`).expect(200);
    expect(res.body.canSeeWork).toBe(false);
  });

  it("filters search, graph and export results before they leave the server", async () => {
    const s = await c.maya!.get("/api/search?q=atlas").expect(200);
    expect(s.body.results.projects).toEqual([]);
    expect(JSON.stringify(s.body)).not.toMatch(/Atlas/);
    const s2 = await c.elena!.get("/api/search?q=atlas").expect(200);
    expect(s2.body.results.projects.map((p: { key: string }) => p.key)).toContain("ATL");

    const g = await c.maya!.get("/api/graph/work").expect(200);
    expect(JSON.stringify(g.body)).not.toMatch(/Atlas|Hiring Plan|Enterprise Pricing/);
    const g2 = await c.aisha!.get("/api/graph/work").expect(200);
    expect(JSON.stringify(g2.body)).toContain("Project Atlas");

    const csv = await c.maya!.get("/api/projects/export.csv").expect(200);
    expect(csv.text).not.toMatch(/Atlas|Hiring Plan/);
    expect(csv.text).toContain("Checkout Launch");

    const deps = await c.maya!.get("/api/dependencies").expect(200);
    const names = deps.body.nodes.map((n: { key: string }) => n.key);
    expect(names).not.toContain("ATL");
  });

  it("restricted goals are invisible without a relationship", async () => {
    const tree = await c.marcus!.get("/api/goals").expect(200);
    expect(JSON.stringify(tree.body)).not.toContain("Strategic expansion");
    expect((await c.marcus!.get(`/api/goals/${seed.work.goals.strategic}`)).status).toBe(404);
    const ceo = await c.elena!.get("/api/goals").expect(200);
    expect(JSON.stringify(ceo.body)).toContain("Strategic expansion");
  });

  it("restricts administration to administrators", async () => {
    expect((await c.maya!.get("/api/admin/members")).status).toBe(403);
    expect((await c.marcus!.get("/api/admin/audit")).status).toBe(403);
    expect((await c.sam!.get("/api/admin/members")).status).toBe(200);
    expect((await c.maya!.post("/api/departments", { name: "Shadow IT" })).status).toBe(403);
  });

  it("the permission inspector explains decisions but cannot probe resources the admin can't see", async () => {
    const res = await c.sam!.get(`/api/admin/permissions/inspect?memberId=${seed.northstar.people.maya}&resourceType=project&resourceId=${P().CHK}`).expect(200);
    expect(res.body.checks.find((x: { capability: string }) => x.capability === "project.viewDetails").allow).toBe(true);
    expect((await c.sam!.get(`/api/admin/permissions/inspect?memberId=${seed.northstar.people.aisha}&resourceType=project&resourceId=${P().ATL}`)).status).toBe(404);
  });

  it("derives workspaces from real relationships, not from the client", async () => {
    const ws = async (k: string) => (await c[k]!.get("/api/auth/me").expect(200)).body.active.workspaces;
    expect(await ws("maya")).toEqual(["employee"]);
    expect(await ws("daniel")).toEqual(expect.arrayContaining(["employee", "manager", "lead"]));
    expect(await ws("priya")).toEqual(expect.arrayContaining(["lead"]));
    expect(await ws("priya")).not.toContain("manager");
    expect(await ws("elena")).toEqual(expect.arrayContaining(["leadership", "admin"]));
    expect(await ws("sam")).toContain("admin");
    expect((await c.maya!.get("/api/dashboard/manager")).status).toBe(403);
  });

  it("rejects writes without a CSRF token", async () => {
    const res = await c.maya!.agent.post("/api/updates").send({ currentFocus: "no csrf" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF");
  });
});
