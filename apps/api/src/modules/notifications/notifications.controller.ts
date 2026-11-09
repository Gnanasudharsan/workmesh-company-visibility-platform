import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { NOTIFICATION_TYPES, type NotificationType } from "@workmesh/core";
import { z } from "zod";
import { Db } from "../../common/db.service";
import { Auth } from "../../common/decorators";
import { notFound } from "../../common/errors";
import { requireOrg, type RequestAuth } from "../../common/request-auth";
import { V } from "../../common/zod.pipe";

const uuid = new ParseUUIDPipe({ version: "4" });

/** Notifications belong to exactly one recipient; every query is scoped to the caller. */
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly db: Db) {}

  @Get()
  async list(@Auth() auth: RequestAuth, @Query("unread") unread?: string, @Query("cursor") cursor?: string) {
    const { membershipId } = requireOrg(auth);
    const where = {
      recipientId: membershipId,
      ...(unread === "true" ? { readAt: null } : {}),
      ...(cursor && !Number.isNaN(Date.parse(cursor)) ? { createdAt: { lt: new Date(cursor) } } : {}),
    };
    const [items, unreadCount] = await Promise.all([
      this.db.tx.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      this.db.tx.notification.count({ where: { recipientId: membershipId, readAt: null } }),
    ]);
    return { items, unreadCount, nextCursor: items.length === 50 ? items[49]!.createdAt.toISOString() : null };
  }

  @Post(":id/read")
  @HttpCode(200)
  async read(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    const r = await this.db.tx.notification.updateMany({ where: { id, recipientId: requireOrg(auth).membershipId }, data: { readAt: new Date() } });
    if (r.count === 0) throw notFound("Notification");
    return { ok: true };
  }

  @Post("read-all")
  @HttpCode(200)
  async readAll(@Auth() auth: RequestAuth) {
    const r = await this.db.tx.notification.updateMany({ where: { recipientId: requireOrg(auth).membershipId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true, count: r.count };
  }

  @Get("preferences")
  async prefs(@Auth() auth: RequestAuth) {
    const rows = await this.db.tx.notificationPreference.findMany({ where: { membershipId: requireOrg(auth).membershipId } });
    return NOTIFICATION_TYPES.map((type) => ({ type, inApp: rows.find((r) => r.type === type)?.inApp ?? true }));
  }

  @Put("preferences")
  async setPrefs(@Auth() auth: RequestAuth, @Body(V(z.object({ preferences: z.array(z.object({ type: z.enum(NOTIFICATION_TYPES as [NotificationType, ...NotificationType[]]), inApp: z.boolean() })).max(50) }))) body: { preferences: Array<{ type: NotificationType; inApp: boolean }> }) {
    const { membershipId } = requireOrg(auth);
    for (const p of body.preferences) {
      await this.db.tx.notificationPreference.upsert({
        where: { membershipId_type: { membershipId, type: p.type } },
        update: { inApp: p.inApp },
        create: { organizationId: this.db.orgId, membershipId, type: p.type, inApp: p.inApp },
      });
    }
    return this.prefs(auth);
  }
}
