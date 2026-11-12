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
