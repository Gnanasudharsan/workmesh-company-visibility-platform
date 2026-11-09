import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/** Captures genuine screenshots of the running application into docs/screenshots. */
export default defineConfig({
  ...base,
  testMatch: /.*\.capture\.ts/,
  retries: 0,
  reporter: [["list"]],
  use: { ...base.use, trace: "off", screenshot: "off" },
  projects: [{ name: "screenshots", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } }],
});
