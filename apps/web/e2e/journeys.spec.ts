import { expect, test } from "@playwright/test";
import { io } from "socket.io-client";
import { API, apiGet, expectNotAvailable, login, USERS } from "./helpers";

test.describe.configure({ mode: "serial" });

type Project = { id: string; name: string; key: string };

test("Journey A — employee onboarding through an invitation", async ({ page }) => {
  await login(page, USERS.sam);
  await page.goto("/admin/invitations");
  await page.getByLabel("Email").fill("jordan.newhire@northstar.example");
  await page.getByLabel("Title").fill("Software Engineer");
  await page.getByLabel("Team").selectOption({ label: "Payments · Engineering" });
  await page.getByLabel("Manager").selectOption({ label: "Daniel Okafor — Engineering Manager" });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("jordan.newhire@northstar.example").first()).toBeVisible();

  // The invite email lands in the local developer mailbox.
  await page.context().clearCookies();
  await page.goto("/dev/mailbox");
  const message = page.locator("article", { hasText: "jordan.newhire@northstar.example" }).first();
  await message.getByRole("link", { name: "Open link →" }).click();
  await expect(page.getByRole("heading", { name: "Join Northstar Labs" })).toBeVisible();
  await page.getByLabel("Your full name").fill("Jordan Newhire");
  await page.getByLabel("Choose a password").fill("a-strong-password-1");
  await page.getByRole("button", { name: "Accept invitation" }).click();

  await page.waitForURL(/\/onboarding/);
  await expect(page.getByText("Hi Jordan")).toBeVisible();
  await expect(page.getByText("Daniel Okafor").first()).toBeVisible(); // manager
  await expect(page.getByText("Your team: Payments")).toBeVisible();
  await expect(page.getByText("What the company is working toward")).toBeVisible();

  await page.goto("/map?mode=work");
  await expect(page.getByText("Launch self-serve and grow new revenue 40%").first()).toBeVisible();
  await expect(page.getByText("Project Atlas")).toHaveCount(0); // restricted stays hidden
  const graph = await apiGet<{ nodes: Array<{ label: string }> }>(page, "/graph/work");
  expect(graph.body.nodes.map((n) => n.label)).not.toContain("Project Atlas");
});

test("Journey B — progress update with a blocker reaches the right people only", async ({ page }) => {
  await login(page, USERS.maya);
  await page.getByRole("button", { name: "Share an update" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project").selectOption({ label: "Payment Gateway Integration (PGW)" });
  await dialog.getByLabel(/What are you working on/).fill("E2E: webhook retries under load");
  await dialog.getByLabel("Next step").fill("Rerun the sandbox suite");
  await dialog.getByRole("button", { name: /I'm blocked on something/ }).click();
  await dialog.getByLabel("What's blocking you?").fill("E2E: staging webhook endpoint rejects signatures");
  await dialog.getByLabel("Severity").selectOption("HIGH");
  await dialog.getByLabel("Who can see this").selectOption("MANAGER");
  await dialog.getByRole("button", { name: "Publish update" }).click();
  await expect(dialog).toBeHidden();

  const mine = await apiGet<Array<{ id: string; currentFocus: string; stage: string }>>(page, "/updates?authorId=me");
  const update = mine.body.find((u) => u.currentFocus.startsWith("E2E: webhook retries"))!;
  expect(update.stage).toBe("BLOCKED");

  // Manager sees it in Team Pulse.
  await login(page, USERS.daniel);
  await page.goto("/team-pulse");
  const row = page.getByRole("article", { name: "Maya Chen" });
  await expect(row.getByText("E2E: webhook retries under load")).toBeVisible();
  await expect(row.getByText("E2E: staging webhook endpoint rejects signatures")).toBeVisible();

  // The project lead (Daniel leads PGW) sees the blocker in the queue.
  await page.goto("/blockers?scope=queue");
  await expect(page.getByText("E2E: staging webhook endpoint rejects signatures")).toBeVisible();

  // An unrelated employee cannot open the manager-only update.
  await login(page, USERS.rachel);
  await page.goto(`/updates/${update.id}`);
  await expectNotAvailable(page);
});

test("Journey C — manager assigns an owner and a follow-up the employee can see", async ({ page }) => {
  await login(page, USERS.daniel);
  await page.goto("/blockers?scope=queue");
  await page.getByText("E2E: staging webhook endpoint rejects signatures").click();
  await page.getByLabel("New owner").selectOption({ label: "Hannah Lee — Staff Engineer, Platform Lead" });
  await page.getByRole("button", { name: "Assign owner" }).click();
  await expect(page.getByText("Owner assigned")).toBeVisible();
  await expect(page.getByText("assigned Hannah Lee")).toBeVisible();

  await page.goto("/team-pulse");
  await page.getByRole("article", { name: "Maya Chen" }).getByRole("button", { name: "+ Action" }).click();
  await page.getByLabel("What needs to happen?").fill("E2E: pair with Hannah on webhook signatures");
  await page.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("Action item assigned")).toBeVisible();

  await login(page, USERS.maya);
  await page.goto("/my-work?tab=actions");
  await expect(page.getByText("E2E: pair with Hannah on webhook signatures")).toBeVisible();
  await page.goto("/blockers?scope=mine");
  await page.getByText("E2E: staging webhook endpoint rejects signatures").click();
  await expect(page.getByText("Hannah Lee").first()).toBeVisible();
});

test("Journey D — discovering another department without seeing confidential work", async ({ page }) => {
  await login(page, USERS.maya);
  await page.goto("/directory?tab=teams");
  await page.getByLabel("Search directory").fill("pricing");
  await page.getByRole("link", { name: /Sales/ }).first().click();
  await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible();
  await expect(page.getByText("Areas of responsibility")).toBeVisible();
  await expect(page.getByText("Enterprise deals")).toBeVisible();
  await expect(page.getByText("Rachel Green").first()).toBeVisible(); // point of contact
  await expect(page.getByText("Enterprise Pricing Revamp")).toHaveCount(0); // Sales-only project

  await page.goto("/directory?tab=departments");
  await page.getByRole("link", { name: /Design/ }).first().click();
  await page.getByRole("link", { name: /Design System v2/ }).click();
  await expect(page.getByRole("heading", { name: "Design System v2" })).toBeVisible();

  const elena = await login(page, USERS.elena).then(() => apiGet<Project[]>(page, "/projects"));
  const atlas = elena.body.find((p) => p.key === "ATL")!;
  await login(page, USERS.maya);
  await page.goto(`/projects/${atlas.id}`);
  await expectNotAvailable(page);
  await expect(page.getByText("Project Atlas")).toHaveCount(0);
});

test("Journey E — dependency becomes blocked, impact appears, then clears", async ({ page }) => {
  await login(page, USERS.priya);
  const projects = await apiGet<Project[]>(page, "/projects");
  const checkout = projects.body.find((p) => p.key === "CHK")!;
  await page.goto(`/projects/${checkout.id}?tab=dependencies`);
  await page.getByRole("button", { name: "Add dependency" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Upstream project").selectOption({ label: "Observability Overhaul (OBS)" });
  await dialog.getByLabel("What do you need from it?").fill("E2E: launch dashboards");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Dependency added")).toBeVisible();

  const row = page.getByRole("group", { name: "Depends on Observability Overhaul" });
  await row.getByLabel("Dependency state").selectOption("BLOCKED");
  await expect(page.getByText("Dependency updated")).toBeVisible();

  await login(page, USERS.daniel);
  await page.goto(`/dependencies?projectId=${checkout.id}`);
  const confirmed = page.locator("button", { hasText: "Checkout Launch" }).filter({ hasText: "Waiting on a blocked dependency" });
  await expect(confirmed).toBeVisible();
  await expect(page.getByText("Potentially impacted downstream")).toBeVisible();

  await login(page, USERS.priya);
  await page.goto(`/projects/${checkout.id}?tab=dependencies`);
  await page.getByRole("group", { name: "Depends on Observability Overhaul" }).getByLabel("Dependency state").selectOption("RESOLVED");
  await expect(page.getByText("Dependency updated")).toBeVisible();
  const after = await apiGet<{ impact: { confirmed: Array<{ id: string; reasons: string[] }> } }>(page, `/dependencies?projectId=${checkout.id}`);
  const reasons = after.body.impact.confirmed.find((c) => c.id === checkout.id)?.reasons ?? [];
  expect(reasons.filter((r) => r === "Waiting on a blocked dependency").length).toBeLessThanOrEqual(0);
});

test("Journey F — meeting brief, decision and follow-up", async ({ page }) => {
  await login(page, USERS.daniel);
  await page.goto("/meetings");
  await page.getByRole("link", { name: /Payments weekly sync/ }).first().click();
  await expect(page.getByText(/need discussion/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /New blockers/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Upcoming deadlines/ })).toBeVisible();

  await page.getByRole("tab", { name: /Decisions/ }).click();
  await page.getByLabel("Decision", { exact: true }).fill("E2E: ship checkout behind a feature flag");
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText("Decision recorded")).toBeVisible();

  await page.getByRole("tab", { name: /Action items/ }).click();
  await page.getByLabel("Action item", { exact: true }).fill("E2E: create the checkout feature flag");
  await page.getByLabel("Owner").selectOption({ label: "Maya Chen — Software Engineering Intern" });
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText("Action item assigned")).toBeVisible();
  const meetingUrl = page.url();

  await login(page, USERS.maya);
  await page.goto(meetingUrl);
  await page.getByRole("tab", { name: /Action items/ }).click();
  await expect(page.getByText("E2E: create the checkout feature flag")).toBeVisible();
  await page.getByRole("tab", { name: /Summary/ }).click();
  await expect(page.getByText("E2E: ship checkout behind a feature flag")).toBeVisible();
});

test("Journey G — another tenant cannot reach Northstar data", async ({ page }) => {
  await login(page, USERS.maya);
  const projects = await apiGet<Project[]>(page, "/projects");
  const pgw = projects.body.find((p) => p.key === "PGW")!;
  const northstarOrg = (await apiGet<{ active: { organization: { id: string } } }>(page, "/auth/me")).body.active.organization.id;

  await login(page, USERS.noah);
  await page.goto(`/projects/${pgw.id}`);
  await expectNotAvailable(page);
  expect((await apiGet(page, `/projects/${pgw.id}`)).status).toBe(404);

  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await page.getByPlaceholder(/Search people, teams/).fill("Checkout");
  await expect(page.getByText("No results you have access to.")).toBeVisible();
  await page.keyboard.press("Escape");

  const search = await apiGet<{ total: number }>(page, "/search?q=payment%20gateway%20integration");
  expect(JSON.stringify(search.body)).not.toContain("Payment Gateway Integration");
  const graph = await apiGet<{ nodes: Array<{ label: string }> }>(page, "/graph/work");
  expect(graph.body.nodes.map((n) => n.label)).not.toContain("Checkout Launch");
  const people = await apiGet<Array<{ name: string }>>(page, "/people");
  expect(people.body.map((p) => p.name)).not.toContain("Maya Chen");

  // Realtime: a socket authenticated as Meridian's owner cannot subscribe to Northstar.
  const cookie = (await page.context().cookies(API)).map((c) => `${c.name}=${c.value}`).join("; ");
  const socket = io(API, { transports: ["websocket"], extraHeaders: { cookie }, reconnection: false });
  await new Promise<void>((resolve, reject) => {
    socket.on("ready", () => resolve());
    socket.on("connect_error", reject);
  });
  expect(await socket.emitWithAck("subscribe", { orgId: northstarOrg })).toEqual({ ok: false, error: "FORBIDDEN" });
  socket.disconnect();
});
