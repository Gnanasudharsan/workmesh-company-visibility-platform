import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

describe("api client", () => {
  afterEach(() => {
    document.cookie = "wm_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    vi.restoreAllMocks();
  });

  it("sends cookies and echoes the CSRF cookie on writes only", async () => {
    document.cookie = "wm_csrf=token-123";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await api.post("/updates", { currentFocus: "x" });
    await api.get("/projects");
    const [, postInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [, getInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(postInit.credentials).toBe("include");
    expect((postInit.headers as Record<string, string>)["X-CSRF-Token"]).toBe("token-123");
    expect((getInit.headers as Record<string, string>)["X-CSRF-Token"]).toBeUndefined();
  });

  it("surfaces the server's error code and message", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ code: "VERSION_CONFLICT", message: "Changed by someone else" }), { status: 409 })) as unknown as typeof fetch;
    await expect(api.patch("/projects/1", {})).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT", message: "Changed by someone else" });
  });

  it("reports network failures as a recoverable error", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const err = (await api.get("/projects").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("NETWORK");
  });
});
