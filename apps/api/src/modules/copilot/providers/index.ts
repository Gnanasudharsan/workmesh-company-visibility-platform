import { Injectable } from "@nestjs/common";
import { config } from "../../../config";
import { AnthropicProvider } from "./anthropic";
import { FakeCopilotProvider } from "./fake";
import { OllamaProvider } from "./ollama";
import type { CopilotProvider } from "./types";

export const DEFAULT_MODELS = { ollama: "qwen2.5:7b-instruct", anthropic: "claude-opus-5-5", fake: "fake-scripted" } as const;

/** Picks the configured provider. Re-reads config, so tests and restarts see changes. */
@Injectable()
export class CopilotProviders {
  private cached: { key: string; provider: CopilotProvider } | null = null;

  constructor(private readonly fake: FakeCopilotProvider) {}

  current(): CopilotProvider {
    const cfg = config();
    if (cfg.COPILOT_PROVIDER === "fake") return this.fake;
    const model = cfg.COPILOT_MODEL || DEFAULT_MODELS[cfg.COPILOT_PROVIDER];
    const key = `${cfg.COPILOT_PROVIDER}|${model}|${cfg.OLLAMA_URL}|${cfg.OLLAMA_NUM_CTX}`;
    if (this.cached?.key !== key) {
      const provider = cfg.COPILOT_PROVIDER === "anthropic" ? new AnthropicProvider(model, { apiKey: cfg.ANTHROPIC_API_KEY }) : new OllamaProvider(cfg.OLLAMA_URL, model, fetch, cfg.OLLAMA_NUM_CTX);
      this.cached = { key, provider };
    }
    return this.cached.provider;
  }
}

export { FakeCopilotProvider } from "./fake";
export * from "./types";
