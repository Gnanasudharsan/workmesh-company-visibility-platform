"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { toast } from "./toast";
import type { Me } from "./types";

/** GET helper. The query key is the path, so invalidating "/projects" refreshes every projects query. */
export function useApi<T>(path: string | null, options: Omit<UseQueryOptions<T, ApiError>, "queryKey" | "queryFn"> = {}) {
  return useQuery<T, ApiError>({
    queryKey: [path],
    queryFn: () => api.get<T>(path!),
    enabled: !!path && (options.enabled ?? true),
    ...options,
  });
}

export function useMe() {
  return useApi<Me>("/auth/me", { staleTime: 30_000, retry: false });
}

/** Invalidates every cached query whose path starts with one of the prefixes. */
export function useInvalidate() {
  const qc = useQueryClient();
  return (...prefixes: string[]) =>
    qc.invalidateQueries({
      predicate: (q) => {
        const key = String(q.queryKey[0] ?? "");
        return prefixes.length === 0 || prefixes.some((p) => key.startsWith(p));
      },
    });
}

/**
 * Mutation helper: runs the request, shows a toast, and invalidates related queries.
 * Server errors (validation, conflicts, permissions) are shown verbatim — never swallowed.
 */
export function useAction<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: string[]; onSuccess?: (r: TResult, v: TVars) => void } = {},
) {
  const invalidate = useInvalidate();
  return useMutation<TResult, ApiError, TVars>({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(result) : opts.success);
      await invalidate(...(opts.invalidate ?? []));
      opts.onSuccess?.(result, vars);
    },
    onError: (err) => {
      if (err.code === "VERSION_CONFLICT") {
        toast.error("Someone else changed this", "We refreshed the latest version — please try again.");
        void invalidate(...(opts.invalidate ?? []));
      } else toast.error(err.message || "Something went wrong");
    },
  });
}

export { api };
