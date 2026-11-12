import { Injectable } from "@nestjs/common";
import type { ChatMessage, ChatReply, ChatRequest, CopilotProvider } from "./types";

export interface FakeTurn {
  step: number;
  question: string;
  system: string;
  messages: ChatMessage[];
  tools: ChatRequest["tools"];
  signal: AbortSignal;
}
export type FakeScript = (turn: FakeTurn) => ChatReply | Promise<ChatReply>;

/**
 * Scripted provider for tests, CI and demos without a model (COPILOT_PROVIDER=fake; refused in
 * production). Tests install a script per case; otherwise a deterministic keyword router runs.
 */
@Injectable()
export class FakeCopilotProvider implements CopilotProvider {
  readonly name = "fake" as const;
  readonly model = "fake-scripted";
  private script: FakeScript | null = null;

  setScript(script: FakeScript | null) {
    this.script = script;
  }

  async chat(req: ChatRequest): Promise<ChatReply> {
    const question = (req.messages.find((m) => m.role === "user") as { content: string } | undefined)?.content.replace(/^Question:\s*/, "") ?? "";
    const step = req.messages.filter((m) => m.role === "assistant").length;
    return (this.script ?? defaultScript)({ step, question, system: req.system, messages: req.messages, tools: req.tools, signal: req.signal });
  }
}

/** Parses the JSON out of the most recent wrapped tool results. */
export function lastToolResults(messages: ChatMessage[]): Array<{ name: string; value: Record<string, unknown> }> {
  const last = [...messages].reverse().find((m) => m.role === "tool");
  if (!last || last.role !== "tool") return [];
  return last.results.map((r) => {
    const json = r.content.slice(r.content.indexOf("\n") + 1, r.content.lastIndexOf("\n"));
    try {
      return { name: r.name, value: JSON.parse(json) as Record<string, unknown> };
    } catch {
      return { name: r.name, value: {} };
    }
  });
}

/** Every titled record in a tool result, in document order. */
export function recordsIn(value: unknown, out: Array<{ type: string; id: string; title: string }> = []) {
  if (Array.isArray(value)) value.forEach((v) => recordsIn(v, out));
  else if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.type === "string" && typeof o.id === "string" && typeof o.title === "string") out.push({ type: o.type, id: o.id, title: o.title });
    Object.values(o).forEach((v) => recordsIn(v, out));
  }
  return out;
}

const ROUTES: Array<[RegExp, string, (m: RegExpMatchArray) => Record<string, unknown>]> = [
  [/block(?:ing|ed|ers?)\b.*?\b(?:on\s+)?([A-Z][\w-]*(?:\s+[A-Z0-9][\w-]*)*)/, "project_blockers", (m) => ({ project: m[1] })],
  [/depend\w*.*?([A-Z][\w-]*(?:\s+[A-Z0-9][\w-]*)*)/, "project_dependencies", (m) => ({ project: m[1] })],
  [/changed\b.*?\bon\s+([A-Z][\w-]*(?:\s+[A-Z0-9][\w-]*)*)/, "project_changes", (m) => ({ project: m[1] })],
  [/what (?:is|are)\s+(.+?)\s+working on/i, "person_work", (m) => ({ person: /^(i|me)$/i.test(m[1]!) ? "me" : m[1] })],
  [/what am i working on/i, "person_work", () => ({ person: "me" })],
  [/who (?:owns|can help(?: me)? with|knows about)\s+(.+?)\??$/i, "find_helpers", (m) => ({ topic: m[1] })],
  [/goals?\b.*\brisk/i, "goals_at_risk", () => ({})],
];

/** Deterministic stand-in for a model: route by keywords, then summarise the first records found. */
const defaultScript: FakeScript = ({ step, question, messages }) => {
  if (step === 0) {
    for (const [re, name, args] of ROUTES) {
      const m = question.match(re);
      if (m) return { content: "", toolCalls: [{ id: "fake_0", name, arguments: args(m) }] };
    }
    const words = question.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 3);
    return { content: "", toolCalls: [{ id: "fake_0", name: "search_records", arguments: { query: words.join(" ") || question.slice(0, 100) } }] };
  }
  const found = lastToolResults(messages).flatMap((r) => recordsIn(r.value));
  const unique = [...new Map(found.filter((r) => r.type !== "person" && r.type !== "team").map((r) => [r.id, r])).values()].slice(0, 4);
  if (!unique.length) return { content: "I couldn't find anything about that.", toolCalls: [] };
  return { content: `Here's what WorkMesh shows:\n\n${unique.map((r) => `- **${r.title}** [[${r.type}:${r.id}]]`).join("\n")}`, toolCalls: [] };
};
