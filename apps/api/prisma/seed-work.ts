/** SYNTHETIC DEMO DATA — goals, projects, work, updates, blockers, dependencies, meetings. */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { OrgIds } from "./seed";

const DAY = 86_400_000;
const NOW = Date.now();
const d = (days: number, hour = 15) => {
  const x = new Date(NOW + days * DAY);
  x.setUTCHours(hour, 0, 0, 0);
  return x;
};

type MS = [title: string, dueDays: number, status: "PLANNED" | "IN_PROGRESS" | "DONE", critical?: boolean, owner?: string];
type WI = [title: string, assignee: string, status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE", milestone: number, doneDaysAgo?: number];

interface ProjectDef {
  key: string;
  name: string;
  summary: string;
  team: string;
  lead: string;
  members: string[];
  initiative: string | null;
  status: "PROPOSED" | "PLANNED" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  visibility: "ORG" | "TEAM" | "PROJECT_MEMBERS" | "RESTRICTED";
  discoverable: boolean;
  start: number;
  target: number;
  reported?: number;
  milestones: MS[];
  items: WI[];
}

const PROJECTS: ProjectDef[] = [
  {
    key: "CHK", name: "Checkout Launch", summary: "Self-serve checkout so customers can buy and upgrade without talking to sales.", team: "pm", lead: "priya",
    members: ["maya", "leo", "owen", "rachel", "sofia"], initiative: "selfserve", status: "IN_PROGRESS", priority: "URGENT", visibility: "ORG", discoverable: true, start: -40, target: 34, reported: 45,
    milestones: [["Pricing page and plan selection", -10, "DONE", false, "owen"], ["Cart and order API", 6, "IN_PROGRESS", false, "leo"], ["End-to-end payment flow", 20, "PLANNED", true, "priya"], ["Public launch", 34, "PLANNED", true, "priya"]],
    items: [["Design plan selection screens", "owen", "DONE", 0, 12], ["Build pricing page", "sofia", "DONE", 0, 9], ["Cart API endpoints", "leo", "IN_PROGRESS", 1], ["Order confirmation emails", "sofia", "TODO", 1], ["Payment step UI", "maya", "TODO", 2], ["Launch checklist", "priya", "TODO", 3], ["Sales enablement for self-serve", "rachel", "TODO", 3], ["Accessibility review of checkout", "owen", "IN_REVIEW", 1]],
  },
  {
    key: "PGW", name: "Payment Gateway Integration", summary: "Integrate the new payment processor with retries, webhooks and reconciliation.", team: "payments", lead: "daniel",
    members: ["maya", "leo", "sofia", "arjun"], initiative: "paymod", status: "IN_PROGRESS", priority: "HIGH", visibility: "ORG", discoverable: true, start: -55, target: 18,
    milestones: [["Processor contract & API keys", -30, "DONE", false, "daniel"], ["Webhook handling and testing", 3, "IN_PROGRESS", true, "maya"], ["Reconciliation job", 14, "PLANNED", false, "arjun"]],
    items: [["Processor client library", "leo", "DONE", 0, 25], ["Idempotent charge requests", "leo", "DONE", 1, 4], ["Webhook signature verification", "maya", "DONE", 1, 3], ["Webhook sandbox test suite", "maya", "BLOCKED", 1], ["Retry with exponential backoff", "arjun", "IN_PROGRESS", 1], ["Nightly reconciliation job", "arjun", "TODO", 2], ["Refund flow on new gateway", "sofia", "IN_PROGRESS", 2], ["Runbook for payment incidents", "leo", "TODO", 2], ["Load test charge endpoint", "arjun", "TODO", 2]],
  },
  {
    key: "SBX", name: "Sandbox Credentials & Vault", summary: "Provision sandbox credentials for third-party integrations through the secrets vault.", team: "platform", lead: "hannah",
    members: ["ethan", "tariq", "daniel"], initiative: "paymod", status: "BLOCKED", priority: "HIGH", visibility: "TEAM", discoverable: true, start: -25, target: 5,
    milestones: [["Vault namespace per environment", -12, "DONE", false, "ethan"], ["Processor sandbox credentials issued", 2, "IN_PROGRESS", true, "hannah"]],
    items: [["Vault namespaces for sandbox", "ethan", "DONE", 0, 13], ["Rotation policy for sandbox secrets", "tariq", "DONE", 0, 10], ["Request sandbox account from processor", "hannah", "BLOCKED", 1], ["Credential injection into CI", "ethan", "IN_PROGRESS", 1], ["Access review for sandbox secrets", "tariq", "TODO", 1]],
  },
  {
    key: "OBS", name: "Observability Overhaul", summary: "Unified tracing, dashboards and alerting for every production service.", team: "platform", lead: "kenji",
    members: ["olivia", "tariq", "ethan"], initiative: "reliability", status: "IN_PROGRESS", priority: "MEDIUM", visibility: "ORG", discoverable: true, start: -60, target: 40, reported: 60,
    milestones: [["Tracing in all services", -15, "DONE", true, "kenji"], ["SLO dashboards", 10, "IN_PROGRESS", false, "olivia"], ["Alert routing cleanup", 30, "PLANNED", false, "tariq"]],
    items: [["OpenTelemetry SDK rollout", "kenji", "DONE", 0, 20], ["Trace sampling policy", "olivia", "DONE", 0, 16], ["API latency SLO dashboard", "olivia", "IN_PROGRESS", 1], ["Error budget burn alerts", "tariq", "IN_PROGRESS", 1], ["Deduplicate pager alerts", "tariq", "TODO", 2], ["On-call handbook update", "kenji", "TODO", 2], ["Log retention policy", "ethan", "DONE", 1, 5]],
  },
  {
    key: "MOB", name: "Mobile App 3.0", summary: "Redesigned mobile app with offline mode and faster startup.", team: "mobile", lead: "carlos",
    members: ["zoe", "ravi", "mia", "elif", "lucy"], initiative: "mobilex", status: "IN_REVIEW", priority: "HIGH", visibility: "ORG", discoverable: true, start: -90, target: 12, reported: 85,
    milestones: [["New navigation shell", -45, "DONE", false, "zoe"], ["Offline mode", -8, "DONE", true, "ravi"], ["App store review & release", 12, "IN_PROGRESS", true, "carlos"]],
    items: [["iOS navigation shell", "zoe", "DONE", 0, 50], ["Android navigation shell", "ravi", "DONE", 0, 47], ["Offline sync engine", "ravi", "DONE", 1, 9], ["Startup time under 1.5s", "mia", "DONE", 1, 6], ["Regression test pass", "elif", "IN_REVIEW", 2], ["Release notes and screenshots", "lucy", "IN_PROGRESS", 2], ["Crash-free sessions > 99.5%", "mia", "IN_PROGRESS", 2], ["App store submission", "zoe", "TODO", 2]],
  },
  {
    key: "CHS", name: "Customer Health Score", summary: "A health score that predicts churn risk from product usage and support signals.", team: "data", lead: "fatima",
    members: ["ben", "chloe", "lars", "hugo"], initiative: "health", status: "IN_PROGRESS", priority: "MEDIUM", visibility: "PROJECT_MEMBERS", discoverable: true, start: -35, target: 45,
    milestones: [["Usage events in warehouse", -5, "DONE", false, "ben"], ["Score model v1", 15, "IN_PROGRESS", true, "chloe"], ["CS dashboard", 40, "PLANNED", false, "lars"]],
    items: [["Ingest product usage events", "ben", "DONE", 0, 6], ["Support ticket features", "chloe", "IN_PROGRESS", 1], ["Score model backtest", "chloe", "TODO", 1], ["Define health thresholds with CS", "hugo", "IN_PROGRESS", 1], ["Health dashboard in BI tool", "lars", "TODO", 2], ["Data quality checks", "ben", "IN_PROGRESS", 1]],
  },
  {
    key: "ONB", name: "Customer Onboarding Revamp", summary: "Guided onboarding that gets new customers to first value in a week.", team: "csteam", lead: "grace",
    members: ["sara", "peter", "jordan", "hugo"], initiative: "health", status: "PLANNED", priority: "MEDIUM", visibility: "ORG", discoverable: true, start: 7, target: 75,
    milestones: [["Onboarding journey map", 14, "PLANNED", false, "jordan"], ["In-app checklist", 45, "PLANNED", false, "sara"], ["Rollout to new customers", 75, "PLANNED", true, "grace"]],
    items: [["Interview 10 recent customers", "jordan", "TODO", 0], ["Audit current onboarding emails", "sara", "TODO", 0], ["Define activation metric", "hugo", "TODO", 0], ["Support macro refresh", "peter", "TODO", 1]],
  },
  {
    key: "PLG", name: "Product-led Growth Experiments", summary: "Free-trial and in-product upgrade experiments to grow qualified pipeline.", team: "growth", lead: "lina",
    members: ["max", "emma", "nina", "diego", "hana"], initiative: "plg", status: "IN_PROGRESS", priority: "HIGH", visibility: "ORG", discoverable: true, start: -50, target: 25,
    milestones: [["Free trial landing page", -20, "DONE", false, "diego"], ["Trial-to-paid email sequence", -3, "IN_PROGRESS", false, "emma"], ["In-product upgrade prompts", 20, "PLANNED", false, "nina"]],
    items: [["Trial landing page", "diego", "DONE", 0, 22], ["Trial signup analytics", "max", "DONE", 0, 18], ["Nurture email copy", "hana", "IN_REVIEW", 1], ["Email sequence automation", "emma", "IN_PROGRESS", 1], ["Upgrade prompt designs", "nina", "TODO", 2], ["A/B test framework", "max", "IN_PROGRESS", 2], ["Case study series", "hana", "TODO", 2]],
  },
  {
    key: "ENT", name: "Enterprise Pricing Revamp", summary: "New enterprise packaging and discount guidelines.", team: "salesteam", lead: "tom",
    members: ["rachel", "victor", "mark", "nora"], initiative: "selfserve", status: "IN_PROGRESS", priority: "MEDIUM", visibility: "TEAM", discoverable: false, start: -20, target: 30,
    milestones: [["Competitive pricing analysis", -2, "DONE", false, "victor"], ["Discount approval policy", 21, "PLANNED", false, "mark"]],
    items: [["Win/loss analysis", "victor", "DONE", 0, 4], ["Packaging proposal", "rachel", "IN_PROGRESS", 1], ["Discount matrix", "mark", "TODO", 1], ["Security questionnaire library", "nora", "IN_PROGRESS", 1]],
  },
  {
    key: "HIR", name: "Hiring Plan 2027", summary: "Headcount plan and hiring process improvements for next year.", team: "peopleops", lead: "julia",
    members: ["sam", "elena", "mark"], initiative: "hiring", status: "IN_PROGRESS", priority: "MEDIUM", visibility: "PROJECT_MEMBERS", discoverable: false, start: -15, target: 40,
    milestones: [["Headcount requests collected", 5, "IN_PROGRESS", false, "julia"], ["Budget approval", 30, "PLANNED", true, "mark"]],
    items: [["Collect department headcount requests", "julia", "IN_PROGRESS", 0], ["Interview training refresh", "julia", "TODO", 0], ["Compensation bands review", "mark", "TODO", 1], ["Board-ready hiring plan", "sam", "TODO", 1]],
  },
  {
    key: "ATL", name: "Project Atlas", summary: "Confidential evaluation of a strategic acquisition.", team: "executive", lead: "elena",
    members: ["yuki", "mark"], initiative: "atlas", status: "IN_PROGRESS", priority: "URGENT", visibility: "RESTRICTED", discoverable: false, start: -30, target: 60,
    milestones: [["Initial diligence", -5, "DONE", false, "yuki"], ["Term sheet", 25, "PLANNED", true, "elena"]],
    items: [["Financial diligence", "mark", "IN_PROGRESS", 1], ["Legal diligence", "yuki", "DONE", 0, 7], ["Integration hypothesis", "elena", "TODO", 1]],
  },
  {
    key: "DSN", name: "Design System v2", summary: "Accessible component library shared by web and mobile.", team: "designteam", lead: "isabel",
    members: ["owen", "lucy", "zoe"], initiative: "mobilex", status: "COMPLETED", priority: "MEDIUM", visibility: "ORG", discoverable: true, start: -120, target: -10,
    milestones: [["Tokens and typography", -80, "DONE", false, "isabel"], ["Core components", -30, "DONE", true, "owen"], ["Documentation site", -12, "DONE", false, "lucy"]],
    items: [["Color and spacing tokens", "isabel", "DONE", 0, 85], ["Button, input, select", "owen", "DONE", 1, 40], ["Dialogs and drawers", "owen", "DONE", 1, 33], ["Docs site", "lucy", "DONE", 2, 13], ["Mobile token parity", "zoe", "DONE", 2, 15]],
  },
];


/** Additional backlog so the demo resembles a real team's queue. */
const BACKLOG: Record<string, WI[]> = {
  CHK: [["Coupon and promo code support", "sofia", "TODO", 2], ["Checkout analytics events", "maya", "TODO", 2], ["Fraud screening rules", "leo", "TODO", 2], ["Plan upgrade from billing settings", "sofia", "TODO", 3]],
  PGW: [["Payment method vaulting", "leo", "TODO", 2], ["Dispute webhook handling", "maya", "TODO", 2], ["Currency rounding tests", "sofia", "DONE", 1, 7]],
  SBX: [["Mock processor server (fallback)", "ethan", "TODO", 1], ["Sandbox secret expiry alerts", "tariq", "TODO", 1]],
  OBS: [["Trace-to-log correlation", "kenji", "IN_PROGRESS", 1], ["Synthetic uptime checks", "olivia", "TODO", 2], ["Service ownership catalog", "ethan", "TODO", 2]],
  MOB: [["Push notification opt-in flow", "mia", "IN_PROGRESS", 2], ["Accessibility audit fixes", "lucy", "TODO", 2], ["Beta feedback triage", "elif", "IN_PROGRESS", 2]],
  CHS: [["Health score API for CS tools", "ben", "TODO", 2], ["Model monitoring", "chloe", "TODO", 2], ["Account segmentation", "lars", "IN_PROGRESS", 1]],
  ONB: [["Welcome call script", "sara", "TODO", 1], ["Self-serve setup guide", "peter", "TODO", 1], ["Onboarding NPS survey", "hugo", "TODO", 2]],
  PLG: [["Pricing page experiment", "diego", "TODO", 2], ["Trial expiry reminders", "emma", "TODO", 1], ["Webinar series", "hana", "IN_PROGRESS", 2]],
  ENT: [["Procurement FAQ", "nora", "TODO", 1], ["Enterprise SLA terms", "victor", "TODO", 1]],
  HIR: [["Recruiting agency review", "julia", "TODO", 0], ["Offer letter templates", "julia", "DONE", 0, 6]],
};

export async function seedWork(prisma: PrismaClient, ns: OrgIds, md: OrgIds) {
  const org = ns.orgId;
  const P = ns.people;
  const goal = async (title: string, description: string, owner: string, period: string, visibility: "ORG" | "RESTRICTED" = "ORG", priority: "HIGH" | "MEDIUM" | "URGENT" = "HIGH") =>
    (await prisma.companyGoal.create({ data: { organizationId: org, title, description, ownerId: P[owner], period, priority, visibility, status: "ACTIVE", startDate: d(-90), targetDate: d(90) } })).id;
  const G = {
    revenue: await goal("Launch self-serve and grow new revenue 40%", "Customers can discover, buy and upgrade Northstar without a sales call.", "elena", "H2 2026", "ORG", "URGENT"),
    reliability: await goal("Reach 99.95% platform availability", "Fewer incidents, faster detection, clearer ownership of production.", "marcus", "H2 2026"),
    retention: await goal("Raise gross retention to 95%", "Customers reach value quickly and stay healthy.", "grace", "H2 2026"),
    pipeline: await goal("Double qualified pipeline with product-led growth", "Let the product generate and qualify demand.", "lina", "H2 2026", "ORG", "MEDIUM"),
    team: await goal("Scale the team thoughtfully", "Hire well and keep onboarding fast as we grow.", "sam", "2027", "ORG", "MEDIUM"),
    strategic: await goal("Strategic expansion options", "Board-level strategic options. Restricted.", "elena", "2026", "RESTRICTED"),
  };
  const init = async (key: string, title: string, goalId: string, owner: string, visibility: "ORG" | "RESTRICTED" = "ORG") =>
    [key, (await prisma.initiative.create({ data: { organizationId: org, goalId, title, ownerId: P[owner], visibility, status: "ACTIVE", startDate: d(-60), targetDate: d(60), description: `${title} (synthetic demo initiative).` } })).id] as const;
  const I = Object.fromEntries(
    await Promise.all([
      init("selfserve", "Self-serve purchasing", G.revenue, "aisha"),
      init("paymod", "Payments platform modernization", G.revenue, "marcus"),
      init("reliability", "Reliability program", G.reliability, "marcus"),
      init("mobilex", "Mobile and design experience", G.retention, "aisha"),
      init("health", "Customer health", G.retention, "grace"),
      init("plg", "Product-led growth", G.pipeline, "lina"),
      init("hiring", "Hiring & onboarding", G.team, "sam"),
      init("atlas", "Atlas evaluation", G.strategic, "elena", "RESTRICTED"),
    ]),
  ) as Record<string, string>;

  const projects: Record<string, string> = {};
  const milestones: Record<string, string[]> = {};
  const items: Record<string, string[]> = {};
  const changes: Prisma.ChangeEventCreateManyInput[] = [];
  for (const def of PROJECTS) {
    const p = await prisma.project.create({
      data: {
        organizationId: org, key: def.key, name: def.name, summary: def.summary, description: `${def.summary}\n\nSynthetic demo project for Northstar Labs.`,
        owningTeamId: ns.teams[def.team], leadId: P[def.lead], initiativeId: def.initiative ? I[def.initiative] : null, status: def.status, priority: def.priority,
        visibility: def.visibility, discoverable: def.discoverable, startDate: d(def.start), targetDate: d(def.target),
        reportedProgress: def.reported ?? null, reportedAt: def.reported ? d(-3) : null, reportedById: def.reported ? P[def.lead] : null,
      },
    });
    projects[def.key] = p.id;
    await prisma.projectMember.createMany({
      data: [{ organizationId: org, projectId: p.id, membershipId: P[def.lead]!, role: "LEAD" as const }, ...def.members.map((m) => ({ organizationId: org, projectId: p.id, membershipId: P[m]!, role: "CONTRIBUTOR" as const }))],
    });
    milestones[def.key] = [];
    for (const [i, [title, due, status, critical, owner]] of def.milestones.entries()) {
      const m = await prisma.milestone.create({
        data: { organizationId: org, projectId: p.id, title, status, isCritical: !!critical, dueDate: d(due), ownerId: owner ? P[owner] : null, sortOrder: i, completedAt: status === "DONE" ? d(Math.min(due, -1)) : null },
      });
      milestones[def.key]!.push(m.id);
      if (status === "DONE" && due >= -8) changes.push({ organizationId: org, entityType: "MILESTONE", entityId: m.id, projectId: p.id, field: "status", fromValue: "IN_PROGRESS", toValue: "DONE", actorId: owner ? P[owner] : null, createdAt: d(Math.min(due, -1)) });
    }
    items[def.key] = [];
    for (const [i, [title, assignee, status, ms, doneAgo]] of [...def.items, ...(BACKLOG[def.key] ?? [])].entries()) {
      const w = await prisma.workItem.create({
        data: {
          organizationId: org, projectId: p.id, milestoneId: milestones[def.key]![ms] ?? null, title, status, assigneeId: P[assignee], sortOrder: i,
          priority: i % 3 === 0 ? "HIGH" : "MEDIUM", completedAt: status === "DONE" ? d(-(doneAgo ?? 10)) : null, dueDate: status === "DONE" ? null : d(def.milestones[ms]?.[1] ?? 14),
        },
      });
      items[def.key]!.push(w.id);
      if (status === "DONE" && (doneAgo ?? 99) <= 8) changes.push({ organizationId: org, entityType: "WORK_ITEM", entityId: w.id, projectId: p.id, field: "status", fromValue: "IN_REVIEW", toValue: "DONE", actorId: P[assignee], createdAt: d(-(doneAgo ?? 1)) });
    }
  }
  changes.push(
    { organizationId: org, entityType: "PROJECT", entityId: projects.SBX!, projectId: projects.SBX!, field: "status", fromValue: "IN_PROGRESS", toValue: "BLOCKED", actorId: P.hannah, createdAt: d(-4) },
    { organizationId: org, entityType: "PROJECT", entityId: projects.MOB!, projectId: projects.MOB!, field: "status", fromValue: "IN_PROGRESS", toValue: "IN_REVIEW", actorId: P.carlos, createdAt: d(-2) },
    { organizationId: org, entityType: "PROJECT", entityId: projects.CHK!, projectId: projects.CHK!, field: "status", fromValue: "PLANNED", toValue: "IN_PROGRESS", actorId: P.priya, createdAt: d(-38) },
  );
  await prisma.changeEvent.createMany({ data: changes });

  // Explicit grants and delegation
  await prisma.accessGrant.create({ data: { organizationId: org, resourceType: "PROJECT", resourceId: projects.ATL!, granteeId: P.aisha!, level: "DETAILS", reason: "Product integration assessment", grantedById: P.elena! } });
  await prisma.delegation.create({ data: { organizationId: org, delegatorId: P.carlos!, delegateId: P.fatima!, reason: "Carlos on parental leave", startsAt: d(-2), expiresAt: d(12), createdById: P.marcus! } });
  await prisma.delegation.create({ data: { organizationId: org, delegatorId: P.daniel!, delegateId: P.hannah!, reason: "Conference week (expired)", startsAt: d(-40), expiresAt: d(-33), createdById: P.marcus! } });

  // Dependencies: Checkout → Gateway → Sandbox credentials; Onboarding → Health score; PLG → Checkout
  const dep = (up: string, down: string, description: string, state: "OPEN" | "AT_RISK" | "BLOCKED" | "RESOLVED", isCritical: boolean, needBy: number, owner: string) =>
    prisma.dependency.create({ data: { organizationId: org, upstreamProjectId: projects[up]!, downstreamProjectId: projects[down]!, description, state, isCritical, needBy: d(needBy), ownerId: P[owner], createdById: P[owner]!, resolvedAt: state === "RESOLVED" ? d(-3) : null } });
  await dep("PGW", "CHK", "Checkout needs live payment processing before the end-to-end flow milestone.", "AT_RISK", true, 18, "daniel");
  await dep("SBX", "PGW", "Gateway webhook tests need processor sandbox credentials from Platform.", "BLOCKED", true, 1, "hannah");
  await dep("CHS", "ONB", "Onboarding uses health score thresholds to target outreach.", "OPEN", false, 40, "fatima");
  await dep("CHK", "PLG", "Upgrade prompts send trial users into self-serve checkout.", "OPEN", false, 30, "nina");
  await dep("OBS", "MOB", "Mobile release needs crash and latency dashboards.", "RESOLVED", false, -5, "kenji");

  // Progress updates
  type U = [author: string, project: string | null, stage: "PLANNING" | "DEVELOPMENT" | "TESTING" | "REVIEW" | "BLOCKED" | "COMPLETED", daysAgo: number, focus: string, completed: string | null, next: string | null, help: string | null, visibility: "MANAGER" | "PROJECT" | "TEAM" | "ORG", confidence?: number];
  const UPDATES: U[] = [
    ["maya", "PGW", "TESTING", 1, "Webhook sandbox test suite", "Signature verification merged; retries covered by unit tests.", "Run the full sandbox suite once credentials arrive.", "Need processor sandbox credentials from Platform.", "PROJECT", 3],
    ["maya", "PGW", "DEVELOPMENT", 6, "Webhook signature verification", "Parsed event envelopes and added replay protection.", "Finish verification and open PR.", null, "PROJECT", 4],
    ["leo", "CHK", "DEVELOPMENT", 2, "Cart and order API", "Cart create/update endpoints done with idempotency keys.", "Order confirmation and tax calculation.", null, "PROJECT", 4],
    ["leo", "PGW", "COMPLETED", 4, "Idempotent charge requests", "Charges are idempotent end-to-end.", "Help Arjun with retries.", null, "TEAM", 5],
    ["sofia", "PGW", "DEVELOPMENT", 3, "Refund flow on new gateway", "Partial refunds working in staging.", "Edge cases for disputed charges.", null, "PROJECT", 4],
    ["arjun", "PGW", "DEVELOPMENT", 2, "Retry with exponential backoff", "Backoff policy implemented.", "Jitter and dead-letter queue.", null, "MANAGER", 3],
    ["hannah", "SBX", "BLOCKED", 1, "Processor sandbox account", "Escalated with processor account team.", "Follow up Thursday; fallback is a mock server.", "Need Daniel to escalate with the processor partner manager.", "TEAM", 2],
    ["ethan", "SBX", "DEVELOPMENT", 2, "Credential injection into CI", "Vault agent sidecar running in CI.", "Scope tokens per pipeline.", null, "TEAM", 4],
    ["kenji", "OBS", "DEVELOPMENT", 3, "SLO dashboards", "Tracing rollout complete in every service.", "Latency SLOs for top 5 endpoints.", null, "ORG", 4],
    ["olivia", "OBS", "DEVELOPMENT", 1, "API latency SLO dashboard", "p95/p99 panels built.", "Review thresholds with service owners.", null, "TEAM", 4],
    ["carlos", "MOB", "REVIEW", 2, "Mobile App 3.0 release", "Offline mode shipped to beta testers.", "Submit to app stores next week.", null, "ORG", 4],
    ["ravi", "MOB", "COMPLETED", 8, "Offline sync engine", "Conflict resolution done and tested on Android.", "Support release testing.", null, "TEAM", 5],
    ["elif", "MOB", "TESTING", 1, "Regression test pass", "80% of the regression suite passed.", "Finish payments and settings flows.", null, "PROJECT", 4],
    ["fatima", "CHS", "DEVELOPMENT", 4, "Score model v1", "Usage events landed in the warehouse.", "Feature engineering with support signals.", null, "PROJECT", 3],
    ["chloe", "CHS", "DEVELOPMENT", 2, "Support ticket features", "Ticket volume and sentiment features drafted.", "Backtest against last year's churn.", "Need CS to confirm what counts as churn.", "PROJECT", 3],
    ["priya", "CHK", "DEVELOPMENT", 2, "Checkout launch readiness", "Pricing page shipped; cart API in progress.", "Align launch date with Payments after the sandbox delay.", "Need a decision on launch date if credentials slip past next week.", "ORG", 3],
    ["owen", "CHK", "REVIEW", 3, "Checkout accessibility review", "Keyboard and screen reader pass done for plan selection.", "Payment step designs.", null, "PROJECT", 4],
    ["lina", "PLG", "DEVELOPMENT", 5, "Trial-to-paid sequence", "Landing page converting at 4.1%.", "Launch nurture sequence.", null, "ORG", 3],
    ["emma", "PLG", "DEVELOPMENT", 2, "Email sequence automation", "Sequence built in the marketing tool.", "QA and launch to 10% of trials.", null, "TEAM", 3],
    ["max", "PLG", "DEVELOPMENT", 1, "A/B test framework", "Feature flags wired to analytics.", "First experiment on upgrade copy.", null, "TEAM", 4],
    ["grace", "ONB", "PLANNING", 3, "Onboarding revamp kickoff", "Kickoff scheduled; interviews being booked.", "Journey map with Jordan.", null, "ORG", 4],
    ["jordan", "ONB", "PLANNING", 2, "Customer interviews", "6 of 10 interviews booked.", "Synthesize themes.", null, "PROJECT", 4],
    ["victor", "ENT", "DEVELOPMENT", 3, "Competitive pricing analysis", "Win/loss analysis finished.", "Packaging proposal review.", null, "TEAM", 4],
    ["julia", "HIR", "PLANNING", 2, "Headcount requests", "Engineering and Sales requests in.", "Collect CS and Marketing requests.", null, "PROJECT", 4],
    ["yuki", "ATL", "DEVELOPMENT", 4, "Legal diligence", "Initial legal diligence complete.", "Review IP assignments.", null, "PROJECT", 3],
    ["zoe", "MOB", "DEVELOPMENT", 2, "App store submission prep", "Screenshots generated.", "Submit build after regression pass.", null, "PROJECT", 4],
    ["hugo", "CHS", "DEVELOPMENT", 3, "Health thresholds with CS", "Drafted red/yellow/green definitions.", "Review with Grace.", null, "PROJECT", 4],
    ["ben", "CHS", "DEVELOPMENT", 9, "Usage event ingestion", "Event pipeline in production.", "Data quality checks.", null, "TEAM", 5],
    ["rachel", "ENT", "DEVELOPMENT", 2, "Packaging proposal", "Three-tier proposal drafted.", "Review with Tom.", null, "TEAM", 3],
    ["diego", "PLG", "COMPLETED", 12, "Trial landing page", "Landing page live.", "Support upgrade prompts.", null, "ORG", 5],
    ["sara", null, "PLANNING", 4, "Onboarding email audit", "Collected all current emails.", "Annotate drop-off points.", null, "MANAGER", 4],
    ["tariq", "OBS", "DEVELOPMENT", 5, "Error budget burn alerts", "Burn-rate alerts drafted.", "Tune thresholds.", null, "TEAM", 4],
  ];
  const updateIds: Record<string, string> = {};
  for (const [i, [author, project, stage, ago, focus, completed, next, help, visibility, confidence]] of UPDATES.entries()) {
    const u = await prisma.progressUpdate.create({
      data: {
        organizationId: org, authorId: P[author]!, projectId: project ? projects[project] : null, stage, currentFocus: focus, completed, nextSteps: next, helpNeeded: help,
        helpFromId: help && author === "maya" ? P.hannah : help && author === "hannah" ? P.daniel : null, confidence: confidence ?? null, visibility, status: "PUBLISHED",
        publishedAt: d(-ago, 14 + (i % 4)), createdAt: d(-ago, 13),
      },
    });
    updateIds[`${author}${i}`] = u.id;
  }
  // A private draft that nobody but Maya may see.
  await prisma.progressUpdate.create({ data: { organizationId: org, authorId: P.maya!, projectId: projects.PGW, stage: "TESTING", currentFocus: "Draft: thoughts on mocking the processor", nextSteps: "Ask Leo whether a mock server is acceptable.", visibility: "PRIVATE", status: "DRAFT" } });
  await prisma.updateAcknowledgement.create({ data: { organizationId: org, updateId: updateIds.maya0!, membershipId: P.daniel! } });
  await prisma.comment.create({ data: { organizationId: org, entityType: "UPDATE", entityId: updateIds.maya0!, authorId: P.daniel!, body: "Thanks Maya — I'm escalating the credentials with the processor today." } });

  // Blockers
  type B = [title: string, project: string | null, reporter: string, owner: string | null, severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", state: "OPEN" | "ASSIGNED" | "INVESTIGATING" | "WAITING" | "RESOLVED", daysAgo: number, item?: [string, number], resolution?: string];
  const BLOCKERS: B[] = [
    ["Processor sandbox credentials not provided", "PGW", "maya", "hannah", "HIGH", "WAITING", 5, ["PGW", 3]],
    ["Processor account team unresponsive", "SBX", "hannah", null, "CRITICAL", "OPEN", 4, ["SBX", 2]],
    ["Tax provider rate limits in staging", "CHK", "leo", "leo", "MEDIUM", "INVESTIGATING", 2],
    ["Churn definition not agreed with CS", "CHS", "chloe", "hugo", "MEDIUM", "ASSIGNED", 2],
    ["App store review needs privacy labels", "MOB", "zoe", null, "HIGH", "OPEN", 1],
    ["Email tool sending limits for trials", "PLG", "emma", "max", "LOW", "INVESTIGATING", 3],
    ["Staging database too small for load tests", "PGW", "arjun", "tariq", "MEDIUM", "RESOLVED", 12, undefined, "Platform resized staging DB; load tests running."],
    ["Missing design for refund confirmation", "PGW", "sofia", "owen", "LOW", "RESOLVED", 9, undefined, "Owen shared the refund confirmation designs."],
    ["Flaky iOS UI tests", "MOB", "elif", "zoe", "MEDIUM", "RESOLVED", 6, undefined, "Disabled animations in test runs."],
    ["Diligence data room access", "ATL", "yuki", "elena", "HIGH", "RESOLVED", 8, undefined, "Access granted by counterparty."],
  ];
  for (const [title, project, reporter, owner, severity, state, ago, item, resolution] of BLOCKERS) {
    const b = await prisma.blocker.create({
      data: {
        organizationId: org, title, description: `${title}. (Synthetic demo blocker.)`, projectId: project ? projects[project] : null, workItemId: item ? items[item[0]]![item[1]] : null,
        reporterId: P[reporter]!, ownerId: owner ? P[owner] : null, severity, state, visibility: "PROJECT", createdAt: d(-ago, 10), targetDate: state === "RESOLVED" ? null : d(4),
        resolvedAt: state === "RESOLVED" ? d(-ago + 3) : null, resolutionNotes: resolution ?? null,
      },
    });
    const events: Prisma.BlockerEventCreateManyInput[] = [{ organizationId: org, blockerId: b.id, actorId: P[reporter]!, toState: "OPEN", note: "Reported", createdAt: d(-ago, 10) }];
    if (owner) events.push({ organizationId: org, blockerId: b.id, actorId: P[reporter === "maya" ? "daniel" : reporter]!, fromState: "OPEN", toState: "ASSIGNED", toOwnerId: P[owner], createdAt: d(-ago, 12) });
    if (state !== "OPEN" && state !== "ASSIGNED") events.push({ organizationId: org, blockerId: b.id, actorId: P[owner ?? reporter]!, fromState: "ASSIGNED", toState: state, note: resolution ?? null, createdAt: d(-ago + (state === "RESOLVED" ? 3 : 1), 11) });
    await prisma.blockerEvent.createMany({ data: events });
  }

  // Meetings: weekly Payments sync (previous completed + upcoming), leadership review, launch readiness
  const meeting = async (data: { title: string; organizer: string; participants: string[]; projects: string[]; at: Date; recurrence: "NONE" | "WEEKLY" | "BIWEEKLY"; status: "SCHEDULED" | "COMPLETED"; team?: string; seriesId?: string; compareFrom?: Date; agenda: Array<[string, boolean]> }) => {
    const m = await prisma.meeting.create({
      data: {
        organizationId: org, title: data.title, organizerId: P[data.organizer]!, scheduledAt: data.at, durationMinutes: 30, recurrence: data.recurrence, status: data.status,
        visibility: "PARTICIPANTS", teamId: data.team ? ns.teams[data.team] : null, seriesId: data.seriesId ?? null, compareFrom: data.compareFrom ?? null, completedAt: data.status === "COMPLETED" ? data.at : null,
        participants: { create: [...new Set([data.organizer, ...data.participants])].map((k) => ({ organizationId: org, membershipId: P[k]! })) },
        projects: { create: data.projects.map((k) => ({ organizationId: org, projectId: projects[k]! })) },
        agenda: { create: data.agenda.map(([title, discussed], i) => ({ organizationId: org, title, discussed, sortOrder: i, createdById: P[data.organizer]! })) },
      },
    });
    return m.id;
  };
  const prevSync = await meeting({ title: "Payments weekly sync", organizer: "daniel", participants: ["maya", "leo", "sofia", "arjun", "priya", "hannah"], projects: ["PGW", "CHK"], at: d(-6, 16), recurrence: "WEEKLY", status: "COMPLETED", team: "payments", agenda: [["Gateway webhook status", true], ["Refund edge cases", true], ["Launch date risk", false]] });
  const nextSync = await meeting({ title: "Payments weekly sync", organizer: "daniel", participants: ["maya", "leo", "sofia", "arjun", "priya", "hannah"], projects: ["PGW", "CHK"], at: d(1, 16), recurrence: "WEEKLY", status: "SCHEDULED", team: "payments", seriesId: prevSync, compareFrom: d(-6, 16), agenda: [["Launch date risk", false], ["Sandbox credentials fallback plan", false]] });
  const review = await meeting({ title: "Leadership portfolio review", organizer: "elena", participants: ["marcus", "aisha", "tom", "lina", "grace", "sam"], projects: ["CHK", "PGW", "MOB", "PLG", "OBS"], at: d(3, 17), recurrence: "BIWEEKLY", status: "SCHEDULED", team: "executive", agenda: [["Self-serve launch readiness", false], ["Reliability program", false]] });
  await meeting({ title: "Checkout launch readiness", organizer: "priya", participants: ["leo", "owen", "rachel", "daniel"], projects: ["CHK"], at: d(2, 15), recurrence: "NONE", status: "SCHEDULED", agenda: [["Go/no-go criteria", false]] });

  const dec1 = await prisma.decision.create({ data: { organizationId: org, meetingId: prevSync, projectId: projects.PGW, title: "Build a processor mock server as a fallback for sandbox tests", rationale: "Unblocks webhook testing if credentials slip past next week.", status: "DECIDED", ownerId: P.leo, decidedById: P.daniel, decidedAt: d(-6, 16), createdById: P.daniel!, createdAt: d(-6, 16) } });
  await prisma.decision.create({ data: { organizationId: org, meetingId: prevSync, projectId: projects.CHK, title: "Confirm or move the checkout public launch date", rationale: "Depends on gateway readiness.", status: "PENDING", ownerId: P.priya, createdById: P.daniel!, createdAt: d(-6, 16) } });
  await prisma.decision.create({ data: { organizationId: org, meetingId: review, projectId: projects.MOB, title: "Approve Mobile 3.0 phased rollout plan", status: "PENDING", ownerId: P.carlos, createdById: P.elena!, createdAt: d(-1) } });
  await prisma.actionItem.createMany({
    data: [
      { organizationId: org, meetingId: prevSync, decisionId: dec1.id, projectId: projects.PGW, title: "Prototype processor mock server", ownerId: P.leo!, dueDate: d(2), createdById: P.daniel!, createdAt: d(-6, 16) },
      { organizationId: org, meetingId: prevSync, projectId: projects.PGW, title: "Escalate sandbox credentials with processor partner manager", ownerId: P.daniel!, dueDate: d(-1), createdById: P.daniel!, createdAt: d(-6, 16) },
      { organizationId: org, meetingId: prevSync, projectId: projects.CHK, title: "Draft launch date options for leadership", ownerId: P.priya!, dueDate: d(3), createdById: P.daniel!, createdAt: d(-6, 16) },
      { organizationId: org, meetingId: prevSync, projectId: projects.PGW, title: "Write refund edge case tests", ownerId: P.sofia!, dueDate: d(-3), status: "DONE", completedAt: d(-2), createdById: P.daniel!, createdAt: d(-6, 16) },
    ],
  });

  // A few in-app notifications so personas see a populated (synthetic) inbox.
  await prisma.notification.createMany({
    data: [
      { organizationId: org, recipientId: P.daniel!, type: "BLOCKER_CHANGED", title: "Maya Chen reported a high-severity blocker on Payment Gateway Integration", link: "/blockers", entityType: "project", entityId: projects.PGW, actorId: P.maya, dedupeKey: "seed:1", createdAt: d(-5) },
      { organizationId: org, recipientId: P.hannah!, type: "BLOCKER_ASSIGNED", title: "Daniel Okafor assigned you a blocker on Payment Gateway Integration", link: "/blockers", entityType: "project", entityId: projects.PGW, actorId: P.daniel, dedupeKey: "seed:2", createdAt: d(-5) },
      { organizationId: org, recipientId: P.maya!, type: "COMMENT_ADDED", title: "Daniel Okafor commented on Payment Gateway Integration", link: `/updates/${updateIds.maya0}`, entityType: "update", entityId: updateIds.maya0, actorId: P.daniel, dedupeKey: "seed:3", createdAt: d(-1) },
      { organizationId: org, recipientId: P.priya!, type: "DECISION_ASSIGNED", title: "Daniel Okafor recorded a decision you own", link: `/meetings/${prevSync}`, entityType: "decision", actorId: P.daniel, dedupeKey: "seed:4", createdAt: d(-6) },
    ],
  });
  await prisma.auditEvent.create({ data: { organizationId: org, actorId: P.sam, action: "organization.seeded", resourceType: "organization", resourceId: org, metadata: { note: "Synthetic demo data loaded" } } });

  // ── Meridian Systems (isolation tenant) ──
  const M = md.people;
  const mg = await prisma.companyGoal.create({ data: { organizationId: md.orgId, title: "Meridian confidential growth plan", ownerId: M.noah, visibility: "ORG", status: "ACTIVE" } });
  const mi = await prisma.initiative.create({ data: { organizationId: md.orgId, goalId: mg.id, title: "Meridian platform v2", ownerId: M.noah } });
  const mp = await prisma.project.create({ data: { organizationId: md.orgId, key: "MRD", name: "Meridian Payment Gateway Secret", summary: "Meridian-only project", initiativeId: mi.id, owningTeamId: md.teams.core, leadId: M.noah, status: "IN_PROGRESS", visibility: "ORG" } });
  await prisma.projectMember.create({ data: { organizationId: md.orgId, projectId: mp.id, membershipId: M.ivy!, role: "CONTRIBUTOR" } });
  await prisma.milestone.create({ data: { organizationId: md.orgId, projectId: mp.id, title: "Meridian beta", dueDate: d(10), isCritical: true } });
  await prisma.workItem.create({ data: { organizationId: md.orgId, projectId: mp.id, title: "Meridian gateway work", assigneeId: M.ivy } });
  const mu = await prisma.progressUpdate.create({ data: { organizationId: md.orgId, authorId: M.ivy!, projectId: mp.id, currentFocus: "Meridian payment gateway confidential work", visibility: "ORG", status: "PUBLISHED", publishedAt: d(-1) } });
  const mb = await prisma.blocker.create({ data: { organizationId: md.orgId, projectId: mp.id, title: "Meridian gateway blocker", reporterId: M.ivy!, severity: "HIGH", visibility: "ORG" } });
  const mm = await prisma.meeting.create({ data: { organizationId: md.orgId, title: "Meridian standup", organizerId: M.noah!, scheduledAt: d(1), visibility: "ORG", participants: { create: [{ organizationId: md.orgId, membershipId: M.noah! }] } } });

  return { projects, milestones, items, goals: G, initiatives: I, meetings: { prevSync, nextSync, review }, meridian: { goalId: mg.id, projectId: mp.id, updateId: mu.id, blockerId: mb.id, meetingId: mm.id } };
}
