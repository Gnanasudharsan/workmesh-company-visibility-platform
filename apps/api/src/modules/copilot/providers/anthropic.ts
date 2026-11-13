import Anthropic from "@anthropic-ai/sdk";
import { CopilotProviderError, type ChatMessage, type ChatReply, type ChatRequest, type CopilotProvider } from "./types";

/** Models that accept server-side refusal fallbacks with `fallbacks: "default"`. */
const FALLBACK_MODELS = new Set(["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
/** Current-generation models that take `output_config.effort`. */
const EFFORT_MODELS = /^claude-(opus|sonnet|haiku|fable|mythos)-5/;

/**
 * Optional hosted provider (COPILOT_PROVIDER=anthropic). Uses the official SDK. The full assistant
 * `content` (including thinking blocks) is passed back unchanged on the next turn, as current
 * models require. Credentials resolve the SDK's usual way (ANTHROPIC_API_KEY or an `ant` profile).
 * Enabling it sends the viewer's authorized tool results to Anthropic.
 */
export class AnthropicProvider implements CopilotProvider {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(
    readonly model: string,
    opts: { apiKey?: string; fetch?: typeof fetch } = {},
  ) {
    this.client = new Anthropic({ apiKey: opts.apiKey || undefined, maxRetries: 1, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
  }

  async chat(req: ChatRequest): Promise<ChatReply> {
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: 16000,
          system: req.system,
          messages: req.messages.map(toAnthropic),
          tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema })),
          ...(EFFORT_MODELS.test(this.model) ? { output_config: { effort: "medium" as const } } : {}),
          ...(FALLBACK_MODELS.has(this.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { signal: req.signal },
      );
    } catch (err) {
      if (req.signal.aborted) throw err;
      if (err instanceof Anthropic.APIError) throw new CopilotProviderError(`Anthropic API returned ${err.status ?? "an error"}`);
      throw new CopilotProviderError("Anthropic API is not reachable");
    }
    // A declined request (after any fallback) has no usable answer; the agent returns the standard one.
    if (res.stop_reason === "refusal") return { content: "", toolCalls: [], raw: res.content };
    const toolCalls = res.content
      .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, arguments: b.input }));
    const content = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return { content, toolCalls, raw: res.content };
  }
}

function toAnthropic(m: ChatMessage): Anthropic.Beta.BetaMessageParam {
  switch (m.role) {
    case "user":
      return { role: "user", content: m.content };
    case "assistant":
      return {
        role: "assistant",
        content: (m.raw as Anthropic.Beta.BetaContentBlockParam[] | undefined) ?? [
          ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
          ...m.toolCalls.map((c) => ({ type: "tool_use" as const, id: c.id, name: c.name, input: c.arguments as Record<string, unknown> })),
        ],
      };
    case "tool":
      // All results of one turn go back in a single user message.
      return { role: "user", content: m.results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.callId, content: r.content, is_error: r.isError })) };
  }
}
