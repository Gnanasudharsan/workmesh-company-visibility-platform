import type { CopilotTool } from "./common";
import { goalsAtRisk, personWork } from "./people-goals";
import { getProject, projectBlockers, projectChanges, projectDependencies } from "./projects";
import { findHelpers, searchRecords } from "./search";

/** Every copilot tool. All are read-only: they only ever see the request's ReadApi. */
export const TOOLS = [searchRecords, getProject, projectBlockers, projectDependencies, projectChanges, personWork, findHelpers, goalsAtRisk] as unknown as ReadonlyArray<CopilotTool>;

export const TOOL_NAMES = TOOLS.map((t) => t.name);

export function findTool(name: string): CopilotTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

export { NOT_FOUND, RECORD_TYPES, type CopilotTool, type RecordRef, type RecordType } from "./common";
