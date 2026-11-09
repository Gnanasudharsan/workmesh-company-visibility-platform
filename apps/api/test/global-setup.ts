import { execSync } from "node:child_process";
import { resolve } from "node:path";

/** Applies migrations to the test database once per run. Each suite reseeds what it needs. */
export default async function globalSetup() {
  require("./env");
  if (!/workmesh_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing to run integration tests outside workmesh_test");
  execSync("corepack pnpm exec prisma migrate deploy", {
    cwd: resolve(__dirname, ".."),
    env: { ...process.env },
    stdio: "pipe",
  });
}
