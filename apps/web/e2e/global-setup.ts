import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Reseeds the synthetic demo tenants and exposes the generated demo password to the tests. */
export default async function globalSetup() {
  const root = resolve(__dirname, "../../..");
  execSync("corepack pnpm --filter @workmesh/api run seed", { cwd: root, stdio: "pipe", env: { ...process.env } });
  const creds = JSON.parse(readFileSync(resolve(root, ".demo-credentials.json"), "utf8")) as { password: string };
  process.env.E2E_PASSWORD = creds.password;
}
