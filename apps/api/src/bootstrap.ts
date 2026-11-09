import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { config } from "./config";

/** Shared HTTP configuration for the server and integration tests. */
export function configureApp(app: INestApplication, opts: { logger?: boolean } = {}) {
  const cfg = config();
  if (opts.logger !== false) app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cookieParser());
  app.enableCors({
    origin: [cfg.WEB_ORIGIN],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
  });
  // Authenticated responses must never be stored by shared caches.
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.set("trust proxy", 1);
  httpAdapter.disable("x-powered-by");

  if (cfg.NODE_ENV !== "production") {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("WorkMesh API")
        .setDescription("Organization-scoped REST API. Authenticate with the session cookie; send X-CSRF-Token on writes.")
        .setVersion("0.1.0")
        .addCookieAuth("wm_session")
        .build(),
    );
    SwaggerModule.setup("api/docs", app, doc);
  }
  return app;
}
