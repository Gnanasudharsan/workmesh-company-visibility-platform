import { CopilotProviderError, type ChatMessage, type ChatReply, type ChatRequest, type CopilotProvider } from "./types";

interface OllamaToolCall {
  function: { name: string; arguments: unknown };
}
interface OllamaResponse {
  message?: { content?: string; tool_calls?: OllamaToolCall[] };
}

/** Local models through Ollama's /api/chat with native tool calling. The default provider. */
export class OllamaProvider implements CopilotProvider {
  readonly name = "ollama" as const;

  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async chat(req: ChatRequest): Promise<ChatReply> {
    const body = {
      model: this.model,
      stream: false,
      options: { temperature: 0 },
      messages: [{ role: "system", content: req.system }, ...req.messages.flatMap(toOllama)],
      tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
    };
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (err) {
      if (req.signal.aborted) throw err;
      throw new CopilotProviderError("Ollama is not reachable");
    }
    // The body may echo the prompt; report the status only.
    if (!res.ok) throw new CopilotProviderError(`Ollama returned ${res.status}`);
    const data = (await res.json()) as OllamaResponse;
    const calls = data.message?.tool_calls ?? [];
    return {
      content: stripThinking(data.message?.content ?? ""),
      toolCalls: calls.map((c, i) => ({ id: `call_${i}`, name: c.function.name, arguments: parseArgs(c.function.arguments) })),
    };
  }
}

function toOllama(m: ChatMessage): object[] {
  switch (m.role) {
    case "user":
      return [{ role: "user", content: m.content }];
    case "assistant":
      return [{ role: "assistant", content: m.content, tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.arguments } })) }];
    case "tool":
      return m.results.map((r) => ({ role: "tool", tool_name: r.name, content: r.content }));
  }
}

function parseArgs(args: unknown): unknown {
  if (typeof args !== "string") return args ?? {};
  try {
    return JSON.parse(args);
  } catch {
    return {};
  }
}

/** Some local models emit their reasoning inline; it is never part of the answer. */
export function stripThinking(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}
