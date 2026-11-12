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
import { BlockersService } from "./updates/blockers.service";
import { UpdatesController } from "./updates/updates.controller";
import { UpdatesService } from "./updates/updates.service";
import { DependenciesService } from "./graph/dependencies.service";
import { GraphController } from "./graph/graph.controller";
import { GraphService } from "./graph/graph.service";
import { MeetingsController } from "./meetings/meetings.controller";
import { MeetingsService } from "./meetings/meetings.service";
import { DeliveryService } from "./notifications/delivery.service";
import { NotificationsController } from "./notifications/notifications.controller";
import { RealtimeGateway } from "./notifications/realtime.gateway";
import { RealtimePublisher } from "./notifications/realtime.publisher";
import { WorkerService } from "./notifications/worker.service";
import { AdminService } from "./dashboard/admin.service";
import { DashboardController } from "./dashboard/dashboard.controller";
import { DashboardService } from "./dashboard/dashboard.service";
import { DirectoryService } from "./dashboard/directory.service";
import { SearchService } from "./search/search.service";
import { CopilotController } from "./copilot/copilot.controller";
import { CopilotReadFacade } from "./copilot/facade";
import { CopilotToolRunner } from "./copilot/tool-runner";

export const FEATURE_CONTROLLERS: Type<unknown>[] = [WorkController, UpdatesController, GraphController, MeetingsController, NotificationsController, DashboardController, CopilotController];
export const FEATURE_PROVIDERS: Provider[] = [ChangesService, ProjectMetricsService, ProjectsService, ItemsService, GoalsService, UpdatesService, BlockersService, DependenciesService, GraphService, MeetingsService, RealtimePublisher, DeliveryService, WorkerService, RealtimeGateway, SearchService, DirectoryService, DashboardService, AdminService, CopilotReadFacade, CopilotToolRunner];
