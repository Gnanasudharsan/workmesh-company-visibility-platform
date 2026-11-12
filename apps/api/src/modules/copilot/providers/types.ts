/**
 * Provider-neutral chat shapes for the copilot agent loop. Adapters translate them to each
 * model API. `raw` carries a provider's own assistant content (e.g. Anthropic thinking blocks)
 * so it can be passed back unchanged on the next turn.
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ToolResult {
  callId: string;
  name: string;
  /** Already wrapped as untrusted data (see prompt.ts). */
  content: string;
  isError: boolean;
}

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls: ToolCall[]; raw?: unknown }
  | { role: "tool"; results: ToolResult[] };

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the tool input. */
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  signal: AbortSignal;
}

export interface ChatReply {
  content: string;
  toolCalls: ToolCall[];
  raw?: unknown;
}

export interface CopilotProvider {
  readonly name: "fake" | "ollama" | "anthropic";
  readonly model: string;
  chat(req: ChatRequest): Promise<ChatReply>;
}

/** A model call failed. The message never includes prompt or response text. */
export class CopilotProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotProviderError";
  }
}
