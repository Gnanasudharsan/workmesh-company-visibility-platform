/**
 * Feature registry. Each feature folder contributes controllers and providers here so that
 * AppModule stays small and the dependency graph between features stays explicit.
 */
import type { Provider, Type } from "@nestjs/common";

export const FEATURE_CONTROLLERS: Type<unknown>[] = [];
export const FEATURE_PROVIDERS: Provider[] = [];
