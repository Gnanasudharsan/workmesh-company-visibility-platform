import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { apiGet, login, USERS } from "./helpers";

/**
 * Real screenshots of the running app with the SYNTHETIC Northstar Labs demo data.
 * Run with `make screenshots` (reseeds first). Output: docs/screenshots/<SHOT_DIR>/*.png
 * (default: midnight-edition; the pre-redesign baseline lives in before-redesign).
 */
const OUT = resolve(__dirname, "../../../docs/screenshots", process.env.SHOT_DIR ?? "midnight-edition");
const shot = async (page: Page, name: string, opts: { fullPage?: boolean } = {}) => {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600); // let layout animations settle
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.fullPage ?? false });
};

test.describe.configure({ mode: "serial" });

test("login", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/login");
  await expect(page.getByText("Demo personas")).toBeVisible();
  await shot(page, "01-login");
});

test("employee workspace", async ({ page }) => {
  await login(page, USERS.maya);
  await expect(page.getByText("Current assignments")).toBeVisible();
  await shot(page, "02-employee-dashboard");
  await page.getByRole("button", { name: "Share an update" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project").selectOption({ label: "Payment Gateway Integration (PGW)" });
  await dialog.getByLabel(/What are you working on/).fill("Webhook signature verification");
  await dialog.getByLabel("Next step").fill("Run the sandbox suite once credentials arrive");
  await dialog.getByRole("button", { name: /I'm blocked on something/ }).click();
  await dialog.getByLabel("What's blocking you?").fill("Waiting on processor sandbox credentials");
  await shot(page, "10-update-composer");
});

test("manager workspace", async ({ page }) => {
  await login(page, USERS.daniel);
  await page.goto("/team-pulse");
  await expect(page.getByRole("heading", { name: "Team Pulse" })).toBeVisible();
  await shot(page, "03-manager-team-pulse");
  await page.goto("/blockers?scope=queue");
  await shot(page, "11-blocker-queue");
  const blockers = await apiGet<Array<{ id: string; title: string }>>(page, "/blockers?scope=queue");
  const b = blockers.body.find((x) => x.title.startsWith("Processor sandbox")) ?? blockers.body[0]!;
  await page.goto(`/blockers/${b.id}`);
  await shot(page, "12-blocker-timeline");
  await page.goto("/meetings");
  await page.getByRole("link", { name: /Payments weekly sync/ }).first().click();
  await expect(page.getByText(/need discussion/)).toBeVisible();
  await shot(page, "14-meeting-brief", { fullPage: true });
});

test("leadership workspace", async ({ page }) => {
  await login(page, USERS.elena);
  await page.goto("/leadership");
  await expect(page.getByText("Department health")).toBeVisible();
  await shot(page, "04-leadership-dashboard", { fullPage: true });
});

test("company map", async ({ page }) => {
  await login(page, USERS.maya);
  await page.goto("/map");
  await page.locator(".react-flow__node-department", { hasText: "Engineering" }).click();
  await page.locator(".react-flow__node-team", { hasText: "Payments" }).click();
  await expect(page.locator(".react-flow__node-person", { hasText: "Maya Chen" })).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "05-company-map-people");
  await page.goto("/map?mode=work");
  await expect(page.locator(".react-flow__node-project", { hasText: "Checkout Launch" })).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "06-company-map-work");
});

test("teams, roadmap, projects, dependencies", async ({ page }) => {
  await login(page, USERS.priya);
  const teams = await apiGet<Array<{ id: string; name: string }>>(page, "/teams");
  await page.goto(`/teams/${teams.body.find((t) => t.name === "Payments")!.id}`);
  await shot(page, "07-team-profile");
  await page.goto("/roadmap");
  await shot(page, "08-roadmap-timeline");
  const projects = await apiGet<Array<{ id: string; key: string }>>(page, "/projects");
  const chk = projects.body.find((p) => p.key === "CHK")!;
  await page.goto(`/projects/${chk.id}`);
  await shot(page, "09-project-detail");
  await page.goto(`/dependencies?projectId=${projects.body.find((p) => p.key === "PGW")!.id}`);
  await page.waitForTimeout(800);
  await shot(page, "13-dependency-explorer");
});

test("administration", async ({ page }) => {
  await login(page, USERS.sam);
  await page.goto("/admin/reporting");
  await page.getByLabel("Person").selectOption({ label: "Maya Chen — Software Engineering Intern" });
  await expect(page.getByText("Reports to").first()).toBeVisible();
  await shot(page, "15-admin-reporting");
  await page.goto("/admin/permissions");
  await page.getByLabel("Member").selectOption({ label: "Sam Patel — Head of Operations" });
  await page.getByLabel("Resource", { exact: true }).selectOption({ label: "Customer Health Score" });
  await page.getByRole("button", { name: "Inspect" }).click();
  await expect(page.getByText("project.viewDetails")).toBeVisible();
  await shot(page, "16-admin-permission-inspector");
});

test("directory, meetings and admin overview", async ({ page }) => {
  await login(page, USERS.sam);
  await page.goto("/directory?tab=teams");
  await shot(page, "18-directory");
  await page.goto("/meetings");
  await shot(page, "19-meetings");
  await page.goto("/admin");
  await shot(page, "20-admin-overview");
});

test("tablet dashboard", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await login(page, USERS.daniel);
  await page.goto("/team-pulse");
  await shot(page, "21-tablet-team-pulse");
  await context.close();
});

test("mobile navigation", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await login(page, USERS.maya);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.waitForTimeout(400);
  await shot(page, "22-mobile-navigation");
  await context.close();
});

test("mobile dashboard", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await login(page, USERS.maya);
  await expect(page.getByText("Current assignments")).toBeVisible();
  await shot(page, "17-mobile-dashboard");
  await context.close();
});
