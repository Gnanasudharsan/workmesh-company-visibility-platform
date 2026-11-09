import type { AccessLevel, GoalResource, ProjectResource } from "@workmesh/core";

/**
 * Pre-computed visibility for one viewer, derived from the AuthContext and the org's
 * resources. Lets list endpoints filter in SQL (`id IN (...)`) without per-row queries.
 */
export interface ViewerScope {
  authzVersion: number;
  builtAt: number;
  validUntil: number;
  /** projectId → level, only for projects the viewer may know exist. */
  projectAccess: Map<string, Exclude<AccessLevel, "none">>;
  /** Resource descriptors for visible projects (for edit/manage checks). */
  projects: Map<string, ProjectResource>;
  goals: Map<string, GoalResource>;
  initiatives: Map<string, GoalResource>;
}

export function detailIds(scope: ViewerScope): string[] {
  return [...scope.projectAccess].filter(([, l]) => l === "details").map(([id]) => id);
}

export function visibleIds(scope: ViewerScope): string[] {
  return [...scope.projectAccess.keys()];
}

export function levelOf(scope: ViewerScope, projectId: string | null | undefined): AccessLevel | null {
  if (!projectId) return null;
  return scope.projectAccess.get(projectId) ?? "none";
}
