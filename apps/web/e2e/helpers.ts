import { expect, type Page } from "@playwright/test";

export const USERS = {
  maya: "maya.chen@northstar.example",
  daniel: "daniel.okafor@northstar.example",
  priya: "priya.nair@northstar.example",
  hannah: "hannah.lee@northstar.example",
  rachel: "rachel.green@northstar.example",
  sam: "sam.patel@northstar.example",
  elena: "elena.vasquez@northstar.example",
  noah: "noah.berg@meridian.example",
} as const;

export const API = process.env.E2E_API_URL ?? "http://localhost:8020";

/** Signs in through the real login form with the seeded password. */
export async function login(page: Page, email: string, password = process.env.E2E_PASSWORD!) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^Sign in/ }).click();
  await page.waitForURL(/\/(home|onboarding)/);
}

/** Reads JSON from the API using the browser's session cookie. */
export async function apiGet<T>(page: Page, path: string): Promise<{ status: number; body: T }> {
  return page.evaluate(async ({ url }) => {
    const res = await fetch(url, { credentials: "include" });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, { url: `${API}/api${path}` }) as Promise<{ status: number; body: T }>;
}

export async function expectNotAvailable(page: Page) {
  await expect(page.getByText("Not available")).toBeVisible();
}
