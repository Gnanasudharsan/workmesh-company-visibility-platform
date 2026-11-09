/**
 * Feature registry. Each feature folder contributes controllers and providers here so that
 * AppModule stays small and the dependency graph between features stays explicit.
 */
import type { Provider, Type } from "@nestjs/common";
import { ChangesService } from "./work/changes.service";
import { GoalsService } from "./work/goals.service";
import { ItemsService } from "./work/items.service";
import { ProjectMetricsService } from "./work/metrics.service";
import { ProjectsService } from "./work/projects.service";
import { WorkController } from "./work/work.controller";

export const FEATURE_CONTROLLERS: Type<unknown>[] = [WorkController];
export const FEATURE_PROVIDERS: Provider[] = [ChangesService, ProjectMetricsService, ProjectsService, ItemsService, GoalsService];
