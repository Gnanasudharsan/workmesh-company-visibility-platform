"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { API_URL } from "./api";
import { useInvalidate } from "./hooks";
import { useUi } from "./store";

const INVALIDATIONS: Array<[RegExp, string[]]> = [
  [/^update\./, ["/updates", "/dashboard", "/people", "/meetings"]],
  [/^comment\./, ["/updates", "/blockers"]],
  [/^blocker\./, ["/blockers", "/dashboard", "/projects", "/dependencies", "/meetings"]],
  [/^(project|milestone|workitem)\./, ["/projects", "/roadmap", "/goals", "/dashboard", "/graph", "/milestones", "/work-items", "/dependencies"]],
  [/^dependency\./, ["/dependencies", "/projects", "/graph", "/dashboard"]],
  [/^(meeting|decision|action_item)\./, ["/meetings", "/decisions", "/action-items", "/dashboard"]],
];

/**
 * Realtime sync. The server pushes only event types and IDs to this member's private room;
 * we invalidate the affected queries and refetch through the authorized REST API. Durable
 * state lives in Postgres, so a reconnect simply resynchronizes everything.
 */
export function useRealtime(enabled: boolean, orgId?: string) {
  const invalidate = useInvalidate();
  const setRealtime = useUi((s) => s.setRealtime);

  useEffect(() => {
    if (!enabled || !orgId) return;
    const socket = io(API_URL, { withCredentials: true, transports: ["websocket", "polling"], reconnectionDelayMax: 10_000 });
    let firstConnect = true;
    socket.on("ready", () => {
      setRealtime("live");
      if (!firstConnect) void invalidate(); // resync after reconnect
      firstConnect = false;
    });
    socket.on("disconnect", () => setRealtime("offline"));
    socket.on("connect_error", () => setRealtime("offline"));
    socket.on("event", (e: { type: string; notifications?: boolean }) => {
      const prefixes = new Set<string>();
      for (const [re, paths] of INVALIDATIONS) if (re.test(e.type)) paths.forEach((p) => prefixes.add(p));
      if (e.notifications) prefixes.add("/notifications");
      if (prefixes.size) void invalidate(...prefixes);
    });
    return () => {
      socket.disconnect();
    };
  }, [enabled, orgId, invalidate, setRealtime]);
}
