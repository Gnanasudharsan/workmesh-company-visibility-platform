import { GatewayTimeoutException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import { config } from "../../config";
import { finalizeAnswer, type Citation } from "./citations";
import { systemPrompt, userPrompt, wrapToolResult } from "./prompt";
import { CopilotProviders, type ChatMessage, type ToolResult, type ToolSpec } from "./providers";
import { CitationLedger, CopilotToolRunner, modelView, type CopilotAuth } from "./tool-runner";
import { TOOLS } from "./tools";

export interface AskResult {
  answer: string;
  citations: Citation[];
  toolCalls: Array<{ name: string; found: boolean }>;
  latencyMs: number;
  model: string;
}

/** JSON Schemas the model sees, derived from the same Zod schemas the runner validates with. */
export const TOOL_SPECS: ToolSpec[] = TOOLS.map((t) => {
  const { $schema: _drop, ...parameters } = z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>;
  return { name: t.name, description: t.description, parameters };
});

class Timeout extends Error {}

/** Any citation token, valid or not: `[[R3]]`, `[R3]`, `[[ref:R3]]`, `[[project:<uuid>]]`. */
const HAS_CITATION = /\[\[?\s*(?:ref\s*[:#]\s*)?R\d|\[\[?\s*[a-z_]+\s*[:#]\s*[0-9a-f]{8}-/i;
/** Drafts that already say nothing was found are never pushed to cite something. */
const SAYS_NOT_FOUND = /\b(couldn'?t|could not|can'?t|cannot|unable to|didn'?t|did not)\s+find\b|\bno (information|records?|results?|data)\b|\bnot found\b/i;

/**
 * One corrective turn for a draft that forgot its citations. The reply goes through exactly the
 * same server-side validation, so this can't make an uncited or unreturned record appear.
 */
export const CITATION_RETRY =
  "Your answer has no citations, so it can't be shown. Rewrite the same answer and add the [[R#]] ref of the record each fact came from right after that fact. Use only refs that appear in the tool results above, and don't call any tools. If the tool results don't answer the question, reply exactly: I couldn't find anything about that in WorkMesh.";

export function needsCitationRetry(draft: string, ledgerSize: number): boolean {
  return ledgerSize > 0 && draft.trim().length > 0 && !HAS_CITATION.test(draft) && !SAYS_NOT_FOUND.test(draft);
}

/**
 * Single-turn tool-calling loop. The model only ever sees the system prompt, the question and
 * wrapped tool results; every tool call goes through the ToolRunner as the signed-in user; the
 * answer's citations are validated server-side against this request's ledger.
 */
@Injectable()
export class CopilotAgent {
  private readonly logger = new Logger("Copilot");

  constructor(
    private readonly providers: CopilotProviders,
    private readonly runner: CopilotToolRunner,
  ) {}

  async ask(auth: CopilotAuth, question: string): Promise<AskResult> {
    const started = Date.now();
    const cfg = config();
    const provider = this.providers.current();
    const ledger = new CitationLedger();
    const toolCalls: AskResult["toolCalls"] = [];
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Timeout());
      }, cfg.COPILOT_TIMEOUT_MS);
    });
    deadline.catch(() => undefined); // observed through Promise.race; never an unhandled rejection
    const log = (outcome: string, extra: Record<string, unknown> = {}) =>
      // Metadata only: never the question, tool results or the answer (docs/SECURITY.md).
      this.logger.log({ event: "copilot.ask", memberId: auth.membershipId, model: provider.model, tools: toolCalls.map((t) => t.name), toolCalls: toolCalls.length, latencyMs: Date.now() - started, outcome, ...extra });

    try {
      const system = systemPrompt(new Date().toISOString().slice(0, 10));
      const messages: ChatMessage[] = [{ role: "user", content: userPrompt(question) }];
      let draft = "";
      let lastRaw: unknown;
      // Each step is one model call; the extra steps let the model answer after its last tool call.
      for (let step = 0; step < cfg.COPILOT_MAX_TOOL_CALLS + 2; step++) {
        const reply = await Promise.race([provider.chat({ system, messages, tools: TOOL_SPECS, signal: controller.signal }), deadline]);
        if (!reply.toolCalls.length) {
          draft = reply.content;
          lastRaw = reply.raw;
          break;
        }
        messages.push({ role: "assistant", content: reply.content, toolCalls: reply.toolCalls, raw: reply.raw });
        const results: ToolResult[] = [];
        for (const call of reply.toolCalls) {
          if (toolCalls.length >= cfg.COPILOT_MAX_TOOL_CALLS) {
            results.push({ callId: call.id, name: call.name, isError: true, content: wrapToolResult(call.name, { error: "TOOL_BUDGET_EXHAUSTED", message: "No more lookups for this question. Answer now from the results you have." }) });
            continue;
          }
          const run = await Promise.race([this.runner.run(auth, call.name, call.arguments, ledger), deadline]);
          toolCalls.push({ name: call.name, found: run.ok && (run.result as { found?: boolean }).found !== false });
          results.push(
            run.ok
              ? { callId: call.id, name: call.name, isError: false, content: wrapToolResult(call.name, modelView(run.result, ledger)) }
              : { callId: call.id, name: call.name, isError: true, content: wrapToolResult(call.name, { error: run.error, issues: run.issues }) },
          );
        }
        messages.push({ role: "tool", results });
      }
      let retried = false;
      if (needsCitationRetry(draft, ledger.all().length)) {
        retried = true;
        messages.push({ role: "assistant", content: draft, toolCalls: [], raw: lastRaw });
        messages.push({ role: "user", content: CITATION_RETRY });
        const fix = await Promise.race([provider.chat({ system, messages, tools: TOOL_SPECS, signal: controller.signal }), deadline]);
        if (!fix.toolCalls.length) draft = fix.content;
      }
      const { answer, citations, stripped } = finalizeAnswer(draft, ledger);
      const latencyMs = Date.now() - started;
      log(citations.length ? "answered" : "not_found", { citations: citations.length, stripped, retried });
      return { answer, citations, toolCalls, latencyMs, model: provider.model };
    } catch (err) {
      if (err instanceof Timeout || controller.signal.aborted) {
        log("timeout");
        throw new GatewayTimeoutException({ code: "COPILOT_TIMEOUT", message: "Ask the Mesh took too long to answer. Try a narrower question." });
      }
      log("error", { error: err instanceof Error ? err.name : "unknown" });
      // Tool errors (e.g. a database failure) surface as 500 through the normal filter; model errors as 503.
      if (err instanceof Error && err.name === "CopilotProviderError") {
        throw new ServiceUnavailableException({ code: "COPILOT_UNAVAILABLE", message: "Ask the Mesh can't reach its model right now." });
      }
      throw err;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
}
