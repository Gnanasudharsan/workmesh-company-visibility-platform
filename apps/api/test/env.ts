/**
 * Integration tests run against a dedicated database (workmesh_test) and Redis prefix so they
 * never touch development data or a running dev worker.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../../.env");
if (existsSync(root)) process.loadEnvFile(root);

const swapDb = (url: string | undefined) => (url ?? "").replace(/\/workmesh(\?|$)/, "/workmesh_test$1");

process.env.NODE_ENV = "test";
if (!process.env.WORKMESH_TEST_DB_READY) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? swapDb(process.env.DATABASE_URL);
  process.env.APP_DATABASE_URL = process.env.TEST_APP_DATABASE_URL ?? swapDb(process.env.APP_DATABASE_URL);
  process.env.WORKMESH_TEST_DB_READY = "1";
}
process.env.REDIS_PREFIX = "wm-test";
process.env.DEMO_MODE = "true";
process.env.DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "integration-test-password";
process.env.RATE_LIMIT_PER_MINUTE = "100000";
process.env.AUTH_RATE_LIMIT_PER_MINUTE = "100000";
process.env.LOG_LEVEL = "silent";
process.env.WORKER_INLINE = "true";
process.env.METRICS_TOKEN = "test-metrics-token";
