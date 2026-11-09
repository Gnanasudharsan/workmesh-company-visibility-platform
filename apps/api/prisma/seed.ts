/**
 * Seeds the SYNTHETIC demo companies (Northstar Labs ~51 people, Meridian Systems 6 people).
 *
 *  - Only demo organizations (isDemo = true) and *.example users are deleted and recreated.
 *  - Demo passwords are random per run (or DEMO_PASSWORD for automated tests) and written to
 *    the git-ignored .demo-credentials.json. Refuses to run in production.
 */
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MERIDIAN, NORTHSTAR, type PersonDef } from "./seed-data";
import { seedWork } from "./seed-work";

const TENANT_TABLES = [
  "audit_events", "outbox_events", "notification_preferences", "notifications", "action_items", "decisions", "agenda_items",
  "meeting_projects", "meeting_participants", "meetings", "dependencies", "blocker_events", "blockers", "comments",
  "update_acknowledgements", "update_revisions", "progress_updates", "change_events", "work_items", "milestones",
  "access_grants", "project_members", "projects", "initiatives", "company_goals", "delegations", "reporting_lines",
  "team_memberships", "teams", "departments", "invitations", "employee_profiles", "positions", "memberships",
];

export const emailFor = (name: string, domain: string) =>
  `${name.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".")}@${domain}`;

export function hue(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export interface OrgIds {
  orgId: string;
  people: Record<string, string>; // key → membershipId
  teams: Record<string, string>;
  departments: Record<string, string>;
}

export async function resetDemo(prisma: PrismaClient) {
  const demo = await prisma.organization.findMany({ where: { isDemo: true }, select: { id: true } });
  const ids = demo.map((o) => o.id);
  if (ids.length) {
    for (const t of TENANT_TABLES) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "organizationId" = ANY($1::uuid[])`, ids);
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { OR: [{ email: { endsWith: "@northstar.example" } }, { email: { endsWith: "@meridian.example" } }] } });
}

async function seedOrg(
  prisma: PrismaClient,
  def: { name: string; slug: string; departments?: typeof NORTHSTAR.departments; teams?: typeof NORTHSTAR.teams; people: PersonDef[]; extraTeams?: typeof NORTHSTAR.extraTeams; dottedLines?: typeof NORTHSTAR.dottedLines },
  domain: string,
  passwordHash: string,
): Promise<OrgIds> {
  const now = new Date();
  const org = await prisma.organization.create({ data: { name: def.name, slug: def.slug, isDemo: true, escalateBlockersAfterHours: 48 } });
  const orgId = org.id;
  const ids: OrgIds = { orgId, people: {}, teams: {}, departments: {} };

  const departments = def.departments ?? [
    { key: "core", name: "Product & Engineering", color: "#2563EB", head: "noah", description: "Builds the Meridian product." },
    { key: "gtm", name: "Go-to-market", color: "#16A34A", head: "ana", description: "Sales and operations." },
  ];
  const teams = def.teams ?? [
    { key: "core", dept: "core", name: "Core Product", mission: "Ship the Meridian platform.", responsibilities: ["Platform"], contact: "#core" },
    { key: "gtm", dept: "gtm", name: "Revenue", mission: "Win and keep customers.", responsibilities: ["Sales"], contact: "#revenue" },
  ];
  for (const d of departments) {
    const row = await prisma.department.create({ data: { organizationId: orgId, name: d.name, slug: d.key, color: d.color, description: d.description } });
    ids.departments[d.key] = row.id;
  }
  for (const t of teams) {
    const row = await prisma.team.create({
      data: { organizationId: orgId, departmentId: ids.departments[t.dept], name: t.name, slug: t.key, mission: t.mission, responsibilities: t.responsibilities, contact: t.contact, docsUrl: (t as { docsUrl?: string }).docsUrl ?? null },
    });
    ids.teams[t.key] = row.id;
  }

  for (const [i, p] of def.people.entries()) {
    const email = emailFor(p.name, domain);
    const user = await prisma.user.create({ data: { email, name: p.name, passwordHash } });
    const membership = await prisma.membership.create({
      data: { organizationId: orgId, userId: user.id, role: p.role ?? "MEMBER", joinedAt: new Date(now.getTime() - (400 - i * 6) * 86_400_000), onboardedAt: p.key === "maya" ? null : now },
    });
    ids.people[p.key] = membership.id;
    await prisma.employeeProfile.create({
      data: {
        organizationId: orgId,
        membershipId: membership.id,
        displayName: p.name,
        workEmail: email,
        title: p.title,
        location: p.location ?? null,
        timezone: null,
        responsibilities: p.responsibilities ?? [],
        contact: `@${p.name.split(" ")[0]!.toLowerCase()}`,
        bio: `${p.title} at ${def.name}. (Synthetic demo profile.)`,
        avatarHue: hue(email),
      },
    });
    await prisma.teamMembership.create({ data: { organizationId: orgId, teamId: ids.teams[p.team]!, membershipId: membership.id, role: p.lead ? "LEAD" : "MEMBER", isPrimary: true } });
  }
  for (const x of def.extraTeams ?? []) {
    await prisma.teamMembership.create({ data: { organizationId: orgId, teamId: ids.teams[x.team]!, membershipId: ids.people[x.person]!, isPrimary: false } });
  }
  for (const d of departments) {
    await prisma.department.update({ where: { id: ids.departments[d.key] }, data: { headId: ids.people[d.head] ?? null } });
  }
  const year = 365 * 86_400_000;
  for (const p of def.people) {
    if (!p.manager) continue;
    await prisma.reportingLine.create({
      data: { organizationId: orgId, reportId: ids.people[p.key]!, managerId: ids.people[p.manager]!, type: "PRIMARY", startedAt: new Date(now.getTime() - year), reason: "Initial structure" },
    });
  }
  for (const d of def.dottedLines ?? []) {
    await prisma.reportingLine.create({ data: { organizationId: orgId, reportId: ids.people[d.report]!, managerId: ids.people[d.manager]!, type: "DOTTED", reason: "Growth programme" } });
  }
  return ids;
}

export async function seedAll(prisma: PrismaClient, password: string) {
  await resetDemo(prisma);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const northstar = await seedOrg(prisma, NORTHSTAR, "northstar.example", passwordHash);
  const meridian = await seedOrg(prisma, MERIDIAN, "meridian.example", passwordHash);
  const work = await seedWork(prisma, northstar, meridian);
  return { northstar, meridian, work };
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to seed synthetic demo data in production.");
  }
  for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      break;
    }
  }
  const password = process.env.DEMO_PASSWORD || `demo-${randomBytes(9).toString("base64url")}`;
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  try {
    const started = Date.now();
    const result = await seedAll(prisma, password);
    const counts = await Promise.all([
      prisma.membership.count({ where: { organizationId: result.northstar.orgId } }),
      prisma.project.count({ where: { organizationId: result.northstar.orgId } }),
      prisma.workItem.count({ where: { organizationId: result.northstar.orgId } }),
      prisma.progressUpdate.count({ where: { organizationId: result.northstar.orgId } }),
    ]);
    const file = resolve(__dirname, "../../../.demo-credentials.json");
    writeFileSync(
      file,
      JSON.stringify(
        {
          note: "Local synthetic demo credentials. Git-ignored. Regenerated on every `make seed`.",
          password,
          personas: (await import("../src/modules/dev/personas")).DEMO_PERSONAS.map((p) => ({ role: p.label, email: p.email })),
          isolationTenant: { org: "Meridian Systems", email: "noah.berg@meridian.example" },
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.warn(`Seeded Northstar Labs: ${counts[0]} people, ${counts[1]} projects, ${counts[2]} work items, ${counts[3]} updates (+ Meridian Systems) in ${Date.now() - started} ms.`);
    console.warn(`Demo credentials written to ${file}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
