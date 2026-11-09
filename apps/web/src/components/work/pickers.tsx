"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { useApi } from "@/lib/hooks";
import type { ProjectSummary } from "@/lib/types";
import { Select } from "../ui/form";

type Props = SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string };

export interface DirectoryPerson {
  id: string;
  name: string;
  title: string;
  avatarHue: number;
  managerId: string | null;
  primaryTeamId: string | null;
  departmentId: string | null;
  role: string;
}

export function usePeople() {
  return useApi<DirectoryPerson[]>("/people", { staleTime: 60_000 });
}

/** Only projects whose details the viewer can see are offered for linking. */
export const ProjectSelect = forwardRef<HTMLSelectElement, Props & { editableOnly?: boolean }>(({ placeholder = "No project", editableOnly, ...props }, ref) => {
  const { data } = useApi<ProjectSummary[]>("/projects");
  const options = (data ?? []).filter((p) => p.access === "details" && (!editableOnly || p.canEdit));
  return (
    <Select ref={ref} {...props}>
      <option value="">{placeholder}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({p.key})
        </option>
      ))}
    </Select>
  );
});
ProjectSelect.displayName = "ProjectSelect";

export const PersonSelect = forwardRef<HTMLSelectElement, Props & { exclude?: string[] }>(({ placeholder = "Unassigned", exclude = [], ...props }, ref) => {
  const { data } = usePeople();
  return (
    <Select ref={ref} {...props}>
      <option value="">{placeholder}</option>
      {(data ?? [])
        .filter((p) => !exclude.includes(p.id))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {p.title}
          </option>
        ))}
    </Select>
  );
});
PersonSelect.displayName = "PersonSelect";

export const TeamSelect = forwardRef<HTMLSelectElement, Props>(({ placeholder = "No team", ...props }, ref) => {
  const { data } = useApi<Array<{ id: string; name: string; department: { name: string } | null }>>("/teams", { staleTime: 60_000 });
  return (
    <Select ref={ref} {...props}>
      <option value="">{placeholder}</option>
      {(data ?? []).map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
          {t.department ? ` · ${t.department.name}` : ""}
        </option>
      ))}
    </Select>
  );
});
TeamSelect.displayName = "TeamSelect";

export const MilestoneSelect = forwardRef<HTMLSelectElement, Props & { projectId?: string }>(({ projectId, placeholder = "No milestone", ...props }, ref) => {
  const { data } = useApi<{ milestoneList: Array<{ id: string; title: string }>; access: string }>(projectId ? `/projects/${projectId}` : null);
  return (
    <Select ref={ref} disabled={!projectId} {...props}>
      <option value="">{placeholder}</option>
      {(data?.milestoneList ?? []).map((m) => (
        <option key={m.id} value={m.id}>
          {m.title}
        </option>
      ))}
    </Select>
  );
});
MilestoneSelect.displayName = "MilestoneSelect";

/** Converts empty strings from <select>/<input> into null for the API. */
export const nn = (v: string | undefined | null) => (v ? v : null);
export const isoDate = (v: string | undefined | null) => (v ? new Date(`${v}T12:00:00`).toISOString() : null);
