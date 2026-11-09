import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { bootstrap, EMAIL, login, waitFor, type Client, type Seed } from "./helpers";

describe("critical workflows", () => {
  let app: INestApplication;
  let seed: Seed;
  let prisma: PrismaClient;
  const c: Record<string, Client> = {};
  const M = () => seed.northstar.people;
  const P = () => seed.work.projects;

  beforeAll(async () => {
    ({ app, seed, prisma } = await bootstrap());
    for (const k of ["maya", "daniel", "priya", "hannah", "sam", "zoe", "leo"] as const) c[k] = await login(app, EMAIL[k]);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("Journey A: invitation → acceptance → onboarding shows manager, team and projects", async () => {
    const inv = await c.sam!.post("/api/admin/invitations", { email: "new.hire@northstar.example", role: "MEMBER", title: "Software Engineer", teamId: seed.northstar.teams.payments, managerId: M().daniel }).expect(201);
    expect((await c.sam!.post("/api/admin/invitations", { email: "NEW.hire@northstar.example" })).status).toBe(409); // duplicate pending
    const token = new URL(inv.body.devLink).pathname.split("/").pop()!;
    const mail = await prisma.mailMessage.findFirst({ where: { to: "new.hire@northstar.example" }, orderBy: { createdAt: "desc" } });
    expect(mail?.link).toBe(inv.body.devLink);

    const lookup = await request(app.getHttpServer()).get(`/api/invitations/lookup/${token}`).expect(200);
    expect(lookup.body).toMatchObject({ organizationName: "Northstar Labs", status: "PENDING", existingAccount: false });

    const agent = request.agent(app.getHttpServer());
    await agent.post("/api/invitations/accept").send({ token, name: "Nova Hire", password: "a-strong-password" }).expect(200);
    expect((await request(app.getHttpServer()).post("/api/invitations/accept").send({ token, name: "Again", password: "a-strong-password" })).status).toBe(422); // single use

    const onboarding = await agent.get("/api/onboarding").expect(200);
    expect(onboarding.body.manager.name).toBe("Daniel Okafor");
    expect(onboarding.body.team.name).toBe("Payments");
    expect(JSON.stringify(onboarding.body)).not.toContain("Project Atlas");
    const graph = await agent.get("/api/graph/work").expect(200);
    expect(JSON.stringify(graph.body)).not.toContain("Atlas");
  });

  it("invitations expire, can be resent (rotating the token) and revoked", async () => {
    const inv = await c.sam!.post("/api/admin/invitations", { email: "late@northstar.example" }).expect(201);
    const oldToken = new URL(inv.body.devLink).pathname.split("/").pop()!;
    await prisma.invitation.update({ where: { id: inv.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app.getHttpServer()).get(`/api/invitations/lookup/${oldToken}`)).body.status).toBe("EXPIRED");
    const resent = await c.sam!.post(`/api/admin/invitations/${inv.body.id}/resend`).expect(201);
    const newToken = new URL(resent.body.devLink).pathname.split("/").pop()!;
    expect((await request(app.getHttpServer()).get(`/api/invitations/lookup/${oldToken}`)).status).toBe(404);
    expect((await request(app.getHttpServer()).get(`/api/invitations/lookup/${newToken}`)).body.status).toBe("PENDING");
    await c.sam!.post(`/api/admin/invitations/${inv.body.id}/revoke`).expect(200);
    expect((await request(app.getHttpServer()).post("/api/invitations/accept").send({ token: newToken, name: "Late", password: "a-strong-password" })).status).toBe(422);
  });

  it("Journeys B & C: update + blocker → manager sees it → assigns owner → resolves → employee sees change", async () => {
    const res = await c.maya!.post("/api/updates", {
      projectId: P().PGW, stage: "TESTING", currentFocus: "Running the webhook test harness", nextSteps: "Retry once credentials land", visibility: "PROJECT", publish: true,
      blocker: { title: "Sandbox webhook endpoint returns 403", severity: "HIGH" },
    }).expect(201);
    const blockerId = res.body.blocker.id as string;

    const pulse = await c.daniel!.get("/api/dashboard/manager").expect(200);
    const mayaRow = pulse.body.reports.find((r: { person: { id: string } }) => r.person.id === M().maya);
    expect(mayaRow.latestUpdate.stage).toBe("TESTING");
    expect(mayaRow.blockers.map((b: { id: string }) => b.id)).toContain(blockerId);
    expect(pulse.body.blockerQueue.map((b: { id: string }) => b.id)).toContain(blockerId);

    expect((await c.priya!.get(`/api/blockers/${blockerId}`)).status).toBe(200); // project member/lead of linked work
    expect((await c.zoe!.get(`/api/blockers/${blockerId}`)).status).toBe(200); // PGW is ORG-visible
    const outsider = await login(app, EMAIL.rachel);
    expect((await outsider.post(`/api/blockers/${blockerId}/assign`, { ownerId: M().rachel, version: 1 })).status).toBe(403);

    await c.daniel!.post(`/api/blockers/${blockerId}/assign`, { ownerId: M().hannah, version: 1, note: "Platform owns sandbox access" }).expect(200);
    await c.daniel!.post("/api/decisions", { title: "Escalate sandbox access with the processor today", projectId: P().PGW, ownerId: M().daniel, status: "DECIDED" }).expect(201);
    expect((await c.hannah!.post(`/api/blockers/${blockerId}/transition`, { state: "RESOLVED", version: 2 })).body.code).toBe("RESOLUTION_REQUIRED");
    await c.hannah!.post(`/api/blockers/${blockerId}/transition`, { state: "RESOLVED", version: 2, resolutionNotes: "Allow-listed the webhook IP." }).expect(200);

    const detail = await c.maya!.get(`/api/blockers/${blockerId}`).expect(200);
    expect(detail.body.state).toBe("RESOLVED");
    expect(detail.body.events.map((e: { toState: string }) => e.toState)).toEqual(["OPEN", "ASSIGNED", "RESOLVED"]);

    // Background delivery: Hannah was notified of the assignment; Maya of the state change.
    await waitFor(() => prisma.notification.findFirst({ where: { recipientId: M().hannah, type: "BLOCKER_ASSIGNED", entityId: blockerId } }));
    await waitFor(() => prisma.notification.findFirst({ where: { recipientId: M().maya, type: "BLOCKER_CHANGED", entityId: blockerId } }));
    const notifs = await c.hannah!.get("/api/notifications").expect(200);
    expect(notifs.body.items.some((n: { entityId: string }) => n.entityId === blockerId)).toBe(true);
  });

  it("does not notify anyone who cannot see the record, and payloads hide restricted project names", async () => {
    const elena = await login(app, EMAIL.elena);
    const atl = await elena.post("/api/updates", { projectId: P().ATL, currentFocus: "Term sheet redlines", visibility: "PROJECT", publish: true, helpNeeded: "Need finance review" }).expect(201);
    // Elena's management chain is empty; Atlas members are Yuki/Mark. Nobody outside Atlas gets notified.
    await waitFor(() => prisma.outboxEvent.findFirst({ where: { type: "update.published", payload: { path: ["updateId"], equals: atl.body.update.id }, processedAt: { not: null } } }));
    const leaked = await prisma.notification.findMany({ where: { entityId: atl.body.update.id } });
    const atlasMembers = new Set([M().elena, M().yuki, M().mark]);
    expect(leaked.every((n) => atlasMembers.has(n.recipientId))).toBe(true);
    const all = await prisma.notification.findMany({ where: { recipientId: { notIn: [...atlasMembers, M().aisha!] } } });
    expect(all.some((n) => /Atlas/.test(n.title + (n.body ?? "")))).toBe(false);
  });

  it("deduplicates notifications when the same event is delivered twice", async () => {
    const ev = await prisma.outboxEvent.findFirst({ where: { type: "blocker.assigned", processedAt: { not: null } } });
    const before = await prisma.notification.count();
    await prisma.outboxEvent.update({ where: { id: ev!.id }, data: { processedAt: null } });
    const { DeliveryService } = await import("../src/modules/notifications/delivery.service");
    await app.get(DeliveryService).deliver(ev!.id);
    expect(await prisma.notification.count()).toBe(before);
  });

  it("Journey E: dependency chain, cycle rejection and downstream impact", async () => {
    const explorer = await c.priya!.get(`/api/dependencies?projectId=${P().CHK}`).expect(200);
    const confirmed = explorer.body.impact.confirmed.map((x: { id: string }) => x.id);
    const potential = explorer.body.impact.potential.map((x: { id: string }) => x.id);
    expect(confirmed).toContain(P().SBX); // status BLOCKED
    expect(potential).toContain(P().CHK); // reachable downstream, not claimed as definitely late
    const cycle = await c.priya!.post("/api/dependencies", { upstreamProjectId: P().CHK, downstreamProjectId: P().SBX, description: "would be circular" });
    expect(cycle.status).toBe(403); // Priya knows SBX exists (summary) but cannot edit it as the dependent project
    const cycle2 = await c.leo!.post("/api/dependencies", { upstreamProjectId: P().CHK, downstreamProjectId: P().PGW, description: "Gateway waits on checkout" });
    expect(cycle2.status).toBe(422);
    expect(cycle2.body.code).toBe("DEPENDENCY_CYCLE");

    const edge = explorer.body.edges.find((e: { upstreamId: string; downstreamId: string }) => e.upstreamId === P().SBX);
    await c.hannah!.patch(`/api/dependencies/${edge.id}`, { state: "RESOLVED" }).expect(200);
    await c.hannah!.post(`/api/projects/${P().SBX}/status`, { status: "IN_PROGRESS", version: 1 }).expect(200);
    // Still confirmed while its critical blocker is open — the owner resolves it.
    const stillBlocked = await c.priya!.get(`/api/dependencies?projectId=${P().CHK}`).expect(200);
    expect(stillBlocked.body.impact.confirmed.find((x: { id: string }) => x.id === P().SBX).reasons).toContain("Open high-severity blocker");
    const open = await c.hannah!.get(`/api/blockers?projectId=${P().SBX}&open=true`).expect(200);
    for (const b of open.body) await c.hannah!.post(`/api/blockers/${b.id}/transition`, { state: "RESOLVED", version: b.version, resolutionNotes: "Processor issued sandbox keys." }).expect(200);
    const after = await c.priya!.get(`/api/dependencies?projectId=${P().CHK}`).expect(200);
    expect(after.body.impact.confirmed.map((x: { id: string }) => x.id)).not.toContain(P().SBX);
  });

  it("Journey F: meeting brief from real changes → decision → action item visible to participant", async () => {
    const meetingId = seed.work.meetings.nextSync;
    const brief = await c.daniel!.get(`/api/meetings/${meetingId}/brief`).expect(200);
    const sections = Object.fromEntries(brief.body.sections.map((s: { key: string; items: unknown[] }) => [s.key, s.items]));
    expect(sections.newBlockers.length + sections.unresolvedBlockers.length).toBeGreaterThan(0);
    expect(sections.decisionsRequired.length).toBeGreaterThan(0);
    expect(sections.pendingActionItems.length).toBeGreaterThan(0);
    for (const s of brief.body.sections) for (const item of s.items) expect(item.ref.id).toBeTruthy();

    const decision = await c.daniel!.post(`/api/meetings/${meetingId}/decisions`, { title: "Ship checkout behind a feature flag", projectId: P().CHK, status: "DECIDED", ownerId: M().priya }).expect(201);
    await c.daniel!.post(`/api/meetings/${meetingId}/action-items`, { title: "Set up the checkout feature flag", ownerId: M().maya, projectId: P().CHK, decisionId: decision.body.id, dueDate: new Date(Date.now() + 3 * 86400000).toISOString() }).expect(201);
    const mine = await c.maya!.get("/api/action-items").expect(200);
    expect(mine.body.map((a: { title: string }) => a.title)).toContain("Set up the checkout feature flag");
    const meeting = await c.maya!.get(`/api/meetings/${meetingId}`).expect(200);
    expect(meeting.body.decisions.map((d: { title: string }) => d.title)).toContain("Ship checkout behind a feature flag");

    const md = await c.daniel!.get(`/api/meetings/${meetingId}/summary.md`).expect(200);
    expect(md.text).toContain("## Decisions");
    expect(md.text).toContain("Ship checkout behind a feature flag");
    const done = await c.daniel!.post(`/api/meetings/${meetingId}/complete`).expect(200);
    expect(done.body.nextMeetingId).toBeTruthy();
    const next = await c.daniel!.get(`/api/meetings/${done.body.nextMeetingId}`).expect(200);
    expect(next.body.agenda.length).toBeGreaterThan(0); // undiscussed items carried over
    expect((await c.zoe!.get(`/api/meetings/${meetingId}`)).status).toBe(404); // not a participant
  });

  it("rejects invalid reporting changes and preserves history on reorg", async () => {
    expect((await c.sam!.post("/api/reporting", { reportId: M().daniel, managerId: M().maya, type: "PRIMARY" })).body.code).toBe("CYCLE");
    expect((await c.sam!.post("/api/reporting", { reportId: M().maya, managerId: M().maya, type: "PRIMARY" })).body.code).toBe("SELF_MANAGEMENT");
    expect((await c.daniel!.post("/api/reporting", { reportId: M().maya, managerId: M().hannah, type: "PRIMARY" })).status).toBe(403);
    await c.sam!.post("/api/reporting", { reportId: M().maya, managerId: M().hannah, type: "PRIMARY", reason: "Moved to Platform" }).expect(201);
    const history = await c.sam!.get(`/api/reporting/${M().maya}/history`).expect(200);
    const asReport = history.body.filter((h: { report: { id: string } }) => h.report.id === M().maya);
    expect(asReport).toHaveLength(2);
    expect(asReport.find((h: { manager: { name: string } }) => h.manager.name === "Daniel Okafor").endedAt).not.toBeNull();
    const audit = await c.sam!.get("/api/admin/audit?action=reporting").expect(200);
    expect(audit.body.items[0].metadata.before.managerId).toBe(M().daniel);
    // Daniel immediately loses Maya from his direct reports, Hannah gains her.
    const hannahPulse = await c.hannah!.get("/api/dashboard/manager").expect(200);
    expect(hannahPulse.body.reports.some((r: { person: { id: string } }) => r.person.id === M().maya)).toBe(true);
  });

  it("detects concurrent edits with optimistic concurrency", async () => {
    const p = await c.priya!.get(`/api/projects/${P().CHK}`).expect(200);
    const [a, b] = await Promise.all([
      c.priya!.patch(`/api/projects/${P().CHK}`, { summary: "Edit A", version: p.body.version }),
      c.priya!.patch(`/api/projects/${P().CHK}`, { summary: "Edit B", version: p.body.version }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it("rejects invalid project transitions and incomplete completion", async () => {
    const p = await c.priya!.get(`/api/projects/${P().CHK}`).expect(200);
    expect((await c.priya!.post(`/api/projects/${P().CHK}/status`, { status: "PROPOSED", version: p.body.version })).body.code).toBe("INVALID_TRANSITION");
    expect((await c.priya!.post(`/api/projects/${P().CHK}/status`, { status: "COMPLETED", version: p.body.version })).body.code).toBe("CRITICAL_MILESTONES_OPEN");
  });

  it("password reset works through the local mailbox and revokes existing sessions", async () => {
    const anon = request(app.getHttpServer());
    await anon.post("/api/auth/password/forgot").send({ email: EMAIL.zoe }).expect(200);
    await anon.post("/api/auth/password/forgot").send({ email: "nobody@northstar.example" }).expect(200);
    const mail = await prisma.mailMessage.findFirst({ where: { to: EMAIL.zoe }, orderBy: { createdAt: "desc" } });
    const token = mail!.link!.split("/").pop()!;
    await anon.post("/api/auth/password/reset").send({ token, password: "zoe-new-password-1" }).expect(200);
    expect((await anon.post("/api/auth/password/reset").send({ token, password: "zoe-new-password-2" })).status).toBe(422);
    expect((await c.zoe!.get("/api/auth/me")).status).toBe(401);
    await anon.post("/api/auth/login").send({ email: EMAIL.zoe, password: "zoe-new-password-1" }).expect(200);
  });

  it("neutralizes spreadsheet formula injection in CSV exports", async () => {
    await c.priya!.post("/api/projects", { name: "=HYPERLINK(\"http://evil.example\")", visibility: "ORG", owningTeamId: seed.northstar.teams.pm }).expect(201);
    const csv = await c.priya!.get("/api/projects/export.csv").expect(200);
    expect(csv.text).toContain(`"'=HYPERLINK(""http://evil.example"")"`);
    expect(csv.text).not.toMatch(/(^|,)"=HYPERLINK/m);
  });

  it("health checks verify real dependencies and metrics require a token", async () => {
    const h = await request(app.getHttpServer()).get("/api/health").expect(200);
    expect(h.body.checks.rls.enforced).toBe(true);
    expect((await request(app.getHttpServer()).get("/api/metrics")).status).toBe(401);
    await request(app.getHttpServer()).get("/api/metrics").set("Authorization", "Bearer test-metrics-token").expect(200);
  });
});
