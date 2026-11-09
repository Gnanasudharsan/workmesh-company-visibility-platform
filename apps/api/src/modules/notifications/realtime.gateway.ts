import { Logger, OnModuleDestroy } from "@nestjs/common";
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { parse as parseCookie } from "cookie";
import type { Server, Socket } from "socket.io";
import { Db } from "../../common/db.service";
import { MetricsService } from "../../common/metrics.service";
import { redisConnection } from "../../common/queue.service";
import { config } from "../../config";
import { SESSION_COOKIE, SessionsService } from "../auth/sessions.service";
import { realtimeChannel, type RealtimeEnvelope } from "./realtime.publisher";

interface SocketData {
  orgId: string;
  membershipId: string;
}

/**
 * Authenticated Socket.IO gateway.
 *  - The handshake must carry a valid session cookie; the org and member come from the
 *    server-side session, never from the client.
 *  - Each socket joins exactly one private room: `m:<membershipId>`. There are no org-wide
 *    rooms and clients cannot choose rooms, so events can't cross tenants or reach
 *    unauthorized members.
 *  - `subscribe` requests for any other organization are rejected.
 */
@WebSocketGateway({ cors: { origin: [config().WEB_ORIGIN], credentials: true }, path: "/socket.io" })
export class RealtimeGateway implements OnGatewayConnection, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly sub = redisConnection();
  @WebSocketServer() server!: Server;

  constructor(
    private readonly sessions: SessionsService,
    private readonly db: Db,
    private readonly metrics: MetricsService,
  ) {
    this.sub.on("error", (e) => this.logger.warn(`redis: ${e.message}`));
    void this.sub.subscribe(realtimeChannel()).catch((e: Error) => this.logger.warn(`subscribe failed: ${e.message}`));
    this.sub.on("message", (_channel, raw) => this.dispatch(raw));
  }

  private dispatch(raw: string) {
    let env: RealtimeEnvelope;
    try {
      env = JSON.parse(raw) as RealtimeEnvelope;
    } catch {
      return;
    }
    for (const id of env.recipients) {
      // Room membership already proves org + member; double-check the org on each socket.
      for (const socket of this.server?.sockets.adapter.rooms.get(`m:${id}`) ?? []) {
        const s = this.server.sockets.sockets.get(socket);
        if (s && (s.data as SocketData).orgId === env.orgId) {
          s.emit("event", env.event);
          this.metrics.realtimeMessages.inc();
        }
      }
    }
  }

  async handleConnection(client: Socket) {
    try {
      const cookies = parseCookie(client.handshake.headers.cookie ?? "");
      const token = cookies[SESSION_COOKIE];
      const session = token ? await this.sessions.validate(token) : null;
      if (!session?.activeOrganizationId) throw new Error("unauthenticated");
      const membership = await this.db.system.membership.findFirst({
        where: { organizationId: session.activeOrganizationId, userId: session.userId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!membership) throw new Error("no membership");
      const data: SocketData = { orgId: session.activeOrganizationId, membershipId: membership.id };
      client.data = data;
      await client.join(`m:${membership.id}`);
      client.emit("ready", { orgId: data.orgId });
    } catch {
      client.emit("error", { code: "UNAUTHENTICATED" });
      client.disconnect(true);
    }
  }

  /** Explicit org subscription requests are only acknowledged for the session's own org. */
  @SubscribeMessage("subscribe")
  subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { orgId?: string }) {
    const data = client.data as SocketData | undefined;
    if (!data || body?.orgId !== data.orgId) return { ok: false, error: "FORBIDDEN" };
    return { ok: true };
  }

  onModuleDestroy() {
    this.sub.disconnect();
  }
}
