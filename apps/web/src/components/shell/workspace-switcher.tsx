"use client";

import type { Workspace } from "@workmesh/core";
import { Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useInvalidate, useMe, api } from "@/lib/hooks";
import { useUi, WORKSPACE_HOME, WORKSPACE_LABEL } from "@/lib/store";
import { toast } from "@/lib/toast";
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from "../ui/overlay";

/**
 * Lists only the workspaces and organizations the server authorizes for this user.
 * Switching a workspace changes the default home view; it grants nothing.
 */
export function WorkspaceSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { data: me } = useMe();
  const router = useRouter();
  const invalidate = useInvalidate();
  const { workspace, setWorkspace } = useUi();
  const active = me?.active;
  const workspaces = active?.workspaces ?? ["employee"];
  const current: Workspace = workspaces.includes(workspace) ? workspace : "employee";

  const go = (w: Workspace) => {
    setWorkspace(w);
    onNavigate?.();
    router.push(WORKSPACE_HOME[w]);
  };

  const switchOrg = async (id: string) => {
    try {
      await api.post("/auth/switch-organization", { organizationId: id });
      await invalidate();
      router.push("/home");
      onNavigate?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <DropdownMenu>
      <DropdownTrigger className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-left shadow-card hover:border-line-strong" aria-label="Switch workspace">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink text-[11px] font-semibold text-white">{active?.organization.name.slice(0, 2).toUpperCase() ?? "WM"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight">{active?.organization.name ?? "WorkMesh"}</span>
          <span className="block truncate text-[11.5px] text-muted">{WORKSPACE_LABEL[current]}</span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-faint" aria-hidden />
      </DropdownTrigger>
      <DropdownContent align="start" className="w-[232px]">
        <DropdownLabel>Workspaces</DropdownLabel>
        {workspaces.map((w) => (
          <DropdownItem key={w} onSelect={() => go(w)} icon={current === w ? <Check className="h-3.5 w-3.5 text-brand" /> : <span className="inline-block w-3.5" />}>
            {WORKSPACE_LABEL[w]}
          </DropdownItem>
        ))}
        {me && me.organizations.length > 1 && (
          <>
            <DropdownSeparator />
            <DropdownLabel>Organizations</DropdownLabel>
            {me.organizations.map((o) => (
              <DropdownItem key={o.id} onSelect={() => o.id !== active?.organization.id && switchOrg(o.id)} icon={o.id === active?.organization.id ? <Check className="h-3.5 w-3.5 text-brand" /> : <span className="inline-block w-3.5" />}>
                {o.name}
              </DropdownItem>
            ))}
          </>
        )}
      </DropdownContent>
    </DropdownMenu>
  );
}
