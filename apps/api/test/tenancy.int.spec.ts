import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { bootstrap, EMAIL, login, type Client, type Seed } from "./helpers";

/** Journey G + mandatory tenant isolation test. */
describe("tenant isolation", () => {
  let app: INestApplication;
  let seed: Seed;
  let prisma: PrismaClient;
  let meridian: Client;
  let northstar: Client;

  beforeAll(async () => {
    ({ app, seed, prisma } = await bootstrap());
    meridian = await login(app, EMAIL.noah); // OWNER of Meridian: the most privileged foreign user
    northstar = await login(app, EMAIL.elena);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("denies direct access to another tenant's records by exact ID (404, no existence leak)", async () => {
    const w = seed.work;
    const probes = [
      `/api/projects/${w.projects.PGW}`,
      `/api/projects/${w.projects.ATL}`,
      `/api/goals/${w.goals.revenue}`,
      `/api/initiatives/${w.initiatives.selfserve}`,
      `/api/milestones/${w.milestones.PGW![0]}`,
      `/api/work-items/${w.items.PGW![0]}`,
      `/api/meetings/${w.meetings.prevSync}`,
      `/api/meetings/${w.meetings.prevSync}/brief`,
      `/api/people/${seed.northstar.people.maya}`,
      `/api/teams/${seed.northstar.teams.payments}`,
      `/api/departments/${seed.northstar.departments.eng}`,
      `/api/projects/${w.projects.PGW}/work-items`,
      `/api/projects/${w.projects.PGW}/activity`,
    ];
    for (const url of probes) {
      const res = await meridian.get(url);
      expect({ url, status: res.status }).toEqual({ url, status: 404 });
    }
  });

  it("denies updates to another tenant's records", async () => {
    const w = seed.work;
    expect((await meridian.patch(`/api/projects/${w.projects.PGW}`, { name: "pwned", version: 1 })).status).toBe(404);
    expect((await meridian.post(`/api/projects/${w.projects.PGW}/status`, { status: "CANCELLED", version: 1 })).status).toBe(404);
    expect((await meridian.post(`/api/projects/${w.projects.PGW}/milestones`, { title: "Injected milestone" })).status).toBe(404);
    expect((await meridian.put(`/api/teams/${seed.northstar.teams.payments}/members/${seed.meridian.people.ivy}`, {})).status).toBe(404);
    expect((await meridian.post("/api/reporting", { reportId: seed.northstar.people.maya, managerId: seed.meridian.people.noah, type: "PRIMARY" })).status).toBe(422);
    const row = await prisma.project.findUnique({ where: { id: w.projects.PGW } });
    expect(row!.name).toBe("Payment Gateway Integration");
  });

  it("cannot switch the session into another organization", async () => {
    expect((await meridian.post("/api/auth/switch-organization", { organizationId: seed.northstar.orgId })).status).toBe(404);
    const me = await meridian.get("/api/auth/me").expect(200);
    expect(me.body.active.organization.id).toBe(seed.meridian.orgId);
  });

  it("returns no foreign results from lists, search, graphs, exports, or the directory", async () => {
    const projects = await meridian.get("/api/projects").expect(200);
    expect(projects.body.map((p: { name: string }) => p.name)).toEqual(["Meridian Payment Gateway Secret"]);

    const search = await meridian.get("/api/search?q=payment").expect(200);
    const blob = JSON.stringify(search.body);
    expect(blob).not.toContain("Northstar");
    expect(blob).not.toContain("Payment Gateway Integration");

    const people = await meridian.get("/api/graph/people?all=true").expect(200);
    expect(JSON.stringify(people.body)).not.toContain("Maya Chen");
    const work = await meridian.get("/api/graph/work").expect(200);
    expect(JSON.stringify(work.body)).not.toContain("Checkout Launch");

    const csv = await meridian.get("/api/projects/export.csv").expect(200);
    expect(csv.text).not.toContain("Checkout");
    expect((await meridian.get("/api/people").expect(200)).body).toHaveLength(6);
  });

  it("does not leak the other tenant's data in the reverse direction either", async () => {
    const res = await northstar.get(`/api/projects/${seed.work.meridian.projectId}`);
    expect(res.status).toBe(404);
    const search = await northstar.get("/api/search?q=meridian").expect(200);
    expect(search.body.total).toBe(0);
  });

  describe("PostgreSQL row-level security (defense in depth)", () => {
    let app_: PrismaClient;
    beforeAll(() => {
      app_ = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
    });
    afterAll(() => app_.$disconnect());

    it("returns zero rows for the application role without a tenant context", async () => {
      expect(await app_.project.count()).toBe(0);
      expect(await app_.membership.count()).toBe(0);
    });

    it("only exposes the current tenant's rows inside a tenant transaction, even when asked for foreign IDs", async () => {
      const rows = await app_.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.org_id', ${seed.meridian.orgId}, true)`;
        return {
          foreign: await tx.project.findUnique({ where: { id: seed.work.projects.PGW } }),
          all: await tx.project.findMany({ select: { organizationId: true } }),
        };
      });
      expect(rows.foreign).toBeNull();
      expect(new Set(rows.all.map((r) => r.organizationId))).toEqual(new Set([seed.meridian.orgId]));
    });

    it("blocks writes that target another tenant", async () => {
      await expect(
        app_.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.org_id', ${seed.meridian.orgId}, true)`;
          await tx.department.create({ data: { organizationId: seed.northstar.orgId, name: "Injected", slug: "injected" } });
        }),
      ).rejects.toThrow();
      const updated = await app_.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.org_id', ${seed.meridian.orgId}, true)`;
        return tx.project.updateMany({ where: { id: seed.work.projects.PGW }, data: { name: "pwned" } });
      });
      expect(updated.count).toBe(0);
    });

    it("does not carry tenant context across pooled connections", async () => {
      await app_.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.org_id', ${seed.northstar.orgId}, true)`;
      });
      // A later query on (possibly) the same pooled connection, outside any transaction:
      for (let i = 0; i < 5; i++) expect(await app_.project.count()).toBe(0);
    });

    it("never lets the application role read users or session tokens", async () => {
      await expect(app_.$queryRaw`SELECT "passwordHash" FROM users LIMIT 1`).rejects.toThrow(/permission denied/);
      await expect(app_.$queryRaw`SELECT "tokenHash" FROM sessions LIMIT 1`).rejects.toThrow(/permission denied/);
    });
  });
});
