/**
 * Typed fetch wrapper for the WorkMesh API.
 * - Sends the HTTP-only session cookie (credentials: include).
 * - Echoes the CSRF cookie in X-CSRF-Token on writes (double-submit).
 * - Turns error responses into ApiError with the server's code and message.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8020";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)wm_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : "";
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach WorkMesh right now. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; message?: string | string[]; issues?: unknown };
    const message = Array.isArray(d.message) ? d.message.join(", ") : (d.message ?? res.statusText);
    throw new ApiError(res.status, d.code ?? "ERROR", message || "Request failed", d.issues);
  }
  return (data ?? text) as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  del: <T>(path: string) => request<T>("DELETE", path),
};

/** Downloads an authenticated file (CSV/Markdown) without putting tokens in URLs. */
export async function download(path: string, filename: string) {
  const res = await fetch(`${API_URL}/api${path}`, { credentials: "include" });
  if (!res.ok) throw new ApiError(res.status, "DOWNLOAD_FAILED", "Download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
