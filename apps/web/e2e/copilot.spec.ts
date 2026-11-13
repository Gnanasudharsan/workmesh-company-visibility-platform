import { expect, test, type Page } from "@playwright/test";
import { apiGet, login, USERS } from "./helpers";

/**
 * Ask the Mesh journey against the full stack. The API runs with COPILOT_PROVIDER=fake (see
 * playwright.config.ts), so answers are deterministic and no model is ever called.
 */
test.describe.configure({ mode: "serial" });

const STANDARD = "I couldn't find anything about that in WorkMesh.";
const composer = (page: Page) => page.getByLabel("Ask a question about your company");

test("Journey H — Ask the Mesh answers with sources the user can open", async ({ page }) => {
  await login(page, USERS.daniel);
  const status = await apiGet<{ enabled: boolean }>(page, "/copilot/status");
  expect(status.status, "start the API with COPILOT_ENABLED=true COPILOT_PROVIDER=fake").toBe(200);

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Ask the Mesh" }).click();
  await expect(page).toHaveURL(/\/ask$/);
  await expect(page.getByRole("heading", { name: "Ask the Mesh" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Suggested questions" }).getByRole("button").first()).toBeVisible();
  await expect(composer(page)).toBeFocused();

  await composer(page).fill("What's blocking Checkout Launch?");
  await page.keyboard.press("Enter");
  const sources = page.getByRole("list", { name: "Sources" }).last();
  await expect(sources).toBeVisible();
  await expect(sources.getByRole("link", { name: /Checkout Launch/ }).first()).toBeVisible();
  await expect(sources.getByRole("link", { name: /Tax provider rate limits in staging/ })).toBeVisible();
  await expect(page.getByText(/lookup · .* · fake-scripted/).last()).toBeVisible();

  // An inline [n] marker jumps to its source; the chip opens the record.
  await page.getByRole("link", { name: "Source 1: Checkout Launch" }).first().click();
  await sources.getByRole("link", { name: /Checkout Launch/ }).first().click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Checkout Launch" }).first()).toBeVisible();
});

test("Journey H — ⌘K hands a question to Ask the Mesh without putting it in the URL", async ({ page }) => {
  await login(page, USERS.priya);
  // The shell is hydrated (and knows the copilot is on) once the sidebar shows the entry.
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Ask the Mesh" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog");
  await palette.getByPlaceholder(/Search people, teams/).fill("What changed on Checkout Launch this week?");
  await palette.getByRole("option", { name: /Ask the Mesh: “What changed on Checkout Launch this week\?”/ }).click();
  await expect(page).toHaveURL(/\/ask$/);
  await expect(page.getByText("What changed on Checkout Launch this week?", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Sources" }).getByRole("link", { name: /Checkout Launch/ }).first()).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain("What changed on");
});

test("Journey H — a restricted project looks exactly like one that doesn't exist", async ({ page }) => {
  await login(page, USERS.maya);
  await page.goto("/ask");
  const answers = page.getByRole("region", { name: "Answers" });
  for (const question of ["Tell me about Project Atlas", "Tell me about Project Zephyr"]) {
    await composer(page).fill(question);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(answers.getByRole("article").last().getByText(STANDARD)).toBeVisible();
  }
  // Compare the answer cards (the article's second child), ignoring the measured latency.
  const [atlas, zephyr] = await answers.getByRole("article").evaluateAll((els) => els.map((e) => (e.children[1] as HTMLElement).innerText.replace(/\d+\.\d s/, "")));
  expect(atlas).toBe(zephyr);
  await expect(page.getByRole("list", { name: "Sources" })).toHaveCount(0);
  await expect(answers).not.toContainText(/permission|access|restricted|confidential/i);
});

test("Journey H — Show on map focuses the Company Map on the cited records", async ({ page }) => {
  await login(page, USERS.daniel);
  await page.goto("/ask");
  await composer(page).fill("What's blocking Checkout Launch?");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: /cited records? on the Company Map/ }).last().click();

  await expect(page).toHaveURL(/\/map\?mode=work&highlight=/);
  const banner = page.getByRole("region", { name: "Records from Ask the Mesh" });
  await expect(banner).toContainText(/Showing \d+ records? from your Ask the Mesh answer/);
  const projects = (await apiGet<Array<{ id: string; key: string }>>(page, "/projects")).body;
  const chk = projects.find((p) => p.key === "CHK")!;
  const node = page.locator(`.react-flow__node[data-id="project:${chk.id}"]`);
  await expect(node.locator("[data-highlighted]")).toBeVisible();
  await expect(node).toBeInViewport(); // camera focus
  await expect(page.locator(".react-flow__node [data-dimmed]").first()).toBeAttached(); // everything else is dimmed

  // The banner's chips are keyboard-reachable and open the inspector for that node.
  await banner.getByRole("button", { name: "Checkout Launch" }).click();
  await expect(page.getByRole("complementary", { name: "Project details" }).getByRole("heading", { name: "Checkout Launch" })).toBeVisible();

  await banner.getByRole("button", { name: "Clear highlighted records" }).click();
  await expect(page).toHaveURL(/\/map\?mode=work$/);
  await expect(banner).toHaveCount(0);
});

test("Journey H — cited people open on the People map, expanded to show them", async ({ page }) => {
  await login(page, USERS.daniel);
  await page.goto("/ask");
  await composer(page).fill("What is Maya Chen working on?");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: /cited records? on the Company Map/ }).last().click();
  const banner = page.getByRole("region", { name: "Records from Ask the Mesh" });
  await banner.getByRole("button", { name: /1 more on the People map/ }).click();
  await expect(page).toHaveURL(/mode=people&highlight=/);
  const people = (await apiGet<Array<{ id: string; name: string }>>(page, "/people")).body;
  const mayaId = people.find((p) => p.name === "Maya Chen")!.id;
  const node = page.locator(`.react-flow__node[data-id="person:${mayaId}"]`);
  await expect(node.locator("[data-highlighted]")).toBeVisible();
  await expect(node).toBeInViewport();
  await expect(banner).toContainText("Showing 1 record from your Ask the Mesh answer");
});

test("Journey H — a highlight can't add a node the server didn't authorize", async ({ page }) => {
  await login(page, USERS.elena);
  const all = (await apiGet<Array<{ id: string; key: string }>>(page, "/projects")).body;
  const atlas = all.find((p) => p.key === "ATL")!;
  const checkout = all.find((p) => p.key === "CHK")!;

  await login(page, USERS.maya);
  await page.goto(`/map?mode=work&highlight=project:${atlas.id},project:${checkout.id}`);
  const banner = page.getByRole("region", { name: "Records from Ask the Mesh" });
  await expect(banner).toContainText("Showing 1 record from your Ask the Mesh answer");
  await expect(page.locator(`.react-flow__node[data-id="project:${checkout.id}"] [data-highlighted]`)).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="project:${atlas.id}"]`)).toHaveCount(0);
  await expect(page.getByText("Project Atlas")).toHaveCount(0);
  const graph = await apiGet<{ nodes: Array<{ id: string }> }>(page, "/graph/work");
  expect(graph.body.nodes.map((n) => n.id)).not.toContain(`project:${atlas.id}`);
});
