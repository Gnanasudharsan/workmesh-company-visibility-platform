-- Security & search layer.
--
-- 1. Row-Level Security: every tenant table is readable/writable by the restricted
--    `workmesh_app` role only for rows whose organization matches the transaction-local
--    setting `app.org_id` (set with set_config(..., true) at the start of each request
--    transaction, so it can never leak across pooled connections).
--    No setting → no rows (deny by default).
-- 2. Integrity constraints Prisma cannot express (partial unique indexes, CHECKs).
-- 3. Full-text search expression indexes.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'workmesh_app') THEN
    CREATE ROLE workmesh_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO workmesh_app;

CREATE OR REPLACE FUNCTION wm_current_org() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION wm_current_org() TO workmesh_app;

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organizations" USING ("id" = wm_current_org()) WITH CHECK ("id" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "organizations" TO workmesh_app;

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "memberships" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "memberships" TO workmesh_app;

ALTER TABLE "positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "positions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "positions" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "positions" TO workmesh_app;

ALTER TABLE "employee_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_profiles" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "employee_profiles" TO workmesh_app;

ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invitations" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "invitations" TO workmesh_app;

ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "departments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "departments" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "departments" TO workmesh_app;

ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teams" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "teams" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "teams" TO workmesh_app;

ALTER TABLE "team_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "team_memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "team_memberships" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "team_memberships" TO workmesh_app;

ALTER TABLE "reporting_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reporting_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "reporting_lines" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "reporting_lines" TO workmesh_app;

ALTER TABLE "delegations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delegations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "delegations" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "delegations" TO workmesh_app;

ALTER TABLE "company_goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_goals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "company_goals" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "company_goals" TO workmesh_app;

ALTER TABLE "initiatives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "initiatives" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "initiatives" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "initiatives" TO workmesh_app;

ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "projects" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "projects" TO workmesh_app;

ALTER TABLE "project_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_members" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "project_members" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "project_members" TO workmesh_app;

ALTER TABLE "access_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "access_grants" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "access_grants" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "access_grants" TO workmesh_app;

ALTER TABLE "milestones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "milestones" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "milestones" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "milestones" TO workmesh_app;

ALTER TABLE "work_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "work_items" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "work_items" TO workmesh_app;

ALTER TABLE "change_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "change_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "change_events" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "change_events" TO workmesh_app;

ALTER TABLE "progress_updates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "progress_updates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "progress_updates" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "progress_updates" TO workmesh_app;

ALTER TABLE "update_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "update_revisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "update_revisions" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "update_revisions" TO workmesh_app;

ALTER TABLE "update_acknowledgements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "update_acknowledgements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "update_acknowledgements" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "update_acknowledgements" TO workmesh_app;

ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "comments" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "comments" TO workmesh_app;

ALTER TABLE "blockers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blockers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "blockers" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "blockers" TO workmesh_app;

ALTER TABLE "blocker_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blocker_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "blocker_events" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "blocker_events" TO workmesh_app;

ALTER TABLE "dependencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dependencies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "dependencies" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "dependencies" TO workmesh_app;

ALTER TABLE "meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meetings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "meetings" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "meetings" TO workmesh_app;

ALTER TABLE "meeting_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meeting_participants" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "meeting_participants" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "meeting_participants" TO workmesh_app;

ALTER TABLE "meeting_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meeting_projects" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "meeting_projects" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "meeting_projects" TO workmesh_app;

ALTER TABLE "agenda_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agenda_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agenda_items" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "agenda_items" TO workmesh_app;

ALTER TABLE "decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "decisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "decisions" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "decisions" TO workmesh_app;

ALTER TABLE "action_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "action_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "action_items" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "action_items" TO workmesh_app;

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "notifications" TO workmesh_app;

ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notification_preferences" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "notification_preferences" TO workmesh_app;

ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "outbox_events" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "outbox_events" TO workmesh_app;

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_events" USING ("organizationId" = wm_current_org()) WITH CHECK ("organizationId" = wm_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "audit_events" TO workmesh_app;

-- Global tables (users, sessions, password_reset_tokens, mail_messages) get NO grants:
-- the tenant role can never read password hashes or session tokens.

-- ── Integrity ─────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "invitations_one_pending_per_email" ON "invitations" ("organizationId", lower("email")) WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "reporting_one_active_primary" ON "reporting_lines" ("reportId") WHERE "type" = 'PRIMARY' AND "endedAt" IS NULL;
CREATE UNIQUE INDEX "reporting_no_duplicate_active" ON "reporting_lines" ("reportId", "managerId", "type") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "team_membership_one_active" ON "team_memberships" ("teamId", "membershipId") WHERE "endedAt" IS NULL;
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_not_self" CHECK ("reportId" <> "managerId");
ALTER TABLE "delegations" ADD CONSTRAINT "delegation_not_self" CHECK ("delegatorId" <> "delegateId");
ALTER TABLE "delegations" ADD CONSTRAINT "delegation_window" CHECK ("expiresAt" > "startsAt");
ALTER TABLE "dependencies" ADD CONSTRAINT "dependency_not_self" CHECK ("upstreamProjectId" <> "downstreamProjectId");
ALTER TABLE "progress_updates" ADD CONSTRAINT "update_confidence_range" CHECK ("confidence" IS NULL OR "confidence" BETWEEN 1 AND 5);
ALTER TABLE "projects" ADD CONSTRAINT "project_reported_progress_range" CHECK ("reportedProgress" IS NULL OR "reportedProgress" BETWEEN 0 AND 100);

-- ── Full-text search (simple config: names and jargon should not be stemmed) ──
CREATE OR REPLACE FUNCTION wm_join(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT coalesce(array_to_string($1, ' '), '') $$;
GRANT EXECUTE ON FUNCTION wm_join(text[]) TO workmesh_app;
CREATE INDEX "fts_profiles" ON "employee_profiles" USING gin (to_tsvector('simple'::regconfig, coalesce("displayName",'') || ' ' || coalesce("title",'') || ' ' || wm_join("responsibilities")));
CREATE INDEX "fts_teams" ON "teams" USING gin (to_tsvector('simple'::regconfig, coalesce("name",'') || ' ' || coalesce("mission",'') || ' ' || wm_join("responsibilities")));
CREATE INDEX "fts_departments" ON "departments" USING gin (to_tsvector('simple'::regconfig, coalesce("name",'') || ' ' || coalesce("description",'')));
CREATE INDEX "fts_projects" ON "projects" USING gin (to_tsvector('simple'::regconfig, coalesce("name",'') || ' ' || coalesce("key",'') || ' ' || coalesce("summary",'')));
CREATE INDEX "fts_goals" ON "company_goals" USING gin (to_tsvector('simple'::regconfig, coalesce("title",'') || ' ' || coalesce("description",'')));
CREATE INDEX "fts_initiatives" ON "initiatives" USING gin (to_tsvector('simple'::regconfig, coalesce("title",'') || ' ' || coalesce("description",'')));
CREATE INDEX "fts_milestones" ON "milestones" USING gin (to_tsvector('simple'::regconfig, coalesce("title",'')));
CREATE INDEX "fts_updates" ON "progress_updates" USING gin (to_tsvector('simple'::regconfig, coalesce("currentFocus",'') || ' ' || coalesce("completed",'') || ' ' || coalesce("nextSteps",'')));
CREATE INDEX "fts_blockers" ON "blockers" USING gin (to_tsvector('simple'::regconfig, coalesce("title",'') || ' ' || coalesce("description",'')));
CREATE INDEX "fts_decisions" ON "decisions" USING gin (to_tsvector('simple'::regconfig, coalesce("title",'') || ' ' || coalesce("rationale",'')));
