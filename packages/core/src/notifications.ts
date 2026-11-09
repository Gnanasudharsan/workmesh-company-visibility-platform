/**
 * Notification deduplication helpers.
 *
 * Every notification has a deterministic dedupe key. The database holds a unique index on
 * (recipientId, dedupeKey), so retries of the same background job — or the same event being
 * delivered twice — can never create a duplicate row (insert … on conflict do nothing).
 *
 * Bucketing collapses bursts: e.g. five edits of the same blocker within an hour produce one
 * "blocker changed" notification per recipient instead of a notification storm.
 */

export type NotificationType =
  | "BLOCKER_ASSIGNED"
  | "BLOCKER_CHANGED"
  | "HELP_REQUESTED"
  | "UPDATE_PUBLISHED"
  | "UPDATE_ACKNOWLEDGED"
  | "COMMENT_ADDED"
  | "PROJECT_INVITED"
  | "MILESTONE_CHANGED"
  | "DECISION_ASSIGNED"
  | "ACTION_ITEM_ASSIGNED"
  | "DEADLINE_APPROACHING"
  | "MEETING_BRIEF_READY"
  | "UPDATE_REQUESTED"
  | "DEPENDENCY_CHANGED";

export const NOTIFICATION_TYPES: NotificationType[] = [
  "BLOCKER_ASSIGNED",
  "BLOCKER_CHANGED",
  "HELP_REQUESTED",
  "UPDATE_PUBLISHED",
  "UPDATE_ACKNOWLEDGED",
  "COMMENT_ADDED",
  "PROJECT_INVITED",
  "MILESTONE_CHANGED",
  "DECISION_ASSIGNED",
  "ACTION_ITEM_ASSIGNED",
  "DEADLINE_APPROACHING",
  "MEETING_BRIEF_READY",
  "UPDATE_REQUESTED",
  "DEPENDENCY_CHANGED",
];

/** Notification types that are bucketed (collapsed) per entity per time window. */
const BUCKET_MINUTES: Partial<Record<NotificationType, number>> = {
  BLOCKER_CHANGED: 60,
  MILESTONE_CHANGED: 60,
  UPDATE_PUBLISHED: 30,
  DEPENDENCY_CHANGED: 60,
  DEADLINE_APPROACHING: 24 * 60,
};

export function dedupeKey(args: {
  type: NotificationType;
  entityId: string;
  /** Stable id of the triggering event (outbox id) for non-bucketed types. */
  eventId: string;
  at: Date;
}): string {
  const bucket = BUCKET_MINUTES[args.type];
  if (bucket) {
    const window = Math.floor(args.at.getTime() / (bucket * 60_000));
    return `${args.type}:${args.entityId}:w${window}`;
  }
  return `${args.type}:${args.entityId}:${args.eventId}`;
}
