/**
 * Measures real latencies of the heaviest authorized endpoints against a running API.
 *   pnpm --filter @workmesh/api loadtest            (API on :8020, seeded demo data)
 * Env: LOAD_REQUESTS (per endpoint, default 300), LOAD_CONCURRENCY (default 10).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const API = process.env.LOAD_API_URL ?? "http://localhost:8020";
const N = Number(process.env.LOAD_REQUESTS ?? 300);
const C = Number(process.env.LOAD_CONCURRENCY ?? 10);
const password = JSON.parse(readFileSync(resolve(__dirname, "../../../.demo-credentials.json"), "utf8")).password as string;

async function login(email: string) {
  const res = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3002" }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function run(name: string, cookie: string, path: string) {
  const times: number[] = [];
  let errors = 0;
  let next = 0;
  const started = performance.now();
  const worker = async () => {
    while (next < N) {
      next++;
      const t = performance.now();
      const res = await fetch(`${API}/api${path}`, { headers: { cookie } });
      await res.arrayBuffer();
      if (!res.ok) errors++;
      times.push(performance.now() - t);
    }
  };
  await Promise.all(Array.from({ length: C }, worker));
  const total = (performance.now() - started) / 1000;
  times.sort((a, b) => a - b);
  const pct = (p: number) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))]!.toFixed(1);
  return { name, path, requests: times.length, errors, rps: (times.length / total).toFixed(0), p50: pct(50), p95: pct(95), p99: pct(99) };
}

async function main() {
  const maya = await login("maya.chen@northstar.example");
  const daniel = await login("daniel.okafor@northstar.example");
  const elena = await login("elena.vasquez@northstar.example");
  const cases: Array<[string, string, string]> = [
    ["Health (DB + RLS + Redis checks)", maya, "/health"],
    ["Employee dashboard", maya, "/dashboard/employee"],
    ["Team Pulse (manager)", daniel, "/dashboard/manager"],
    ["Leadership dashboard", elena, "/dashboard/leadership"],
    ["Project list + health", maya, "/projects"],
    ["People graph, all teams expanded", maya, "/graph/people?all=true"],
    ["Work graph", elena, "/graph/work"],
    ["Update feed (policy-filtered)", daniel, "/updates?limit=30"],
    ["Full-text search", maya, "/search?q=pay"],
    ["Meetings list", daniel, "/meetings"],
  ];
  const results = [];
  for (const [name, cookie, path] of cases) results.push(await run(name, cookie, path));
  console.warn(`\n${N} requests per endpoint, concurrency ${C}, against ${API}\n`);
  console.warn("| Endpoint | p50 ms | p95 ms | p99 ms | req/s | errors |");
  console.warn("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const r of results) console.warn(`| ${r.name} (\`${r.path}\`) | ${r.p50} | ${r.p95} | ${r.p99} | ${r.rps} | ${r.errors} |`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
