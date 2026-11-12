import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AuthContext } from "@workmesh/core";
import { createReadApi, READ_METHODS, type CopilotServices } from "./facade";
import { CitationLedger, collectRecords } from "./tool-runner";
import { TOOLS } from "./tools";

/** A write-shaped method name: a verb on its own or followed by a camelCase noun (update, updateProject). */
const WRITE_VERB = /^(create|update|delete|remove|add|assign|transition|publish|grant|revoke|set|record|ack|acknowledge|comment|request|report|complete|share|bump|write|save|upsert|resolve)([A-Z]|$)/;

/** Stub services that carry write methods too, so the test proves the facade doesn't expose them. */
function stubServices() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const spy = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return Promise.resolve({ results: {}, goals: [] });
  };
  const services = {
    search: { search: spy("search.search") },
    projects: { get: spy("projects.get"), activity: spy("projects.activity"), update: spy("projects.update"), create: spy("projects.create") },
    blockers: { list: spy("blockers.list"), transition: spy("blockers.transition") },
    updates: { list: spy("updates.list"), create: spy("updates.create"), publish: spy("updates.publish") },
    dependencies: { explorer: spy("dependencies.explorer"), create: spy("dependencies.create") },
    goals: { tree: spy("goals.tree"), update: spy("goals.update") },
    directory: { person: spy("directory.person"), team: spy("directory.team"), completeOnboarding: spy("directory.completeOnboarding") },
  } as unknown as CopilotServices;
  return { services, calls };
}

const ctx = { membershipId: "m-1", orgId: "o-1" } as unknown as AuthContext;

describe("copilot read facade", () => {
  it("exposes exactly the pinned read methods, frozen", () => {
    const api = createReadApi(stubServices().services, ctx);
    expect(Object.keys(api).sort()).toEqual([...READ_METHODS].sort());
    expect(Object.isFrozen(api)).toBe(true);
    for (const m of READ_METHODS) expect(m).not.toMatch(WRITE_VERB);
    // The underlying services are not reachable through the facade.
    expect((api as unknown as Record<string, unknown>).projects).toBeUndefined();
    expect(() => Object.assign(api, { update: () => 0 })).toThrow();
  });

  it("binds the request's AuthContext so tools can't choose whose permissions apply", async () => {
    const { services, calls } = stubServices();
    const api = createReadApi(services, ctx);
    await api.project("p-1");
    await api.updates({ authorId: "a-1" });
    await api.blockers({ projectId: "p-1", open: true });
    expect(calls).toEqual([
      { method: "projects.get", args: [ctx, "p-1"] },
      { method: "updates.list", args: [ctx, { authorId: "a-1", drafts: false }] },
      { method: "blockers.list", args: [ctx, { scope: "all", projectId: "p-1", open: true }] },
    ]);
    expect(api.self()).toBe("m-1");
  });

  it("never passes drafts to the model, even if a tool asks", async () => {
    const { services, calls } = stubServices();
    const api = createReadApi(services, ctx);
    await api.updates({ drafts: true } as unknown as Parameters<typeof api.updates>[0]);
    expect(calls[0]!.args[1]).toMatchObject({ drafts: false });
  });

  it("tool modules can't reach the database, the execution context or a service instance", () => {
    const dir = resolve(__dirname, "tools");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(3);
    for (const f of files) {
      const src = readFileSync(resolve(dir, f), "utf8");
      const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
      const forbidden = imports.filter((spec) => /db\.service|@prisma\/client|common\/context|policy\/authz/.test(spec));
      expect({ file: f, forbidden }).toEqual({ file: f, forbidden: [] });
      // Only type imports (and the SEARCH_TYPES constant) may come from service modules.
      for (const line of src.split("\n").filter((l) => /from\s+"[^"]*\.service"/.test(l))) {
        expect(line).toMatch(/^import (type |\{ SEARCH_TYPES, type SearchType \})/);
      }
    }
  });

  it("every tool has a strict Zod schema that rejects unknown keys", () => {
    expect(TOOLS).toHaveLength(8);
    for (const t of TOOLS) expect(t.input.safeParse({ __proto_probe: 1 }).success).toBe(false);
  });
});

describe("citation ledger", () => {
  it("collects titled records of known types, at any depth, once", () => {
    const ledger = new CitationLedger();
    const n = collectRecords(
      {
        found: true,
        project: { type: "project", id: "p1", title: "Checkout", lead: { type: "person", id: "u1", title: "Priya" } },
        list: [{ type: "blocker", id: "b1", title: "Sandbox" }, { type: "project", id: "p1", title: "Checkout" }],
        noTitle: { type: "change", id: "c1" },
        unknown: { type: "secret", id: "s1", title: "x" },
      },
      ledger,
    );
    expect(n).toBe(4);
    expect(ledger.all().map((r) => `${r.type}:${r.id}`).sort()).toEqual(["blocker:b1", "person:u1", "project:p1"]);
    expect(ledger.get("project", "p1")?.title).toBe("Checkout");
    expect(ledger.get("project", "nope")).toBeUndefined();
  });
});
