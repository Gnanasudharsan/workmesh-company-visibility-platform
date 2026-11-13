import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

const WIDTHS = [1920, 1440, 1280, 1024, 768, 390];
const PAGES = ["/home", "/team-pulse", "/map", "/roadmap", "/projects", "/directory", "/meetings", "/blockers", "/leadership", "/admin", "/dependencies?mode=impact", "/notifications", "/ask"];

test("no horizontal overflow on key pages at every target width", async ({ page }) => {
  test.setTimeout(300_000);
  const problems: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await page.getByTestId("persona-employee").waitFor();
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    if (scroll > inner + 1) problems.push(`/login @${width}px: content ${scroll}px wide`);
  }
  await login(page, USERS.elena); // owner: has every workspace
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      if (scroll > inner + 1) problems.push(`${path} @${width}px: content ${scroll}px wide`);
    }
  }
  expect(problems).toEqual([]);
});

test("mobile navigation opens and keyboard focus is visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, USERS.maya);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: /Company Map/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).not.toBe("none");
});
