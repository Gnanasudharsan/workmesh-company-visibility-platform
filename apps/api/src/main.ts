import "./env";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";
import { config } from "./config";

async function main() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config().API_PORT);
}

void main();
