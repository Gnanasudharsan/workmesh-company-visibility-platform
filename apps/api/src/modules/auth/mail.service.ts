import { Injectable, Logger } from "@nestjs/common";
import { Db } from "../../common/db.service";

/**
 * Local mail transport. Messages are stored in the `mail_messages` table and shown in the
 * in-app developer mailbox (/dev/mailbox) when DEMO_MODE=true. A production deployment would
 * swap this for an SMTP/API transport; no paid provider is required for development.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly db: Db) {}

  async send(to: string, subject: string, text: string, link?: string) {
    await this.db.system.mailMessage.create({ data: { to: to.toLowerCase(), subject, text, link } });
    // Never log message bodies or links: links contain single-use tokens.
    this.logger.log(`mail queued: "${subject}"`);
  }
}
