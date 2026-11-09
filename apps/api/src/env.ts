import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Loads the repository-level .env for local development (real environment variables win). */
for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}
