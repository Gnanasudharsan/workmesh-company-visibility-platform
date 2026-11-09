import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

/**
 * Renders with a QueryClient whose cache is pre-filled per API path, so components are tested
 * against realistic server payloads without a network.
 */
export function renderWithData(ui: ReactElement, data: Record<string, unknown> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [path, value] of Object.entries(data)) client.setQueryData([path], value);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** Captures API calls made through fetch. */
export function mockFetch(responses: Record<string, unknown> = {}) {
  const calls: Array<{ url: string; method: string; body: unknown; headers: Record<string, string> }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^.*\/api/, "");
    calls.push({ url: path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: (init?.headers ?? {}) as Record<string, string> });
    const key = Object.keys(responses).find((k) => path.startsWith(k));
    const body = key ? responses[key] : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return calls;
}
