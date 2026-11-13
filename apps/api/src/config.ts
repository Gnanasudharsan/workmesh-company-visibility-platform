import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().default(8020),
  DATABASE_URL: z.string().min(1),
  APP_DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:56402"),
  /** Namespaces queues and pub/sub channels (tests use a separate prefix). */
  REDIS_PREFIX: z.string().default("wm"),
  WEB_ORIGIN: z.string().default("http://localhost:3002"),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(72),
  COOKIE_SECURE: bool,
  METRICS_TOKEN: z.string().optional(),
  WORKER_INLINE: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  DEMO_MODE: bool,
  LOG_LEVEL: z.string().default("info"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(600),
  /** Ask the Mesh copilot (docs/COPILOT.md). Off by default; every copilot endpoint is 404 when off. */
  COPILOT_ENABLED: bool,
  COPILOT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  /** ollama (local, default) · anthropic (hosted, optional) · fake (scripted; tests and demos only). */
  COPILOT_PROVIDER: z.enum(["ollama", "anthropic", "fake"]).default("ollama"),
  /** Model name for the provider; defaults per provider (see copilot/providers). */
  COPILOT_MODEL: z.string().trim().optional(),
  OLLAMA_URL: z.string().default("http://localhost:11434"),
  /** Ollama context window. Its default is too small for the system prompt plus tool results. */
  OLLAMA_NUM_CTX: z.coerce.number().int().min(2048).max(131072).default(16384),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Tool calls allowed per question. */
  COPILOT_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(20).default(6),
  /** Whole-question budget, model calls and tools included. */
  COPILOT_TIMEOUT_MS: z.coerce.number().int().min(100).max(300_000).default(45_000),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === "production") {
    if (cfg.DEMO_MODE) throw new Error("DEMO_MODE must not be enabled in production");
    if (!cfg.COOKIE_SECURE) throw new Error("COOKIE_SECURE must be true in production");
    if (!cfg.METRICS_TOKEN || cfg.METRICS_TOKEN.startsWith("change-me"))
      throw new Error("Set a strong METRICS_TOKEN in production");
    if (cfg.COPILOT_PROVIDER === "fake") throw new Error("COPILOT_PROVIDER=fake must not be used in production");
  }
  cached = cfg;
  return cfg;
}

/** For tests that mutate env between suites. */
export function resetConfigCache() {
  cached = null;
}
