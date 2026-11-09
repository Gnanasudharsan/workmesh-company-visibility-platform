-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'EXECUTIVE', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('MEMBER', 'LEAD');

-- CreateEnum
CREATE TYPE "ReportingType" AS ENUM ('PRIMARY', 'DOTTED');

-- CreateEnum
CREATE TYPE "ResourceVisibility" AS ENUM ('ORG', 'TEAM', 'PROJECT_MEMBERS', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "UpdateVisibility" AS ENUM ('PRIVATE', 'MANAGER', 'PROJECT', 'TEAM', 'ORG');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ACHIEVED', 'MISSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PROPOSED', 'PLANNED', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('LEAD', 'CONTRIBUTOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "GrantLevel" AS ENUM ('SUMMARY', 'DETAILS');

-- CreateEnum
CREATE TYPE "GrantResource" AS ENUM ('PROJECT', 'GOAL', 'INITIATIVE');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkItemStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UpdateStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "UpdateStage" AS ENUM ('PLANNING', 'DEVELOPMENT', 'TESTING', 'REVIEW', 'BLOCKED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BlockerState" AS ENUM ('OPEN', 'ASSIGNED', 'INVESTIGATING', 'WAITING', 'RESOLVED', 'REOPENED');

-- CreateEnum
CREATE TYPE "DependencyState" AS ENUM ('OPEN', 'AT_RISK', 'BLOCKED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MeetingVisibility" AS ENUM ('PARTICIPANTS', 'TEAM', 'ORG');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('NONE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PENDING', 'DECIDED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChangeEntity" AS ENUM ('PROJECT', 'MILESTONE', 'WORK_ITEM');

-- CreateEnum
CREATE TYPE "CommentEntity" AS ENUM ('UPDATE', 'BLOCKER', 'PROJECT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "activeOrganizationId" UUID,
    "csrfToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_messages" (
    "id" UUID NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "authzVersion" INTEGER NOT NULL DEFAULT 1,
    "staleAfterDays" INTEGER NOT NULL DEFAULT 7,
    "escalateBlockersAfterHours" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),
    "onboardedAt" TIMESTAMP(3),

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_profiles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "workEmail" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "positionId" UUID,
    "bio" TEXT,
    "location" TEXT,
    "timezone" TEXT,
    "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contact" TEXT,
    "avatarHue" INTEGER NOT NULL DEFAULT 210,

    CONSTRAINT "employee_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "title" TEXT,
    "teamId" UUID,
    "managerId" UUID,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "headId" UUID,
    "color" TEXT NOT NULL DEFAULT '#2563EB',

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "departmentId" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "mission" TEXT,
    "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contact" TEXT,
    "docsUrl" TEXT,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_memberships" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting_lines" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "managerId" UUID NOT NULL,
    "type" "ReportingType" NOT NULL DEFAULT 'PRIMARY',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdById" UUID,

    CONSTRAINT "reporting_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "delegatorId" UUID NOT NULL,
    "delegateId" UUID NOT NULL,
    "reason" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_goals" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" UUID,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "period" TEXT,
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "visibility" "ResourceVisibility" NOT NULL DEFAULT 'ORG',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "initiatives" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "goalId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" UUID,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "visibility" "ResourceVisibility" NOT NULL DEFAULT 'ORG',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "initiatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "initiativeId" UUID,
    "owningTeamId" UUID,
    "leadId" UUID,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PROPOSED',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "visibility" "ResourceVisibility" NOT NULL DEFAULT 'ORG',
    "discoverable" BOOLEAN NOT NULL DEFAULT true,
    "reportedProgress" INTEGER,
    "reportedAt" TIMESTAMP(3),
    "reportedById" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'CONTRIBUTOR',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_grants" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "resourceType" "GrantResource" NOT NULL,
    "resourceId" UUID NOT NULL,
    "granteeId" UUID NOT NULL,
    "level" "GrantLevel" NOT NULL DEFAULT 'SUMMARY',
    "reason" TEXT,
    "grantedById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" UUID,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "milestoneId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkItemStatus" NOT NULL DEFAULT 'TODO',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "assigneeId" UUID,
    "reviewerId" UUID,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "entityType" "ChangeEntity" NOT NULL,
    "entityId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_updates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "projectId" UUID,
    "milestoneId" UUID,
    "workItemId" UUID,
    "status" "UpdateStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "UpdateVisibility" NOT NULL DEFAULT 'MANAGER',
    "stage" "UpdateStage" NOT NULL DEFAULT 'DEVELOPMENT',
    "currentFocus" TEXT NOT NULL,
    "completed" TEXT,
    "nextSteps" TEXT,
    "helpNeeded" TEXT,
    "helpFromId" UUID,
    "confidence" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "update_revisions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "updateId" UUID NOT NULL,
    "editorId" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "update_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "update_acknowledgements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "updateId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "update_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "entityType" "CommentEntity" NOT NULL,
    "entityId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "projectId" UUID,
    "milestoneId" UUID,
    "workItemId" UUID,
    "updateId" UUID,
    "reporterId" UUID NOT NULL,
    "ownerId" UUID,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "state" "BlockerState" NOT NULL DEFAULT 'OPEN',
    "visibility" "UpdateVisibility" NOT NULL DEFAULT 'PROJECT',
    "targetDate" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blockers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocker_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "blockerId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "fromState" "BlockerState",
    "toState" "BlockerState",
    "fromOwnerId" UUID,
    "toOwnerId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocker_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependencies" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "upstreamProjectId" UUID NOT NULL,
    "downstreamProjectId" UUID NOT NULL,
    "upstreamMilestoneId" UUID,
    "downstreamMilestoneId" UUID,
    "description" TEXT NOT NULL,
    "ownerId" UUID,
    "state" "DependencyState" NOT NULL DEFAULT 'OPEN',
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "needBy" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "organizerId" UUID NOT NULL,
    "teamId" UUID,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "recurrence" "Recurrence" NOT NULL DEFAULT 'NONE',
    "seriesId" UUID,
    "visibility" "MeetingVisibility" NOT NULL DEFAULT 'PARTICIPANTS',
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "compareFrom" TIMESTAMP(3),
    "notes" TEXT,
    "briefGeneratedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_projects" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "projectId" UUID NOT NULL,

    CONSTRAINT "meeting_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "sourceType" TEXT,
    "sourceId" UUID,
    "discussed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "meetingId" UUID,
    "projectId" UUID,
    "title" TEXT NOT NULL,
    "rationale" TEXT,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PENDING',
    "ownerId" UUID,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "meetingId" UUID,
    "decisionId" UUID,
    "projectId" UUID,
    "blockerId" UUID,
    "title" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "ActionStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" UUID NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "entityType" TEXT,
    "entityId" UUID,
    "actorId" UUID,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlationId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "mail_messages_to_createdAt_idx" ON "mail_messages"("to", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "memberships_organizationId_status_idx" ON "memberships"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organizationId_userId_key" ON "memberships"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "positions_organizationId_title_key" ON "positions"("organizationId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "employee_profiles_membershipId_key" ON "employee_profiles"("membershipId");

-- CreateIndex
CREATE INDEX "employee_profiles_organizationId_idx" ON "employee_profiles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "invitations_organizationId_status_idx" ON "invitations"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organizationId_slug_key" ON "departments"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "teams_organizationId_departmentId_idx" ON "teams"("organizationId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_organizationId_slug_key" ON "teams"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "team_memberships_organizationId_membershipId_idx" ON "team_memberships"("organizationId", "membershipId");

-- CreateIndex
CREATE INDEX "team_memberships_teamId_idx" ON "team_memberships"("teamId");

-- CreateIndex
CREATE INDEX "reporting_lines_organizationId_endedAt_idx" ON "reporting_lines"("organizationId", "endedAt");

-- CreateIndex
CREATE INDEX "reporting_lines_managerId_idx" ON "reporting_lines"("managerId");

-- CreateIndex
CREATE INDEX "reporting_lines_reportId_idx" ON "reporting_lines"("reportId");

-- CreateIndex
CREATE INDEX "delegations_organizationId_delegateId_idx" ON "delegations"("organizationId", "delegateId");

-- CreateIndex
CREATE INDEX "company_goals_organizationId_idx" ON "company_goals"("organizationId");

-- CreateIndex
CREATE INDEX "initiatives_organizationId_goalId_idx" ON "initiatives"("organizationId", "goalId");

-- CreateIndex
CREATE INDEX "projects_organizationId_status_idx" ON "projects"("organizationId", "status");

-- CreateIndex
CREATE INDEX "projects_organizationId_owningTeamId_idx" ON "projects"("organizationId", "owningTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organizationId_key_key" ON "projects"("organizationId", "key");

-- CreateIndex
CREATE INDEX "project_members_organizationId_membershipId_idx" ON "project_members"("organizationId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_membershipId_key" ON "project_members"("projectId", "membershipId");

-- CreateIndex
CREATE INDEX "access_grants_organizationId_granteeId_idx" ON "access_grants"("organizationId", "granteeId");

-- CreateIndex
CREATE INDEX "access_grants_resourceType_resourceId_idx" ON "access_grants"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "milestones_organizationId_projectId_idx" ON "milestones"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "milestones_organizationId_dueDate_idx" ON "milestones"("organizationId", "dueDate");

-- CreateIndex
CREATE INDEX "work_items_organizationId_projectId_status_idx" ON "work_items"("organizationId", "projectId", "status");

-- CreateIndex
CREATE INDEX "work_items_organizationId_assigneeId_idx" ON "work_items"("organizationId", "assigneeId");

-- CreateIndex
CREATE INDEX "change_events_organizationId_projectId_createdAt_idx" ON "change_events"("organizationId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "change_events_entityType_entityId_idx" ON "change_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "progress_updates_organizationId_authorId_publishedAt_idx" ON "progress_updates"("organizationId", "authorId", "publishedAt");

-- CreateIndex
CREATE INDEX "progress_updates_organizationId_projectId_publishedAt_idx" ON "progress_updates"("organizationId", "projectId", "publishedAt");

-- CreateIndex
CREATE INDEX "progress_updates_organizationId_status_publishedAt_idx" ON "progress_updates"("organizationId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "update_revisions_updateId_idx" ON "update_revisions"("updateId");

-- CreateIndex
CREATE UNIQUE INDEX "update_acknowledgements_updateId_membershipId_key" ON "update_acknowledgements"("updateId", "membershipId");

-- CreateIndex
CREATE INDEX "comments_organizationId_entityType_entityId_idx" ON "comments"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "blockers_organizationId_state_idx" ON "blockers"("organizationId", "state");

-- CreateIndex
CREATE INDEX "blockers_organizationId_projectId_idx" ON "blockers"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "blockers_organizationId_ownerId_idx" ON "blockers"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "blockers_organizationId_reporterId_idx" ON "blockers"("organizationId", "reporterId");

-- CreateIndex
CREATE INDEX "blocker_events_blockerId_createdAt_idx" ON "blocker_events"("blockerId", "createdAt");

-- CreateIndex
CREATE INDEX "dependencies_organizationId_idx" ON "dependencies"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "dependencies_upstreamProjectId_downstreamProjectId_key" ON "dependencies"("upstreamProjectId", "downstreamProjectId");

-- CreateIndex
CREATE INDEX "meetings_organizationId_scheduledAt_idx" ON "meetings"("organizationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "meetings_seriesId_idx" ON "meetings"("seriesId");

-- CreateIndex
CREATE INDEX "meeting_participants_organizationId_membershipId_idx" ON "meeting_participants"("organizationId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meetingId_membershipId_key" ON "meeting_participants"("meetingId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_projects_meetingId_projectId_key" ON "meeting_projects"("meetingId", "projectId");

-- CreateIndex
CREATE INDEX "agenda_items_meetingId_idx" ON "agenda_items"("meetingId");

-- CreateIndex
CREATE INDEX "decisions_organizationId_status_idx" ON "decisions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "decisions_organizationId_projectId_idx" ON "decisions"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "action_items_organizationId_ownerId_status_idx" ON "action_items"("organizationId", "ownerId", "status");

-- CreateIndex
CREATE INDEX "action_items_meetingId_idx" ON "action_items"("meetingId");

-- CreateIndex
CREATE INDEX "notifications_organizationId_recipientId_readAt_createdAt_idx" ON "notifications"("organizationId", "recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_recipientId_dedupeKey_key" ON "notifications"("recipientId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_membershipId_type_key" ON "notification_preferences"("membershipId", "type");

-- CreateIndex
CREATE INDEX "outbox_events_processedAt_createdAt_idx" ON "outbox_events"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_organizationId_createdAt_idx" ON "audit_events"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_organizationId_resourceType_resourceId_idx" ON "audit_events"("organizationId", "resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_headId_fkey" FOREIGN KEY ("headId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "company_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "initiatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owningTeamId_fkey" FOREIGN KEY ("owningTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_revisions" ADD CONSTRAINT "update_revisions_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "progress_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_acknowledgements" ADD CONSTRAINT "update_acknowledgements_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "progress_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocker_events" ADD CONSTRAINT "blocker_events_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "blockers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_projects" ADD CONSTRAINT "meeting_projects_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
