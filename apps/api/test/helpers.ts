import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { seedAll } from "../prisma/seed";

export type Seed = Awaited<ReturnType<typeof seedAll>>;

export const EMAIL = {
  maya: "maya.chen@northstar.example",
  daniel: "daniel.okafor@northstar.example",
  priya: "priya.nair@northstar.example",
  elena: "elena.vasquez@northstar.example",
  marcus: "marcus.reed@northstar.example",
  aisha: "aisha.rahman@northstar.example",
  sam: "sam.patel@northstar.example",
  hannah: "hannah.lee@northstar.example",
  leo: "leo.martins@northstar.example",
  lars: "lars.nilsen@northstar.example",
  fatima: "fatima.zahra@northstar.example",
  zoe: "zoe.adams@northstar.example",
  rachel: "rachel.green@northstar.example",
  owen: "owen.hughes@northstar.example",
  noah: "noah.berg@meridian.example",
  ivy: "ivy.larsen@meridian.example",
} as const;

export async function bootstrap(): Promise<{ app: INestApplication; seed: Seed; prisma: PrismaClient }> {
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const seed = await seedAll(prisma, process.env.DEMO_PASSWORD!);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, { logger: false });
  await app.init();
  return { app, seed, prisma };
}

export interface Client {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  cookie: string;
  get: (url: string) => request.Test;
  post: (url: string, body?: object) => request.Test;
  patch: (url: string, body?: object) => request.Test;
  put: (url: string, body?: object) => request.Test;
  del: (url: string) => request.Test;
}

export async function login(app: INestApplication, email: string): Promise<Client> {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post("/api/auth/login").send({ email, password: process.env.DEMO_PASSWORD }).expect(200);
  const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  const csrf = /wm_csrf=([^;]+)/.exec(cookies.join(";"))?.[1] ?? "";
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  const withCsrf = (t: request.Test) => t.set("X-CSRF-Token", csrf).set("Origin", process.env.WEB_ORIGIN ?? "http://localhost:3002");
  return {
    agent,
    csrf,
    cookie,
    get: (url) => agent.get(url),
    post: (url, body) => withCsrf(agent.post(url)).send(body ?? {}),
    patch: (url, body) => withCsrf(agent.patch(url)).send(body ?? {}),
    put: (url, body) => withCsrf(agent.put(url)).send(body ?? {}),
    del: (url) => withCsrf(agent.delete(url)),
  };
}

export const memberId = async (c: Client) => (await c.get("/api/auth/me").expect(200)).body.active.membershipId as string;

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 150));
  }
}
