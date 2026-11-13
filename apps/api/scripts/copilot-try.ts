/**
 * Try Ask the Mesh tools as a demo persona against a running local API (`make dev`).
 *
 *   pnpm copilot:try --list
 *   pnpm copilot:try --as maya --tool search_records --input '{"query":"checkout"}'
 *   pnpm copilot:try --as daniel --tool project_blockers --input '{"project":"Checkout Launch"}'
 *   pnpm copilot:try --as daniel --ask "What's blocking Checkout Launch?"
 *
 * Signs in through the real login flow (POST /api/auth/login → session + CSRF cookies) with the
 * password from the git-ignored .demo-credentials.json, then calls the DEMO_MODE-only tool endpoint
 * with the CSRF header (DEMO_MODE=true and COPILOT_ENABLED=true). `--ask` calls POST /api/copilot/ask,
 * the endpoint the web app uses, which needs only COPILOT_ENABLED=true.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEMO_PERSONAS, ISOLATION_PERSONA } from "../src/modules/dev/personas";

const ROOT = resolve(__dirname, "../../..");
if (existsSync(resolve(ROOT, ".env"))) process.loadEnvFile(resolve(ROOT, ".env"));

const API = process.env.WORKMESH_API_URL ?? `http://localhost:${process.env.API_PORT ?? 8020}/api`;
const ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3002";

export const PERSONAS: Record<string, string> = {
  ...Object.fromEntries(DEMO_PERSONAS.map((p) => [p.name.split(" ")[0]!.toLowerCase(), p.email])),
  noah: ISOLATION_PERSONA.email,
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(message: string): never {
  console.error(`copilot:try: ${message}`);
  process.exit(1);
}

export interface Session {
  cookie: string;
  csrf: string;
}

/** The real browser flow: login sets the HTTP-only session cookie and the readable CSRF cookie. */
export async function login(persona: string): Promise<Session> {
  const email = PERSONAS[persona];
  if (!email) fail(`unknown persona "${persona}". Use one of: ${Object.keys(PERSONAS).join(", ")}`);
  const credsFile = resolve(ROOT, ".demo-credentials.json");
  if (!existsSync(credsFile)) fail("no .demo-credentials.json — run `make seed` first");
  const { password } = JSON.parse(readFileSync(credsFile, "utf8")) as { password: string };
  let res: Response;
  try {
    res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    fail(`can't reach the API at ${API} — start it with \`make dev\``);
  }
  if (res.status !== 200) fail(`login as ${persona} failed (${res.status}): ${await res.text()}`);
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]!);
  const csrf = cookies.find((c) => c.startsWith("wm_csrf="))?.slice("wm_csrf=".length);
  if (!csrf) fail("login did not return a CSRF cookie");
  return { cookie: cookies.join("; "), csrf };
}

export async function call(session: Session, method: "GET" | "POST", path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Cookie: session.cookie,
      Origin: ORIGIN,
      ...(method === "POST" ? { "Content-Type": "application/json", "X-CSRF-Token": session.csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status === 404 && path.startsWith("/copilot/")) {
    fail(`${path} returned 404 — is the API running with COPILOT_ENABLED=true${path.includes("/dev/") ? " and DEMO_MODE=true" : ""}?\n${text}`);
  }
  if (!res.ok) fail(`${method} ${path} → ${res.status}\n${text}`);
  return JSON.parse(text) as unknown;
}

async function main() {
  const persona = (arg("as") ?? "maya").toLowerCase();
  const session = await login(persona);

  if (process.argv.includes("--list")) {
    const tools = (await call(session, "GET", "/copilot/dev/tools")) as Array<{ name: string; description: string; input: unknown }>;
    for (const t of tools) console.log(`${t.name}\n  ${t.description}\n  input: ${JSON.stringify(t.input)}\n`);
    return;
  }

  const question = arg("ask");
  if (question !== undefined) {
    const out = (await call(session, "POST", "/copilot/ask", { question })) as {
      answer: string;
      citations: Array<{ n: number; type: string; title: string; href: string }>;
      toolCalls: Array<{ name: string; found: boolean }>;
      latencyMs: number;
      model: string;
    };
    console.log(`\n${out.answer}\n`);
    for (const c of out.citations) console.log(`  [${c.n}] ${c.type} · ${c.title} → ${c.href}`);
    console.log(`\ntools: ${out.toolCalls.map((t) => `${t.name}${t.found ? "" : " (nothing found)"}`).join(", ") || "none"}`);
    console.log(`model: ${out.model} · ${out.latencyMs} ms`);
    if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
    return;
  }

  const tool = arg("tool");
  if (!tool) fail("pass --ask \"<question>\", --tool <name>, or --list");
  let input: unknown = {};
  const raw = arg("input");
  if (raw) {
    try {
      input = JSON.parse(raw);
    } catch {
      fail(`--input is not valid JSON: ${raw}`);
    }
  }
  const out = await call(session, "POST", `/copilot/dev/tools/${tool}`, input);
  console.log(JSON.stringify(out, null, 2));
}

if (require.main === module) {
  main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
}
