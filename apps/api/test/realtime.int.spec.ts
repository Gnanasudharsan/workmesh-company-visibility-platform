import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { AddressInfo } from "node:net";
import { io, type Socket } from "socket.io-client";
import { bootstrap, EMAIL, login, type Client, type Seed } from "./helpers";

describe("realtime authorization", () => {
  let app: INestApplication;
  let seed: Seed;
  let prisma: PrismaClient;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ({ app, seed, prisma } = await bootstrap());
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await app.close();
    await prisma.$disconnect();
  });

  const connect = (client?: Client) =>
    new Promise<{ socket: Socket; ready: boolean; events: Array<{ type: string }> }>((resolve) => {
      const socket = io(url, { transports: ["websocket"], extraHeaders: client ? { cookie: client.cookie } : {}, reconnection: false });
      sockets.push(socket);
      const events: Array<{ type: string }> = [];
      socket.on("event", (e) => events.push(e));
      socket.on("ready", () => resolve({ socket, ready: true, events }));
      socket.on("disconnect", () => resolve({ socket, ready: false, events }));
      socket.on("connect_error", () => resolve({ socket, ready: false, events }));
    });

  it("rejects unauthenticated sockets", async () => {
    const { ready } = await connect();
    expect(ready).toBe(false);
  });

  it("rejects subscriptions to another tenant", async () => {
    const meridian = await connect(await login(app, EMAIL.noah));
    expect(meridian.ready).toBe(true);
    const ack = await meridian.socket.emitWithAck("subscribe", { orgId: seed.northstar.orgId });
    expect(ack).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await meridian.socket.emitWithAck("subscribe", { orgId: seed.meridian.orgId })).toEqual({ ok: true });
  });

  it("delivers events only to authorized members of the same tenant", async () => {
    const maya = await login(app, EMAIL.maya);
    const daniel = await connect(await login(app, EMAIL.daniel));
    const outsider = await connect(await login(app, EMAIL.rachel)); // not in Maya's reporting line or project
    const foreign = await connect(await login(app, EMAIL.noah));

    await maya.post("/api/updates", { projectId: seed.work.projects.PGW, currentFocus: "Realtime check", visibility: "MANAGER", publish: true }).expect(201);
    const deadline = Date.now() + 8000;
    while (!daniel.events.some((e) => e.type === "update.published") && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));

    expect(daniel.events.some((e) => e.type === "update.published")).toBe(true);
    expect(outsider.events.some((e) => e.type === "update.published")).toBe(false);
    expect(foreign.events).toHaveLength(0);
    // Payloads carry only types and IDs, never content.
    expect(JSON.stringify(daniel.events)).not.toContain("Realtime check");
  });
});
