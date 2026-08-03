CREATE TABLE "support_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"support_account_id" uuid NOT NULL,
	"platform_access_grant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"scope_type" text NOT NULL,
	"education_organization_id" uuid,
	"school_id" uuid,
	"allowed_capabilities" jsonb NOT NULL,
	"purpose" text NOT NULL,
	"ticket_reference" text NOT NULL,
	"emergency_rule_reference" text,
	"authorized_by_account_id" uuid NOT NULL,
	"authorized_by_person_id" uuid,
	"authorization_reason" text NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"bound_account_session_id" uuid,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by_account_id" uuid,
	"closed_by_person_id" uuid,
	"close_reason" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_account_id" uuid,
	"revoked_by_person_id" uuid,
	"revocation_reason" text,
	"review_status" text DEFAULT 'not_due' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_account_id" uuid,
	"reviewed_by_person_id" uuid,
	"review_outcome" text,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_access_grants_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "support_access_grants_kind_check" CHECK ("support_access_grants"."kind" IN ('support', 'break_glass')),
	CONSTRAINT "support_access_grants_status_check" CHECK ("support_access_grants"."status" IN ('approved', 'active', 'closed', 'revoked', 'expired')),
	CONSTRAINT "support_access_grants_scope_check" CHECK (("support_access_grants"."scope_type" = 'tenant' AND "support_access_grants"."education_organization_id" IS NULL AND "support_access_grants"."school_id" IS NULL)
          OR ("support_access_grants"."scope_type" = 'organization_subtree' AND "support_access_grants"."education_organization_id" IS NOT NULL AND "support_access_grants"."school_id" IS NULL)
          OR ("support_access_grants"."scope_type" = 'school' AND "support_access_grants"."education_organization_id" IS NULL AND "support_access_grants"."school_id" IS NOT NULL)),
	CONSTRAINT "support_access_grants_capabilities_check" CHECK (jsonb_typeof("support_access_grants"."allowed_capabilities") = 'array'
	          AND jsonb_array_length("support_access_grants"."allowed_capabilities") BETWEEN 1 AND 2
	          AND "support_access_grants"."allowed_capabilities" <@ '["support.schools.read", "support.students.read"]'::jsonb
	          AND (jsonb_array_length("support_access_grants"."allowed_capabilities") = 1
	            OR ("support_access_grants"."allowed_capabilities" ? 'support.schools.read'
	              AND "support_access_grants"."allowed_capabilities" ? 'support.students.read'))),
	CONSTRAINT "support_access_grants_purpose_check" CHECK ("support_access_grants"."purpose" IN ('customer_support', 'incident_response')
          AND ("support_access_grants"."kind" <> 'break_glass' OR "support_access_grants"."purpose" = 'incident_response')),
	CONSTRAINT "support_access_grants_reference_check" CHECK (char_length(btrim("support_access_grants"."ticket_reference")) BETWEEN 3 AND 128
          AND char_length(btrim("support_access_grants"."authorization_reason")) BETWEEN 3 AND 512
          AND ("support_access_grants"."emergency_rule_reference" IS NULL OR char_length(btrim("support_access_grants"."emergency_rule_reference")) BETWEEN 3 AND 128)
          AND ("support_access_grants"."close_reason" IS NULL OR char_length(btrim("support_access_grants"."close_reason")) BETWEEN 3 AND 512)
          AND ("support_access_grants"."revocation_reason" IS NULL OR char_length(btrim("support_access_grants"."revocation_reason")) BETWEEN 3 AND 512)
          AND ("support_access_grants"."review_notes" IS NULL OR char_length(btrim("support_access_grants"."review_notes")) BETWEEN 3 AND 2048)),
	CONSTRAINT "support_access_grants_authorizer_check" CHECK (("support_access_grants"."kind" = 'support' AND "support_access_grants"."authorized_by_person_id" IS NOT NULL AND "support_access_grants"."emergency_rule_reference" IS NULL)
          OR ("support_access_grants"."kind" = 'break_glass' AND "support_access_grants"."authorized_by_person_id" IS NULL AND "support_access_grants"."emergency_rule_reference" IS NOT NULL)),
	CONSTRAINT "support_access_grants_period_check" CHECK ("support_access_grants"."valid_until" > "support_access_grants"."valid_from"
          AND (("support_access_grants"."kind" = 'support' AND "support_access_grants"."valid_until" <= "support_access_grants"."valid_from" + interval '8 hours')
            OR ("support_access_grants"."kind" = 'break_glass' AND "support_access_grants"."valid_until" <= "support_access_grants"."valid_from" + interval '30 minutes'))),
	CONSTRAINT "support_access_grants_state_evidence_check" CHECK (("support_access_grants"."status" = 'approved' AND "support_access_grants"."bound_account_session_id" IS NULL AND "support_access_grants"."opened_at" IS NULL AND "support_access_grants"."closed_at" IS NULL AND "support_access_grants"."closed_by_account_id" IS NULL AND "support_access_grants"."closed_by_person_id" IS NULL AND "support_access_grants"."close_reason" IS NULL AND "support_access_grants"."revoked_at" IS NULL AND "support_access_grants"."review_status" = 'not_due')
          OR ("support_access_grants"."status" = 'active' AND "support_access_grants"."bound_account_session_id" IS NOT NULL AND "support_access_grants"."opened_at" IS NOT NULL AND "support_access_grants"."closed_at" IS NULL AND "support_access_grants"."revoked_at" IS NULL AND "support_access_grants"."review_status" = 'not_due')
          OR ("support_access_grants"."status" IN ('closed', 'expired') AND "support_access_grants"."revoked_at" IS NULL AND "support_access_grants"."closed_at" IS NOT NULL AND "support_access_grants"."close_reason" IS NOT NULL AND "support_access_grants"."review_status" IN ('pending', 'completed'))
          OR ("support_access_grants"."status" = 'revoked' AND "support_access_grants"."revoked_at" IS NOT NULL AND "support_access_grants"."revoked_by_account_id" IS NOT NULL AND "support_access_grants"."revoked_by_person_id" IS NOT NULL AND "support_access_grants"."revocation_reason" IS NOT NULL AND "support_access_grants"."review_status" IN ('pending', 'completed'))),
	CONSTRAINT "support_access_grants_review_evidence_check" CHECK (("support_access_grants"."review_status" IN ('not_due', 'pending') AND "support_access_grants"."reviewed_at" IS NULL AND "support_access_grants"."reviewed_by_account_id" IS NULL AND "support_access_grants"."reviewed_by_person_id" IS NULL AND "support_access_grants"."review_outcome" IS NULL AND "support_access_grants"."review_notes" IS NULL)
          OR ("support_access_grants"."review_status" = 'completed' AND "support_access_grants"."reviewed_at" IS NOT NULL AND "support_access_grants"."reviewed_by_account_id" IS NOT NULL AND "support_access_grants"."reviewed_by_person_id" IS NOT NULL AND "support_access_grants"."review_outcome" IN ('confirmed', 'no_impact', 'control_gap', 'incident') AND "support_access_grants"."review_notes" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "support_access_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "support_access_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"support_grant_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"event" text NOT NULL,
	"actor_account_id" uuid,
	"audience" text DEFAULT 'tenant_security_admins' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_access_notifications_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "support_access_notifications_operation_unique" UNIQUE("tenant_id","support_grant_id","event","operation_id"),
	CONSTRAINT "support_access_notifications_event_check" CHECK ("support_access_notifications"."event" IN ('approved', 'opened', 'used', 'closed', 'revoked', 'expired', 'reviewed', 'break_glass_opened')),
	CONSTRAINT "support_access_notifications_audience_check" CHECK ("support_access_notifications"."audience" = 'tenant_security_admins')
);
--> statement-breakpoint
ALTER TABLE "support_access_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "support_notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"notification_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_notification_outbox_notification_unique" UNIQUE("tenant_id","notification_id"),
	CONSTRAINT "support_notification_outbox_attempt_check" CHECK ("support_notification_outbox"."attempt_count" >= 0),
	CONSTRAINT "support_notification_outbox_status_check" CHECK ("support_notification_outbox"."status" IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter')),
	CONSTRAINT "support_notification_outbox_state_check" CHECK (("support_notification_outbox"."status" = 'pending' AND "support_notification_outbox"."attempt_count" = 0 AND "support_notification_outbox"."locked_at" IS NULL AND "support_notification_outbox"."delivered_at" IS NULL AND "support_notification_outbox"."last_error_code" IS NULL)
          OR ("support_notification_outbox"."status" = 'processing' AND "support_notification_outbox"."attempt_count" > 0 AND "support_notification_outbox"."locked_at" IS NOT NULL AND "support_notification_outbox"."delivered_at" IS NULL AND "support_notification_outbox"."last_error_code" IS NULL)
          OR ("support_notification_outbox"."status" = 'delivered' AND "support_notification_outbox"."attempt_count" > 0 AND "support_notification_outbox"."locked_at" IS NULL AND "support_notification_outbox"."delivered_at" IS NOT NULL AND "support_notification_outbox"."last_error_code" IS NULL)
          OR ("support_notification_outbox"."status" IN ('failed', 'dead_letter') AND "support_notification_outbox"."attempt_count" > 0 AND "support_notification_outbox"."locked_at" IS NULL AND "support_notification_outbox"."delivered_at" IS NULL AND "support_notification_outbox"."last_error_code" ~ '^[A-Z][A-Z0-9_]{2,63}$'))
);
--> statement-breakpoint
ALTER TABLE "support_notification_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_account_actor_check";--> statement-breakpoint
ALTER TABLE "platform_access_grants" DROP CONSTRAINT "platform_access_grants_role_check";--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_support_account_id_accounts_id_fk" FOREIGN KEY ("support_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_platform_access_grant_id_platform_access_grants_id_fk" FOREIGN KEY ("platform_access_grant_id") REFERENCES "public"."platform_access_grants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_authorized_by_account_id_accounts_id_fk" FOREIGN KEY ("authorized_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_bound_account_session_id_account_sessions_id_fk" FOREIGN KEY ("bound_account_session_id") REFERENCES "public"."account_sessions"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_closed_by_account_id_accounts_id_fk" FOREIGN KEY ("closed_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_revoked_by_account_id_accounts_id_fk" FOREIGN KEY ("revoked_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_reviewed_by_account_id_accounts_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_tenant_organization_fk" FOREIGN KEY ("tenant_id","education_organization_id") REFERENCES "public"."education_organizations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_tenant_authorizer_person_fk" FOREIGN KEY ("tenant_id","authorized_by_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_tenant_closer_person_fk" FOREIGN KEY ("tenant_id","closed_by_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_tenant_revoker_person_fk" FOREIGN KEY ("tenant_id","revoked_by_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_tenant_reviewer_person_fk" FOREIGN KEY ("tenant_id","reviewed_by_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_notifications" ADD CONSTRAINT "support_access_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_notifications" ADD CONSTRAINT "support_access_notifications_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_access_notifications" ADD CONSTRAINT "support_access_notifications_grant_fk" FOREIGN KEY ("tenant_id","support_grant_id") REFERENCES "public"."support_access_grants"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_notification_outbox" ADD CONSTRAINT "support_notification_outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "support_notification_outbox" ADD CONSTRAINT "support_notification_outbox_notification_fk" FOREIGN KEY ("tenant_id","notification_id") REFERENCES "public"."support_access_notifications"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "support_access_grants_resolve_idx" ON "support_access_grants" USING btree ("tenant_id","support_account_id","status","valid_until","id");--> statement-breakpoint
CREATE INDEX "support_access_grants_review_idx" ON "support_access_grants" USING btree ("tenant_id","review_status","updated_at","id");--> statement-breakpoint
CREATE INDEX "support_access_notifications_tenant_time_idx" ON "support_access_notifications" USING btree ("tenant_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "support_notification_outbox_claim_idx" ON "support_notification_outbox" USING btree ("tenant_id","status","available_at","id");--> statement-breakpoint
-- ALTER TABLE check expressions cannot qualify columns with the relation name.
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_account_actor_check" CHECK (("actor_type" NOT IN ('account', 'support', 'platform')) OR ("actor_account_id" IS NOT NULL AND ("actor_type" IN ('support', 'platform') OR "actor_person_id" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "platform_access_grants" ADD CONSTRAINT "platform_access_grants_role_check" CHECK ("role_template_key" IN ('super_admin', 'support_agent', 'break_glass_operator'));--> statement-breakpoint
CREATE POLICY "support_access_grants_manager_select" ON "support_access_grants" AS PERMISSIVE FOR SELECT TO "openschool_support_grant_manager" USING ("support_access_grants"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "support_access_grants_manager_insert" ON "support_access_grants" AS PERMISSIVE FOR INSERT TO "openschool_support_grant_manager" WITH CHECK ("support_access_grants"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "support_access_grants_manager_update" ON "support_access_grants" AS PERMISSIVE FOR UPDATE TO "openschool_support_grant_manager" USING ("support_access_grants"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("support_access_grants"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "support_access_grants_resolver_select" ON "support_access_grants" AS PERMISSIVE FOR SELECT TO "openschool_support_access_resolver" USING ("support_access_grants"."id" = nullif(current_setting('app.support_grant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "support_access_grants_resolver_update" ON "support_access_grants" AS PERMISSIVE FOR UPDATE TO "openschool_support_access_resolver" USING ("support_access_grants"."id" = nullif(current_setting('app.support_grant_id', true), '')::uuid) WITH CHECK ("support_access_grants"."id" = nullif(current_setting('app.support_grant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "support_access_grants_worker_select" ON "support_access_grants" AS PERMISSIVE FOR SELECT TO "openschool_worker" USING ("support_access_grants"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_access_expiry');--> statement-breakpoint
CREATE POLICY "support_access_grants_worker_update" ON "support_access_grants" AS PERMISSIVE FOR UPDATE TO "openschool_worker" USING ("support_access_grants"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_access_expiry') WITH CHECK ("support_access_grants"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_access_expiry');--> statement-breakpoint
CREATE POLICY "support_access_notifications_runtime_select" ON "support_access_notifications" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING ("support_access_notifications"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.support.grants.manage');--> statement-breakpoint
CREATE POLICY "support_access_notifications_manager_insert" ON "support_access_notifications" AS PERMISSIVE FOR INSERT TO "openschool_support_grant_manager" WITH CHECK ("support_access_notifications"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "support_access_notifications_resolver_insert" ON "support_access_notifications" AS PERMISSIVE FOR INSERT TO "openschool_support_access_resolver" WITH CHECK ("support_access_notifications"."support_grant_id" = nullif(current_setting('app.support_grant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "support_access_notifications_worker_insert" ON "support_access_notifications" AS PERMISSIVE FOR INSERT TO "openschool_worker" WITH CHECK ("support_access_notifications"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_access_expiry');--> statement-breakpoint
CREATE POLICY "support_access_notifications_worker_select" ON "support_access_notifications" AS PERMISSIVE FOR SELECT TO "openschool_worker" USING ("support_access_notifications"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_notification_delivery');--> statement-breakpoint
CREATE POLICY "support_notification_outbox_manager_insert" ON "support_notification_outbox" AS PERMISSIVE FOR INSERT TO "openschool_support_grant_manager" WITH CHECK ("support_notification_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "support_notification_outbox_resolver_insert" ON "support_notification_outbox" AS PERMISSIVE FOR INSERT TO "openschool_support_access_resolver" WITH CHECK ("support_notification_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.support_grant_id', true), '') IS NOT NULL);--> statement-breakpoint
CREATE POLICY "support_notification_outbox_worker_select" ON "support_notification_outbox" AS PERMISSIVE FOR SELECT TO "openschool_worker" USING ("support_notification_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_notification_delivery');--> statement-breakpoint
CREATE POLICY "support_notification_outbox_worker_update" ON "support_notification_outbox" AS PERMISSIVE FOR UPDATE TO "openschool_worker" USING ("support_notification_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_notification_delivery') WITH CHECK ("support_notification_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_notification_delivery');--> statement-breakpoint
ALTER POLICY "schools_runtime_select" ON "schools" TO openschool_runtime USING (
        "schools"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND (
          "schools"."id" = nullif(current_setting('app.school_id', true), '')::uuid
          OR (
            nullif(current_setting('app.policy_capability', true), '')
              IN (
                'tenant.schools.read', 'tenant.students.create',
                'support.schools.read', 'support.students.read',
                'tenant.accounts.invite', 'tenant.accounts.manage',
                'identity.context.resolve'
              )
            AND public.openschool_school_scope_allows(
              "schools"."tenant_id", "schools"."id"
            )
          )
        )
      );--> statement-breakpoint
ALTER POLICY "students_runtime_select" ON "students" TO openschool_runtime USING (
        "students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') IN (
          'tenant.students.create', 'tenant.students.read',
          'tenant.students.update', 'tenant.students.delete',
          'support.students.read',
          'identity.context.resolve'
        )
        AND public.openschool_student_scope_allows(
          "students"."tenant_id", "students"."school_id", "students"."id"
        )
      );--> statement-breakpoint
ALTER POLICY "audit_events_runtime_insert" ON "audit_events" TO openschool_runtime WITH CHECK (
        "audit_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND "audit_events"."actor_type" IN ('account', 'support')
        AND "audit_events"."actor_account_id" = nullif(current_setting('app.account_id', true), '')::uuid
        AND "audit_events"."actor_person_id" IS NOT DISTINCT FROM nullif(current_setting('app.person_id', true), '')::uuid
        AND "audit_events"."request_id" = nullif(current_setting('app.request_id', true), '')
        AND "audit_events"."education_organization_id" IS NOT DISTINCT FROM nullif(current_setting('app.education_organization_id', true), '')::uuid
        AND "audit_events"."school_id" IS NOT DISTINCT FROM nullif(current_setting('app.school_id', true), '')::uuid
        AND (
          ("audit_events"."actor_type" = 'account' AND "audit_events"."source" = 'web' AND "audit_events"."support_grant_id" IS NULL)
          OR ("audit_events"."actor_type" = 'support' AND "audit_events"."source" = 'support' AND "audit_events"."support_grant_id" IS NOT NULL AND "audit_events"."purpose" IS NOT NULL)
        )
      );--> statement-breakpoint
ALTER POLICY "provider_security_reconciliation_revoker_insert" ON "provider_security_reconciliation_outbox" TO openschool_identity_revoker WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_identity_revoker'
        AND "provider_security_reconciliation_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND "provider_security_reconciliation_outbox"."actor_account_id" = nullif(current_setting('app.account_id', true), '')::uuid
        AND "provider_security_reconciliation_outbox"."actor_person_id" = nullif(current_setting('app.person_id', true), '')::uuid
        AND "provider_security_reconciliation_outbox"."request_id" = nullif(current_setting('app.request_id', true), '')
      );--> statement-breakpoint

ALTER TABLE "support_access_grants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_access_notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_notification_outbox" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "support_access_grants"
  ADD CONSTRAINT "support_access_grants_no_live_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "support_account_id" WITH =,
    tstzrange("valid_from", "valid_until", '[)') WITH &&
  ) WHERE ("status" IN ('approved', 'active'));--> statement-breakpoint

CREATE FUNCTION "openschool_guard_support_access_grant_transition"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD."tenant_id" IS DISTINCT FROM NEW."tenant_id"
    OR OLD."support_account_id" IS DISTINCT FROM NEW."support_account_id"
    OR OLD."platform_access_grant_id" IS DISTINCT FROM NEW."platform_access_grant_id"
    OR OLD."kind" IS DISTINCT FROM NEW."kind"
    OR OLD."scope_type" IS DISTINCT FROM NEW."scope_type"
    OR OLD."education_organization_id" IS DISTINCT FROM NEW."education_organization_id"
    OR OLD."school_id" IS DISTINCT FROM NEW."school_id"
    OR OLD."allowed_capabilities" IS DISTINCT FROM NEW."allowed_capabilities"
    OR OLD."purpose" IS DISTINCT FROM NEW."purpose"
    OR OLD."ticket_reference" IS DISTINCT FROM NEW."ticket_reference"
    OR OLD."emergency_rule_reference" IS DISTINCT FROM NEW."emergency_rule_reference"
    OR OLD."authorized_by_account_id" IS DISTINCT FROM NEW."authorized_by_account_id"
    OR OLD."authorized_by_person_id" IS DISTINCT FROM NEW."authorized_by_person_id"
    OR OLD."authorization_reason" IS DISTINCT FROM NEW."authorization_reason"
    OR OLD."valid_from" IS DISTINCT FROM NEW."valid_from"
    OR OLD."valid_until" IS DISTINCT FROM NEW."valid_until"
    OR OLD."created_at" IS DISTINCT FROM NEW."created_at"
  THEN
    RAISE EXCEPTION 'Support Access Grant anchors are immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD."status" IN ('closed', 'revoked', 'expired') THEN
    IF NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."bound_account_session_id" IS DISTINCT FROM OLD."bound_account_session_id"
      OR NEW."opened_at" IS DISTINCT FROM OLD."opened_at"
      OR NEW."closed_at" IS DISTINCT FROM OLD."closed_at"
      OR NEW."closed_by_account_id" IS DISTINCT FROM OLD."closed_by_account_id"
      OR NEW."closed_by_person_id" IS DISTINCT FROM OLD."closed_by_person_id"
      OR NEW."close_reason" IS DISTINCT FROM OLD."close_reason"
      OR NEW."revoked_at" IS DISTINCT FROM OLD."revoked_at"
      OR NEW."revoked_by_account_id" IS DISTINCT FROM OLD."revoked_by_account_id"
      OR NEW."revoked_by_person_id" IS DISTINCT FROM OLD."revoked_by_person_id"
      OR NEW."revocation_reason" IS DISTINCT FROM OLD."revocation_reason"
    THEN
      RAISE EXCEPTION 'Terminal Support Access Grant evidence is immutable'
        USING ERRCODE = '23514';
    END IF;
    IF NOT (
      OLD."review_status" = 'pending'
      AND NEW."review_status" = 'completed'
      AND NEW."reviewed_at" IS NOT NULL
      AND NEW."reviewed_by_account_id" IS NOT NULL
      AND NEW."reviewed_by_person_id" IS NOT NULL
      AND NEW."review_outcome" IS NOT NULL
      AND NEW."review_notes" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Terminal Support Access Grants only accept one closure review'
        USING ERRCODE = '23514';
    END IF;
  ELSIF OLD."status" = 'approved' AND NEW."status" NOT IN ('active', 'revoked', 'expired') THEN
    RAISE EXCEPTION 'Invalid approved Support Access Grant transition'
      USING ERRCODE = '23514';
  ELSIF OLD."status" = 'active' AND NEW."status" NOT IN ('closed', 'revoked', 'expired') THEN
    RAISE EXCEPTION 'Invalid active Support Access Grant transition'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."updated_at" < OLD."updated_at" THEN
    RAISE EXCEPTION 'Support Access Grant update time cannot move backwards'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "support_access_grants_transition_guard"
  BEFORE UPDATE ON "support_access_grants"
  FOR EACH ROW EXECUTE FUNCTION "openschool_guard_support_access_grant_transition"();--> statement-breakpoint

CREATE FUNCTION "openschool_guard_support_notification_outbox_change"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'pending'
      OR NEW."attempt_count" <> 0
      OR NEW."locked_at" IS NOT NULL
      OR NEW."delivered_at" IS NOT NULL
      OR NEW."last_error_code" IS NOT NULL
    THEN
      RAISE EXCEPTION 'Support Notification Outbox must start pending and unclaimed'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."tenant_id" IS DISTINCT FROM NEW."tenant_id"
    OR OLD."notification_id" IS DISTINCT FROM NEW."notification_id"
    OR OLD."created_at" IS DISTINCT FROM NEW."created_at"
  THEN
    RAISE EXCEPTION 'Support Notification Outbox anchors are immutable'
      USING ERRCODE = '55000';
  END IF;
  IF NOT (
    (OLD."status" IN ('pending', 'failed') AND NEW."status" = 'processing')
    OR (OLD."status" = 'processing' AND NEW."status" = 'processing')
    OR (OLD."status" = 'processing' AND NEW."status" IN ('delivered', 'failed', 'dead_letter'))
  ) THEN
    RAISE EXCEPTION 'Invalid Support Notification Outbox transition: % to %', OLD."status", NEW."status"
      USING ERRCODE = '55000';
  END IF;
  IF NEW."updated_at" < OLD."updated_at" THEN
    RAISE EXCEPTION 'Support Notification Outbox update time cannot move backwards'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "support_notification_outbox_insert_guard"
  BEFORE INSERT ON "support_notification_outbox"
  FOR EACH ROW EXECUTE FUNCTION "openschool_guard_support_notification_outbox_change"();--> statement-breakpoint
CREATE TRIGGER "support_notification_outbox_update_guard"
  BEFORE UPDATE ON "support_notification_outbox"
  FOR EACH ROW EXECUTE FUNCTION "openschool_guard_support_notification_outbox_change"();--> statement-breakpoint

CREATE FUNCTION "openschool_private"."append_support_notification"(
  p_tenant_id uuid,
  p_support_grant_id uuid,
  p_operation_id uuid,
  p_event text,
  p_actor_account_id uuid,
  p_occurred_at timestamp with time zone
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  notification_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.support_access_notifications (
    id, tenant_id, support_grant_id, operation_id, event,
    actor_account_id, occurred_at, created_at
  ) VALUES (
    notification_id, p_tenant_id, p_support_grant_id, p_operation_id, p_event,
    p_actor_account_id, p_occurred_at, p_occurred_at
  );
  INSERT INTO public.support_notification_outbox (
    tenant_id, notification_id, status, attempt_count,
    available_at, created_at, updated_at
  ) VALUES (
    p_tenant_id, notification_id, 'pending', 0,
    p_occurred_at, p_occurred_at, p_occurred_at
  );
  RETURN notification_id;
END;
$$;--> statement-breakpoint

CREATE POLICY "audit_events_support_manager_insert"
  ON "audit_events" AS PERMISSIVE FOR INSERT TO "openschool_support_grant_manager"
  WITH CHECK (
    current_user = 'openschool_support_grant_manager'
    AND session_user IN ('openschool_runtime', 'openschool_control_plane')
    AND "audit_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND "audit_events"."actor_account_id" = nullif(current_setting('app.account_id', true), '')::uuid
    AND "audit_events"."request_id" = nullif(current_setting('app.request_id', true), '')
    AND "audit_events"."correlation_id" = nullif(current_setting('app.correlation_id', true), '')
    AND "audit_events"."target_type" = 'support_access_grant'
  );--> statement-breakpoint
CREATE POLICY "audit_outbox_support_manager_insert"
  ON "audit_outbox" AS PERMISSIVE FOR INSERT TO "openschool_support_grant_manager"
  WITH CHECK (
    current_user = 'openschool_support_grant_manager'
    AND session_user IN ('openschool_runtime', 'openschool_control_plane')
    AND "audit_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND "audit_outbox"."context" ->> 'actorAccountId' = nullif(current_setting('app.account_id', true), '')
    AND "audit_outbox"."context" ->> 'requestId' = nullif(current_setting('app.request_id', true), '')
    AND "audit_outbox"."correlation_id" = nullif(current_setting('app.correlation_id', true), '')
  );--> statement-breakpoint
CREATE POLICY "audit_events_support_resolver_insert"
  ON "audit_events" AS PERMISSIVE FOR INSERT TO "openschool_support_access_resolver"
  WITH CHECK (
    current_user = 'openschool_support_access_resolver'
    AND session_user = 'openschool_runtime'
    AND "audit_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND "audit_events"."actor_type" = 'support'
    AND "audit_events"."actor_account_id" = nullif(current_setting('app.account_id', true), '')::uuid
    AND "audit_events"."actor_person_id" IS NULL
    AND "audit_events"."support_grant_id" = nullif(current_setting('app.support_grant_id', true), '')::uuid
    AND "audit_events"."request_id" = nullif(current_setting('app.request_id', true), '')
    AND "audit_events"."correlation_id" = nullif(current_setting('app.correlation_id', true), '')
    AND "audit_events"."source" = 'support'
  );--> statement-breakpoint
CREATE POLICY "audit_outbox_support_resolver_insert"
  ON "audit_outbox" AS PERMISSIVE FOR INSERT TO "openschool_support_access_resolver"
  WITH CHECK (
    current_user = 'openschool_support_access_resolver'
    AND session_user = 'openschool_runtime'
    AND "audit_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND "audit_outbox"."context" ->> 'actorAccountId' = nullif(current_setting('app.account_id', true), '')
    AND "audit_outbox"."context" ->> 'supportGrantId' = nullif(current_setting('app.support_grant_id', true), '')
    AND "audit_outbox"."context" ->> 'requestId' = nullif(current_setting('app.request_id', true), '')
    AND "audit_outbox"."correlation_id" = nullif(current_setting('app.correlation_id', true), '')
  );--> statement-breakpoint

CREATE FUNCTION "openschool_private"."tenant_admin_can_manage_support"(
  p_tenant_id uuid,
  p_person_id uuid,
  p_scope_type text,
  p_education_organization_id uuid,
  p_school_id uuid,
  p_at timestamp with time zone
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.affiliations AS affiliation
    INNER JOIN public.role_template_assignments AS role_assignment
      ON role_assignment.tenant_id = affiliation.tenant_id
      AND role_assignment.affiliation_id = affiliation.id
      AND role_assignment.status = 'active'
      AND role_assignment.valid_from <= p_at
      AND (role_assignment.valid_until IS NULL OR role_assignment.valid_until > p_at)
    WHERE affiliation.tenant_id = p_tenant_id
      AND affiliation.person_id = p_person_id
      AND affiliation.kind = 'administrator'
      AND affiliation.status = 'active'
      AND affiliation.valid_from <= p_at
      AND (affiliation.valid_until IS NULL OR affiliation.valid_until > p_at)
      AND (
        (
          role_assignment.role_template_key = 'org_admin'
          AND (
            affiliation.scope_type = 'tenant'
            OR (
              affiliation.scope_type = 'education_organization'
              AND p_scope_type = 'organization_subtree'
              AND EXISTS (
                SELECT 1
                FROM public.organization_tree_closure AS closure
                WHERE closure.tenant_id = p_tenant_id
                  AND closure.ancestor_organization_id = affiliation.education_organization_id
                  AND closure.descendant_organization_id = p_education_organization_id
                  AND closure.tree_version_id = (
                    SELECT version.id
                    FROM public.organization_tree_versions AS version
                    WHERE version.tenant_id = p_tenant_id
                      AND version.effective_from <= p_at
                    ORDER BY version.effective_from DESC
                    LIMIT 1
                  )
              )
            )
            OR (
              affiliation.scope_type = 'education_organization'
              AND p_scope_type = 'school'
              AND EXISTS (
                SELECT 1
                FROM public.school_governance_assignments AS governance
                INNER JOIN public.organization_tree_closure AS closure
                  ON closure.tenant_id = governance.tenant_id
                  AND closure.descendant_organization_id = governance.education_organization_id
                WHERE governance.tenant_id = p_tenant_id
                  AND governance.school_id = p_school_id
                  AND governance.valid_from <= p_at
                  AND (governance.valid_until IS NULL OR governance.valid_until > p_at)
                  AND closure.ancestor_organization_id = affiliation.education_organization_id
                  AND closure.tree_version_id = (
                    SELECT version.id
                    FROM public.organization_tree_versions AS version
                    WHERE version.tenant_id = p_tenant_id
                      AND version.effective_from <= p_at
                    ORDER BY version.effective_from DESC
                    LIMIT 1
                  )
              )
            )
          )
        )
        OR (
          role_assignment.role_template_key = 'school_admin'
          AND affiliation.scope_type = 'school'
          AND p_scope_type = 'school'
          AND affiliation.school_id = p_school_id
        )
      )
  )
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."issue_support_access_grant"(
  p_support_account_id uuid,
  p_scope_type text,
  p_education_organization_id uuid,
  p_school_id uuid,
  p_allowed_capabilities jsonb,
  p_purpose text,
  p_ticket_reference text,
  p_authorization_reason text,
  p_valid_until timestamp with time zone
)
RETURNS TABLE (
  support_grant_id uuid,
  tenant_id uuid,
  status text,
  valid_until timestamp with time zone,
  notification_id uuid,
  audit_event_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  actor_account_id uuid;
  actor_person_id uuid;
  actor_security_version bigint;
  actor_membership_version bigint;
  actor_session_id text := nullif(current_setting('app.session_id', true), '');
  context_tenant_id uuid;
  verified_reauthenticated_at timestamp with time zone;
  issued_at timestamp with time zone := statement_timestamp();
  platform_grant public.platform_access_grants%ROWTYPE;
  grant_id uuid := gen_random_uuid();
  operation_id uuid := gen_random_uuid();
  pending_notification_id uuid;
  event_id uuid := gen_random_uuid();
  outbox_id uuid := gen_random_uuid();
  context_request_id text := nullif(current_setting('app.request_id', true), '');
  context_correlation_id text := nullif(current_setting('app.correlation_id', true), '');
  context_policy_version text := nullif(current_setting('app.policy_version', true), '');
  context_policy_constraints jsonb;
  normalized_ticket text := btrim(p_ticket_reference);
  normalized_reason text := btrim(p_authorization_reason);
BEGIN
  BEGIN
    actor_account_id := nullif(current_setting('app.account_id', true), '')::uuid;
    actor_person_id := nullif(current_setting('app.person_id', true), '')::uuid;
    actor_security_version := nullif(current_setting('app.security_version', true), '')::bigint;
    actor_membership_version := nullif(current_setting('app.membership_version', true), '')::bigint;
    context_tenant_id := nullif(current_setting('app.tenant_id', true), '')::uuid;
    verified_reauthenticated_at := nullif(current_setting('app.reauthenticated_at', true), '')::timestamp with time zone;
    context_policy_constraints := nullif(current_setting('app.policy_constraints', true), '')::jsonb;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_CONTEXT_INVALID' USING ERRCODE = '22023';
  END;

  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_support_grant_manager'
    OR actor_account_id IS NULL
    OR actor_person_id IS NULL
    OR actor_session_id IS NULL
    OR actor_security_version IS NULL
    OR actor_membership_version IS NULL
    OR context_tenant_id IS NULL
    OR context_request_id IS NULL
    OR context_correlation_id IS NULL
    OR context_policy_version IS NULL
    OR jsonb_typeof(context_policy_constraints) <> 'array'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.support.grants.manage'
    OR verified_reauthenticated_at IS NULL
    OR verified_reauthenticated_at < issued_at - interval '15 minutes'
    OR verified_reauthenticated_at > issued_at + interval '1 minute'
    OR p_scope_type NOT IN ('tenant', 'organization_subtree', 'school')
    OR p_allowed_capabilities IS NULL
    OR jsonb_typeof(p_allowed_capabilities) <> 'array'
    OR jsonb_array_length(p_allowed_capabilities) NOT BETWEEN 1 AND 2
    OR NOT p_allowed_capabilities <@ '["support.schools.read", "support.students.read"]'::jsonb
    OR (jsonb_array_length(p_allowed_capabilities) = 2
      AND NOT (p_allowed_capabilities ? 'support.schools.read'
        AND p_allowed_capabilities ? 'support.students.read'))
    OR p_purpose NOT IN ('customer_support', 'incident_response')
    OR char_length(normalized_ticket) NOT BETWEEN 3 AND 128
    OR char_length(normalized_reason) NOT BETWEEN 3 AND 512
    OR p_valid_until <= issued_at
    OR p_valid_until > issued_at + interval '8 hours'
  THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.accounts AS account
  INNER JOIN public.account_sessions AS account_session
    ON account_session.account_id = account.id
    AND account_session.provider_session_id = actor_session_id
    AND account_session.status = 'active'
    AND account_session.security_version = actor_security_version
    AND account_session.assurance_level = 'aal2'
    AND account_session.reauthenticated_at = verified_reauthenticated_at
    AND account_session.expires_at > issued_at
  INNER JOIN public.account_links AS account_link
    ON account_link.account_id = account.id
    AND account_link.tenant_id = context_tenant_id
    AND account_link.person_id = actor_person_id
    AND account_link.status = 'active'
    AND account_link.valid_from <= issued_at
    AND (account_link.valid_until IS NULL OR account_link.valid_until > issued_at)
  INNER JOIN public.people AS person
    ON person.tenant_id = account_link.tenant_id
    AND person.id = account_link.person_id
    AND person.status = 'active'
  WHERE account.id = actor_account_id
    AND account.status = 'active'
    AND account.security_version = actor_security_version
    AND account.membership_version = actor_membership_version
  FOR SHARE OF account, account_session, account_link, person;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_CONTEXT_STALE' USING ERRCODE = 'P0001';
  END IF;

  IF NOT openschool_private.tenant_admin_can_manage_support(
    context_tenant_id, actor_person_id, p_scope_type,
    p_education_organization_id, p_school_id, issued_at
  ) THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT candidate.* INTO platform_grant
  FROM public.platform_access_grants AS candidate
  INNER JOIN public.accounts AS support_account
    ON support_account.id = candidate.account_id
    AND support_account.status = 'active'
  WHERE candidate.account_id = p_support_account_id
    AND candidate.role_template_key = 'support_agent'
    AND candidate.status = 'active'
    AND candidate.valid_from <= issued_at
    AND candidate.valid_until > issued_at
    AND candidate.valid_until >= p_valid_until
  FOR SHARE OF candidate, support_account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_ACCOUNT_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.support_grant_id', grant_id::text, true);
  INSERT INTO public.support_access_grants (
    id, tenant_id, support_account_id, platform_access_grant_id, kind, status,
    scope_type, education_organization_id, school_id, allowed_capabilities,
    purpose, ticket_reference, authorized_by_account_id, authorized_by_person_id,
    authorization_reason, valid_from, valid_until, created_at, updated_at
  ) VALUES (
    grant_id, context_tenant_id, p_support_account_id, platform_grant.id, 'support', 'approved',
    p_scope_type, p_education_organization_id, p_school_id, p_allowed_capabilities,
    p_purpose, normalized_ticket, actor_account_id, actor_person_id,
    normalized_reason, issued_at, p_valid_until, issued_at, issued_at
  );

  pending_notification_id := openschool_private.append_support_notification(
    context_tenant_id, grant_id, operation_id, 'approved', actor_account_id, issued_at
  );

  INSERT INTO public.audit_events (
    id, occurred_at, event_version, event_type, outcome, tenant_id,
    education_organization_id, school_id, actor_type, actor_account_id,
    actor_person_id, capability, policy_version, policy_decision, request_id,
    correlation_id, support_grant_id, target_type, target_id, data_classes,
    change_summary, purpose, source, retention_class, content_hash, created_at
  ) VALUES (
    event_id, issued_at, 1, 'support.grant.approve', 'succeeded', context_tenant_id,
    p_education_organization_id, p_school_id, 'account', actor_account_id,
    actor_person_id, 'tenant.support.grants.manage', context_policy_version,
    jsonb_build_object('effect', 'allow', 'queryConstraints', context_policy_constraints),
    context_request_id, context_correlation_id, NULL, 'support_access_grant',
    grant_id::text, '["internal"]'::jsonb,
    jsonb_build_object('changedFields', jsonb_build_array('status')),
    'support_access_approval', 'web', 'security', 'pending', issued_at
  );
  INSERT INTO public.audit_outbox (
    id, tenant_id, audit_event_id, audit_event_occurred_at, topic,
    deduplication_key, correlation_id, context, payload, payload_hash,
    status, attempt_count, available_at, created_at, updated_at
  ) VALUES (
    outbox_id, context_tenant_id, event_id, issued_at, 'security.support_access',
    'support.grant.approve:' || grant_id::text, context_correlation_id,
    jsonb_build_object(
      'tenantId', context_tenant_id, 'requestId', context_request_id,
      'correlationId', context_correlation_id, 'actorAccountId', actor_account_id,
      'actorPersonId', actor_person_id
    ),
    jsonb_build_object(
      'auditEventId', event_id, 'eventVersion', 1,
      'eventType', 'support.grant.approve', 'outcome', 'succeeded',
      'targetType', 'support_access_grant', 'targetId', grant_id
    ),
    'pending', 'pending', 0, issued_at, issued_at, issued_at
  );

  RETURN QUERY SELECT grant_id, context_tenant_id, 'approved'::text, p_valid_until,
    pending_notification_id, event_id;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."revoke_support_access_grant"(
  p_support_grant_id uuid,
  p_revocation_reason text
)
RETURNS TABLE (
  support_grant_id uuid,
  status text,
  notification_id uuid,
  audit_event_id uuid,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  actor_account_id uuid;
  actor_person_id uuid;
  actor_security_version bigint;
  actor_membership_version bigint;
  actor_session_id text := nullif(current_setting('app.session_id', true), '');
  context_tenant_id uuid;
  verified_reauthenticated_at timestamp with time zone;
  changed_at timestamp with time zone := statement_timestamp();
  target_grant public.support_access_grants%ROWTYPE;
  operation_id uuid := gen_random_uuid();
  pending_notification_id uuid;
  event_id uuid := gen_random_uuid();
  outbox_id uuid := gen_random_uuid();
  context_request_id text := nullif(current_setting('app.request_id', true), '');
  context_correlation_id text := nullif(current_setting('app.correlation_id', true), '');
  context_policy_version text := nullif(current_setting('app.policy_version', true), '');
  context_policy_constraints jsonb;
  normalized_reason text := btrim(p_revocation_reason);
BEGIN
  BEGIN
    actor_account_id := nullif(current_setting('app.account_id', true), '')::uuid;
    actor_person_id := nullif(current_setting('app.person_id', true), '')::uuid;
    actor_security_version := nullif(current_setting('app.security_version', true), '')::bigint;
    actor_membership_version := nullif(current_setting('app.membership_version', true), '')::bigint;
    context_tenant_id := nullif(current_setting('app.tenant_id', true), '')::uuid;
    verified_reauthenticated_at := nullif(current_setting('app.reauthenticated_at', true), '')::timestamp with time zone;
    context_policy_constraints := nullif(current_setting('app.policy_constraints', true), '')::jsonb;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_CONTEXT_INVALID' USING ERRCODE = '22023';
  END;
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_support_grant_manager'
    OR actor_account_id IS NULL OR actor_person_id IS NULL OR actor_session_id IS NULL
    OR actor_security_version IS NULL OR actor_membership_version IS NULL
    OR context_tenant_id IS NULL OR context_request_id IS NULL OR context_correlation_id IS NULL
    OR context_policy_version IS NULL OR jsonb_typeof(context_policy_constraints) <> 'array'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.support.grants.manage'
    OR verified_reauthenticated_at IS NULL
    OR verified_reauthenticated_at < changed_at - interval '15 minutes'
    OR verified_reauthenticated_at > changed_at + interval '1 minute'
    OR char_length(normalized_reason) NOT BETWEEN 3 AND 512
  THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.accounts AS account
  INNER JOIN public.account_sessions AS account_session
    ON account_session.account_id = account.id
    AND account_session.provider_session_id = actor_session_id
    AND account_session.status = 'active'
    AND account_session.security_version = actor_security_version
    AND account_session.assurance_level = 'aal2'
    AND account_session.reauthenticated_at = verified_reauthenticated_at
    AND account_session.expires_at > changed_at
  INNER JOIN public.account_links AS account_link
    ON account_link.account_id = account.id
    AND account_link.tenant_id = context_tenant_id
    AND account_link.person_id = actor_person_id
    AND account_link.status = 'active'
    AND account_link.valid_from <= changed_at
    AND (account_link.valid_until IS NULL OR account_link.valid_until > changed_at)
  INNER JOIN public.people AS person
    ON person.tenant_id = account_link.tenant_id
    AND person.id = account_link.person_id
    AND person.status = 'active'
  WHERE account.id = actor_account_id
    AND account.status = 'active'
    AND account.security_version = actor_security_version
    AND account.membership_version = actor_membership_version
  FOR SHARE OF account, account_session, account_link, person;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_CONTEXT_STALE' USING ERRCODE = 'P0001';
  END IF;

  SELECT candidate.* INTO target_grant
  FROM public.support_access_grants AS candidate
  WHERE candidate.tenant_id = context_tenant_id
    AND candidate.id = p_support_grant_id
    AND candidate.kind = 'support'
    AND candidate.status IN ('approved', 'active')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT openschool_private.tenant_admin_can_manage_support(
    context_tenant_id, actor_person_id, target_grant.scope_type,
    target_grant.education_organization_id, target_grant.school_id, changed_at
  ) THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.support_grant_id', p_support_grant_id::text, true);
  UPDATE public.support_access_grants
  SET status = 'revoked', revoked_at = changed_at,
    revoked_by_account_id = actor_account_id, revoked_by_person_id = actor_person_id,
    revocation_reason = normalized_reason, review_status = 'pending', updated_at = changed_at
  WHERE id = p_support_grant_id;
  pending_notification_id := openschool_private.append_support_notification(
    context_tenant_id, p_support_grant_id, operation_id, 'revoked', actor_account_id, changed_at
  );

  INSERT INTO public.audit_events (
    id, occurred_at, event_version, event_type, outcome, tenant_id,
    education_organization_id, school_id, actor_type, actor_account_id,
    actor_person_id, capability, policy_version, policy_decision, request_id,
    correlation_id, target_type, target_id, data_classes, change_summary,
    purpose, source, retention_class, content_hash, created_at
  ) VALUES (
    event_id, changed_at, 1, 'support.grant.revoke', 'succeeded', context_tenant_id,
    target_grant.education_organization_id, target_grant.school_id, 'account',
    actor_account_id, actor_person_id, 'tenant.support.grants.manage', context_policy_version,
    jsonb_build_object('effect', 'allow', 'queryConstraints', context_policy_constraints),
    context_request_id, context_correlation_id, 'support_access_grant',
    p_support_grant_id::text, '["internal"]'::jsonb,
    jsonb_build_object('changedFields', jsonb_build_array('status')),
    'support_access_revocation', 'web', 'security', 'pending', changed_at
  );
  INSERT INTO public.audit_outbox (
    id, tenant_id, audit_event_id, audit_event_occurred_at, topic,
    deduplication_key, correlation_id, context, payload, payload_hash,
    status, attempt_count, available_at, created_at, updated_at
  ) VALUES (
    outbox_id, context_tenant_id, event_id, changed_at, 'security.context.invalidate',
    'support.grant.revoke:' || p_support_grant_id::text, context_correlation_id,
    jsonb_build_object(
      'tenantId', context_tenant_id, 'requestId', context_request_id,
      'correlationId', context_correlation_id, 'actorAccountId', actor_account_id,
      'actorPersonId', actor_person_id
    ),
    jsonb_build_object(
      'auditEventId', event_id, 'eventVersion', 1,
      'eventType', 'support.grant.revoke', 'outcome', 'succeeded',
      'targetType', 'support_access_grant', 'targetId', p_support_grant_id
    ),
    'pending', 'pending', 0, changed_at, changed_at, changed_at
  );
  RETURN QUERY SELECT p_support_grant_id, 'revoked'::text, pending_notification_id,
    event_id, changed_at;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."review_support_access_grant"(
  p_support_grant_id uuid,
  p_review_outcome text,
  p_review_notes text
)
RETURNS TABLE (
  support_grant_id uuid,
  review_status text,
  notification_id uuid,
  audit_event_id uuid,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  actor_account_id uuid;
  actor_person_id uuid;
  actor_security_version bigint;
  actor_membership_version bigint;
  actor_session_id text := nullif(current_setting('app.session_id', true), '');
  context_tenant_id uuid;
  verified_reauthenticated_at timestamp with time zone;
  changed_at timestamp with time zone := statement_timestamp();
  target_grant public.support_access_grants%ROWTYPE;
  operation_id uuid := gen_random_uuid();
  pending_notification_id uuid;
  event_id uuid := gen_random_uuid();
  outbox_id uuid := gen_random_uuid();
  context_request_id text := nullif(current_setting('app.request_id', true), '');
  context_correlation_id text := nullif(current_setting('app.correlation_id', true), '');
  context_policy_version text := nullif(current_setting('app.policy_version', true), '');
  context_policy_constraints jsonb;
  normalized_notes text := btrim(p_review_notes);
BEGIN
  BEGIN
    actor_account_id := nullif(current_setting('app.account_id', true), '')::uuid;
    actor_person_id := nullif(current_setting('app.person_id', true), '')::uuid;
    actor_security_version := nullif(current_setting('app.security_version', true), '')::bigint;
    actor_membership_version := nullif(current_setting('app.membership_version', true), '')::bigint;
    context_tenant_id := nullif(current_setting('app.tenant_id', true), '')::uuid;
    verified_reauthenticated_at := nullif(current_setting('app.reauthenticated_at', true), '')::timestamp with time zone;
    context_policy_constraints := nullif(current_setting('app.policy_constraints', true), '')::jsonb;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_CONTEXT_INVALID' USING ERRCODE = '22023';
  END;
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_support_grant_manager'
    OR actor_account_id IS NULL OR actor_person_id IS NULL OR actor_session_id IS NULL
    OR actor_security_version IS NULL OR actor_membership_version IS NULL
    OR context_tenant_id IS NULL
    OR context_request_id IS NULL OR context_correlation_id IS NULL
    OR context_policy_version IS NULL OR jsonb_typeof(context_policy_constraints) <> 'array'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.support.grants.manage'
    OR verified_reauthenticated_at IS NULL
    OR verified_reauthenticated_at < changed_at - interval '15 minutes'
    OR verified_reauthenticated_at > changed_at + interval '1 minute'
    OR p_review_outcome NOT IN ('confirmed', 'no_impact', 'control_gap', 'incident')
    OR char_length(normalized_notes) NOT BETWEEN 3 AND 2048
  THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.accounts AS account
  INNER JOIN public.account_sessions AS account_session
    ON account_session.account_id = account.id
    AND account_session.provider_session_id = actor_session_id
    AND account_session.status = 'active'
    AND account_session.security_version = actor_security_version
    AND account_session.assurance_level = 'aal2'
    AND account_session.reauthenticated_at = verified_reauthenticated_at
    AND account_session.expires_at > changed_at
  INNER JOIN public.account_links AS account_link
    ON account_link.account_id = account.id
    AND account_link.tenant_id = context_tenant_id
    AND account_link.person_id = actor_person_id
    AND account_link.status = 'active'
    AND account_link.valid_from <= changed_at
    AND (account_link.valid_until IS NULL OR account_link.valid_until > changed_at)
  INNER JOIN public.people AS person
    ON person.tenant_id = account_link.tenant_id
    AND person.id = account_link.person_id
    AND person.status = 'active'
  WHERE account.id = actor_account_id
    AND account.status = 'active'
    AND account.security_version = actor_security_version
    AND account.membership_version = actor_membership_version
  FOR SHARE OF account, account_session, account_link, person;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_CONTEXT_STALE' USING ERRCODE = 'P0001';
  END IF;

  SELECT candidate.* INTO target_grant
  FROM public.support_access_grants AS candidate
  WHERE candidate.tenant_id = context_tenant_id
    AND candidate.id = p_support_grant_id
    AND candidate.status IN ('closed', 'revoked', 'expired')
    AND candidate.review_status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_REVIEW_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT openschool_private.tenant_admin_can_manage_support(
    context_tenant_id, actor_person_id, target_grant.scope_type,
    target_grant.education_organization_id, target_grant.school_id, changed_at
  ) THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.support_grant_id', p_support_grant_id::text, true);
  UPDATE public.support_access_grants
  SET review_status = 'completed', reviewed_at = changed_at,
    reviewed_by_account_id = actor_account_id, reviewed_by_person_id = actor_person_id,
    review_outcome = p_review_outcome, review_notes = normalized_notes, updated_at = changed_at
  WHERE id = p_support_grant_id;
  pending_notification_id := openschool_private.append_support_notification(
    context_tenant_id, p_support_grant_id, operation_id, 'reviewed', actor_account_id, changed_at
  );

  INSERT INTO public.audit_events (
    id, occurred_at, event_version, event_type, outcome, tenant_id,
    education_organization_id, school_id, actor_type, actor_account_id,
    actor_person_id, capability, policy_version, policy_decision, request_id,
    correlation_id, target_type, target_id, data_classes, change_summary,
    purpose, source, retention_class, content_hash, created_at
  ) VALUES (
    event_id, changed_at, 1, 'support.grant.review', 'succeeded', context_tenant_id,
    target_grant.education_organization_id, target_grant.school_id, 'account',
    actor_account_id, actor_person_id, 'tenant.support.grants.manage', context_policy_version,
    jsonb_build_object('effect', 'allow', 'queryConstraints', context_policy_constraints),
    context_request_id, context_correlation_id, 'support_access_grant',
    p_support_grant_id::text, '["internal"]'::jsonb,
    jsonb_build_object('changedFields', jsonb_build_array('reviewStatus')),
    'support_access_review', 'web', 'security', 'pending', changed_at
  );
  INSERT INTO public.audit_outbox (
    id, tenant_id, audit_event_id, audit_event_occurred_at, topic,
    deduplication_key, correlation_id, context, payload, payload_hash,
    status, attempt_count, available_at, created_at, updated_at
  ) VALUES (
    outbox_id, context_tenant_id, event_id, changed_at, 'security.support_access',
    'support.grant.review:' || p_support_grant_id::text, context_correlation_id,
    jsonb_build_object(
      'tenantId', context_tenant_id, 'requestId', context_request_id,
      'correlationId', context_correlation_id, 'actorAccountId', actor_account_id,
      'actorPersonId', actor_person_id
    ),
    jsonb_build_object(
      'auditEventId', event_id, 'eventVersion', 1,
      'eventType', 'support.grant.review', 'outcome', 'succeeded',
      'targetType', 'support_access_grant', 'targetId', p_support_grant_id
    ),
    'pending', 'pending', 0, changed_at, changed_at, changed_at
  );
  RETURN QUERY SELECT p_support_grant_id, 'completed'::text, pending_notification_id,
    event_id, changed_at;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."open_break_glass_access"(
  p_target_tenant_id uuid,
  p_scope_type text,
  p_education_organization_id uuid,
  p_school_id uuid,
  p_allowed_capabilities jsonb,
  p_ticket_reference text,
  p_emergency_rule_reference text,
  p_authorization_reason text,
  p_valid_until timestamp with time zone
)
RETURNS TABLE (
  support_grant_id uuid,
  tenant_id uuid,
  status text,
  valid_until timestamp with time zone,
  notification_id uuid,
  audit_event_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  actor_account_id uuid;
  actor_security_version bigint;
  actor_platform_grant_id uuid;
  actor_session_id text := nullif(current_setting('app.session_id', true), '');
  verified_reauthenticated_at timestamp with time zone;
  opened_at timestamp with time zone := statement_timestamp();
  account_session_id uuid;
  grant_id uuid := gen_random_uuid();
  operation_id uuid := gen_random_uuid();
  pending_notification_id uuid;
  event_id uuid := gen_random_uuid();
  outbox_id uuid := gen_random_uuid();
  context_request_id text := nullif(current_setting('app.request_id', true), '');
  context_correlation_id text := nullif(current_setting('app.correlation_id', true), '');
  context_policy_version text := nullif(current_setting('app.policy_version', true), '');
  context_policy_constraints jsonb;
  normalized_ticket text := btrim(p_ticket_reference);
  normalized_rule text := btrim(p_emergency_rule_reference);
  normalized_reason text := btrim(p_authorization_reason);
BEGIN
  BEGIN
    actor_account_id := nullif(current_setting('app.account_id', true), '')::uuid;
    actor_security_version := nullif(current_setting('app.security_version', true), '')::bigint;
    actor_platform_grant_id := nullif(current_setting('app.platform_access_grant_id', true), '')::uuid;
    verified_reauthenticated_at := nullif(current_setting('app.reauthenticated_at', true), '')::timestamp with time zone;
    context_policy_constraints := nullif(current_setting('app.policy_constraints', true), '')::jsonb;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'BREAK_GLASS_CONTEXT_INVALID' USING ERRCODE = '22023';
  END;
  IF session_user <> 'openschool_control_plane'
    OR current_user <> 'openschool_support_grant_manager'
    OR actor_account_id IS NULL OR actor_security_version IS NULL
    OR actor_platform_grant_id IS NULL OR actor_session_id IS NULL
    OR context_request_id IS NULL OR context_correlation_id IS NULL
    OR context_policy_version IS NULL
    OR context_policy_constraints <> '[{"kind":"platform"}]'::jsonb
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.platform_role_template_key', true), '') <> 'break_glass_operator'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'platform.break_glass.open'
    OR verified_reauthenticated_at IS NULL
    OR verified_reauthenticated_at < opened_at - interval '15 minutes'
    OR verified_reauthenticated_at > opened_at + interval '1 minute'
    OR p_scope_type NOT IN ('tenant', 'organization_subtree', 'school')
    OR p_allowed_capabilities IS NULL
    OR jsonb_typeof(p_allowed_capabilities) <> 'array'
    OR jsonb_array_length(p_allowed_capabilities) NOT BETWEEN 1 AND 2
    OR NOT p_allowed_capabilities <@ '["support.schools.read", "support.students.read"]'::jsonb
    OR (jsonb_array_length(p_allowed_capabilities) = 2
      AND NOT (p_allowed_capabilities ? 'support.schools.read'
        AND p_allowed_capabilities ? 'support.students.read'))
    OR char_length(normalized_ticket) NOT BETWEEN 3 AND 128
    OR char_length(normalized_rule) NOT BETWEEN 3 AND 128
    OR char_length(normalized_reason) NOT BETWEEN 3 AND 512
    OR p_valid_until <= opened_at
    OR p_valid_until > opened_at + interval '30 minutes'
  THEN
    RAISE EXCEPTION 'BREAK_GLASS_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT account_session.id INTO account_session_id
  FROM public.accounts AS account
  INNER JOIN public.account_sessions AS account_session
    ON account_session.account_id = account.id
    AND account_session.provider_session_id = actor_session_id
    AND account_session.status = 'active'
    AND account_session.security_version = actor_security_version
    AND account_session.assurance_level = 'aal2'
    AND account_session.reauthenticated_at = verified_reauthenticated_at
    AND account_session.expires_at > opened_at
  INNER JOIN public.platform_access_grants AS platform_grant
    ON platform_grant.id = actor_platform_grant_id
    AND platform_grant.account_id = account.id
    AND platform_grant.role_template_key = 'break_glass_operator'
    AND platform_grant.status = 'active'
    AND platform_grant.valid_from <= opened_at
    AND platform_grant.valid_until >= p_valid_until
  WHERE account.id = actor_account_id
    AND account.status = 'active'
    AND account.security_version = actor_security_version
  FOR SHARE OF account, account_session, platform_grant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BREAK_GLASS_CONTEXT_STALE' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM public.tenants AS tenant
  WHERE tenant.id = p_target_tenant_id AND tenant.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BREAK_GLASS_TENANT_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.tenant_id', p_target_tenant_id::text, true);
  PERFORM set_config('app.support_grant_id', grant_id::text, true);
  INSERT INTO public.support_access_grants (
    id, tenant_id, support_account_id, platform_access_grant_id, kind, status,
    scope_type, education_organization_id, school_id, allowed_capabilities,
    purpose, ticket_reference, emergency_rule_reference, authorized_by_account_id,
    authorized_by_person_id, authorization_reason, valid_from, valid_until,
    bound_account_session_id, opened_at, created_at, updated_at
  ) VALUES (
    grant_id, p_target_tenant_id, actor_account_id, actor_platform_grant_id,
    'break_glass', 'active', p_scope_type, p_education_organization_id, p_school_id,
    p_allowed_capabilities, 'incident_response', normalized_ticket, normalized_rule,
    actor_account_id, NULL, normalized_reason, opened_at, p_valid_until,
    account_session_id, opened_at, opened_at, opened_at
  );
  pending_notification_id := openschool_private.append_support_notification(
    p_target_tenant_id, grant_id, operation_id, 'break_glass_opened',
    actor_account_id, opened_at
  );

  INSERT INTO public.audit_events (
    id, occurred_at, event_version, event_type, outcome, tenant_id,
    education_organization_id, school_id, actor_type, actor_account_id,
    actor_person_id, capability, policy_version, policy_decision, request_id,
    correlation_id, support_grant_id, target_type, target_id, data_classes,
    change_summary, purpose, source, retention_class, content_hash, created_at
  ) VALUES (
    event_id, opened_at, 1, 'support.break_glass.open', 'succeeded', p_target_tenant_id,
    p_education_organization_id, p_school_id, 'support', actor_account_id, NULL,
    'platform.break_glass.open', context_policy_version,
    jsonb_build_object('effect', 'allow', 'queryConstraints', context_policy_constraints),
    context_request_id, context_correlation_id, grant_id, 'support_access_grant',
    grant_id::text, '["internal"]'::jsonb,
    jsonb_build_object('changedFields', jsonb_build_array('status')),
    'incident_response', 'support', 'security', 'pending', opened_at
  );
  INSERT INTO public.audit_outbox (
    id, tenant_id, audit_event_id, audit_event_occurred_at, topic,
    deduplication_key, correlation_id, context, payload, payload_hash,
    status, attempt_count, available_at, created_at, updated_at
  ) VALUES (
    outbox_id, p_target_tenant_id, event_id, opened_at, 'security.context.invalidate',
    'support.break_glass.open:' || grant_id::text, context_correlation_id,
    jsonb_build_object(
      'tenantId', p_target_tenant_id, 'requestId', context_request_id,
      'correlationId', context_correlation_id, 'actorAccountId', actor_account_id,
      'supportGrantId', grant_id
    ),
    jsonb_build_object(
      'auditEventId', event_id, 'eventVersion', 1,
      'eventType', 'support.break_glass.open', 'outcome', 'succeeded',
      'targetType', 'support_access_grant', 'targetId', grant_id
    ),
    'pending', 'pending', 0, opened_at, opened_at, opened_at
  );
  RETURN QUERY SELECT grant_id, p_target_tenant_id, 'active'::text, p_valid_until,
    pending_notification_id, event_id;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."resolve_support_access"(
  p_tenant_id uuid,
  p_support_grant_id uuid,
  p_capability text
)
RETURNS TABLE (
  account_id uuid,
  account_session_id uuid,
  security_version bigint,
  platform_access_grant_id uuid,
  role_template_key text,
  support_grant_id uuid,
  support_kind text,
  purpose text,
  allowed_capabilities jsonb,
  query_constraints jsonb,
  assurance_level text,
  reauthenticated_at timestamp with time zone,
  expires_at timestamp with time zone,
  operation_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  context_identity_provider text := nullif(current_setting('app.identity_provider', true), '');
  context_provider_subject text := nullif(current_setting('app.provider_subject', true), '');
  context_provider_session_id text := nullif(current_setting('app.provider_session_id', true), '');
  context_request_id text := nullif(current_setting('app.request_id', true), '');
  context_correlation_id text := nullif(current_setting('app.correlation_id', true), '');
  context_assurance_level text := nullif(current_setting('app.assurance_level', true), '');
  context_policy_version text := nullif(current_setting('app.policy_version', true), '');
  context_reauthenticated_at timestamp with time zone;
  resolved_at timestamp with time zone := statement_timestamp();
  resolved_account public.accounts%ROWTYPE;
  resolved_session public.account_sessions%ROWTYPE;
  resolved_platform_grant public.platform_access_grants%ROWTYPE;
  resolved_grant public.support_access_grants%ROWTYPE;
  expected_role text;
  exact_constraints jsonb;
  use_operation_id uuid := gen_random_uuid();
  open_operation_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  outbox_id uuid := gen_random_uuid();
BEGIN
  BEGIN
    context_reauthenticated_at := nullif(current_setting('app.reauthenticated_at', true), '')::timestamp with time zone;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'SUPPORT_ACCESS_CONTEXT_INVALID' USING ERRCODE = '22023';
  END;
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_support_access_resolver'
    OR context_identity_provider IS NULL
    OR context_provider_subject IS NULL
    OR context_provider_session_id IS NULL
    OR context_request_id IS NULL
    OR context_correlation_id IS NULL
    OR context_policy_version IS NULL
    OR context_assurance_level <> 'aal2'
    OR context_reauthenticated_at IS NULL
    OR context_reauthenticated_at < resolved_at - interval '15 minutes'
    OR context_reauthenticated_at > resolved_at + interval '1 minute'
    OR p_capability NOT IN ('support.schools.read', 'support.students.read')
  THEN
    RAISE EXCEPTION 'SUPPORT_ACCESS_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
  PERFORM set_config('app.support_grant_id', p_support_grant_id::text, true);

  SELECT account, account_session, platform_grant, support_grant
  INTO resolved_account, resolved_session, resolved_platform_grant, resolved_grant
  FROM public.support_access_grants AS support_grant
  INNER JOIN public.accounts AS account
    ON account.id = support_grant.support_account_id
    AND account.identity_provider = context_identity_provider
    AND account.provider_subject = context_provider_subject
    AND account.status = 'active'
  INNER JOIN public.account_sessions AS account_session
    ON account_session.account_id = account.id
    AND account_session.provider_session_id = context_provider_session_id
    AND account_session.status = 'active'
    AND account_session.security_version = account.security_version
    AND account_session.assurance_level = 'aal2'
    AND account_session.reauthenticated_at = context_reauthenticated_at
    AND account_session.expires_at > resolved_at
  INNER JOIN public.platform_access_grants AS platform_grant
    ON platform_grant.id = support_grant.platform_access_grant_id
    AND platform_grant.account_id = account.id
    AND platform_grant.status = 'active'
    AND platform_grant.valid_from <= resolved_at
    AND platform_grant.valid_until > resolved_at
  INNER JOIN public.tenants AS tenant
    ON tenant.id = support_grant.tenant_id
    AND tenant.status = 'active'
  WHERE support_grant.id = p_support_grant_id
    AND support_grant.tenant_id = p_tenant_id
    AND support_grant.status IN ('approved', 'active')
    AND support_grant.valid_from <= resolved_at
    AND support_grant.valid_until > resolved_at
    AND support_grant.allowed_capabilities ? p_capability
  FOR UPDATE OF support_grant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  expected_role := CASE resolved_grant.kind
    WHEN 'support' THEN 'support_agent'
    WHEN 'break_glass' THEN 'break_glass_operator'
    ELSE NULL
  END;
  IF expected_role IS NULL OR resolved_platform_grant.role_template_key <> expected_role THEN
    RAISE EXCEPTION 'SUPPORT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF resolved_grant.status = 'active'
    AND resolved_grant.bound_account_session_id <> resolved_session.id
  THEN
    RAISE EXCEPTION 'SUPPORT_ACCESS_SESSION_REUSED' USING ERRCODE = '42501';
  END IF;

  exact_constraints := CASE resolved_grant.scope_type
    WHEN 'tenant' THEN jsonb_build_array(jsonb_build_object(
      'kind', 'tenant', 'tenantId', resolved_grant.tenant_id
    ))
    WHEN 'organization_subtree' THEN jsonb_build_array(jsonb_build_object(
      'kind', 'organization_subtree', 'tenantId', resolved_grant.tenant_id,
      'ancestorOrganizationId', resolved_grant.education_organization_id
    ))
    WHEN 'school' THEN jsonb_build_array(jsonb_build_object(
      'kind', 'school', 'tenantId', resolved_grant.tenant_id,
      'schoolId', resolved_grant.school_id
    ))
  END;

  PERFORM set_config('app.account_id', resolved_account.id::text, true);
  PERFORM set_config('app.person_id', '', true);
  IF resolved_grant.status = 'approved' THEN
    UPDATE public.support_access_grants
    SET status = 'active', bound_account_session_id = resolved_session.id,
      opened_at = resolved_at, updated_at = resolved_at
    WHERE id = p_support_grant_id;
    PERFORM openschool_private.append_support_notification(
      p_tenant_id, p_support_grant_id, open_operation_id, 'opened',
      resolved_account.id, resolved_at
    );
  END IF;
  PERFORM openschool_private.append_support_notification(
    p_tenant_id, p_support_grant_id, use_operation_id, 'used',
    resolved_account.id, resolved_at
  );

  INSERT INTO public.audit_events (
    id, occurred_at, event_version, event_type, outcome, tenant_id,
    education_organization_id, school_id, actor_type, actor_account_id,
    actor_person_id, capability, policy_version, policy_decision, request_id,
    correlation_id, support_grant_id, target_type, target_id, data_classes,
    change_summary, purpose, source, retention_class, content_hash, created_at
  ) VALUES (
    event_id, resolved_at, 1, 'support.session.use.intent', 'attempted', p_tenant_id,
    resolved_grant.education_organization_id, resolved_grant.school_id,
    'support', resolved_account.id, NULL, p_capability, context_policy_version,
    jsonb_build_object('effect', 'allow', 'queryConstraints', exact_constraints),
    context_request_id, context_correlation_id, p_support_grant_id, 'support_session',
    use_operation_id::text,
    CASE WHEN p_capability = 'support.students.read'
      THEN '["student_personal"]'::jsonb ELSE '["internal"]'::jsonb END,
    jsonb_build_object('changedFields', jsonb_build_array('access')),
    resolved_grant.purpose, 'support', 'security', 'pending', resolved_at
  );
  INSERT INTO public.audit_outbox (
    id, tenant_id, audit_event_id, audit_event_occurred_at, topic,
    deduplication_key, correlation_id, context, payload, payload_hash,
    status, attempt_count, available_at, created_at, updated_at
  ) VALUES (
    outbox_id, p_tenant_id, event_id, resolved_at, 'security.support_access',
    'support.session.use:' || p_support_grant_id::text || ':' || context_request_id,
    context_correlation_id,
    jsonb_build_object(
      'tenantId', p_tenant_id, 'requestId', context_request_id,
      'correlationId', context_correlation_id, 'actorAccountId', resolved_account.id,
      'supportGrantId', p_support_grant_id
    ),
    jsonb_build_object(
      'auditEventId', event_id, 'eventVersion', 1,
      'eventType', 'support.session.use.intent', 'outcome', 'attempted',
      'targetType', 'support_session', 'targetId', use_operation_id
    ),
    'pending', 'pending', 0, resolved_at, resolved_at, resolved_at
  );

  RETURN QUERY SELECT
    resolved_account.id, resolved_session.id, resolved_account.security_version,
    resolved_platform_grant.id, resolved_platform_grant.role_template_key,
    resolved_grant.id, resolved_grant.kind, resolved_grant.purpose,
    resolved_grant.allowed_capabilities, exact_constraints,
    resolved_session.assurance_level, resolved_session.reauthenticated_at,
    least(resolved_session.expires_at, resolved_platform_grant.valid_until, resolved_grant.valid_until),
    use_operation_id;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."close_support_access"(
  p_tenant_id uuid,
  p_support_grant_id uuid,
  p_close_reason text
)
RETURNS TABLE (
  support_grant_id uuid,
  status text,
  notification_id uuid,
  audit_event_id uuid,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  context_identity_provider text := nullif(current_setting('app.identity_provider', true), '');
  context_provider_subject text := nullif(current_setting('app.provider_subject', true), '');
  context_provider_session_id text := nullif(current_setting('app.provider_session_id', true), '');
  context_request_id text := nullif(current_setting('app.request_id', true), '');
  context_correlation_id text := nullif(current_setting('app.correlation_id', true), '');
  context_policy_version text := nullif(current_setting('app.policy_version', true), '');
  context_reauthenticated_at timestamp with time zone;
  changed_at timestamp with time zone := statement_timestamp();
  resolved_account public.accounts%ROWTYPE;
  resolved_session public.account_sessions%ROWTYPE;
  resolved_grant public.support_access_grants%ROWTYPE;
  operation_id uuid := gen_random_uuid();
  pending_notification_id uuid;
  event_id uuid := gen_random_uuid();
  outbox_id uuid := gen_random_uuid();
  normalized_reason text := btrim(p_close_reason);
BEGIN
  BEGIN
    context_reauthenticated_at := nullif(current_setting('app.reauthenticated_at', true), '')::timestamp with time zone;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'SUPPORT_ACCESS_CONTEXT_INVALID' USING ERRCODE = '22023';
  END;
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_support_access_resolver'
    OR context_identity_provider IS NULL OR context_provider_subject IS NULL
    OR context_provider_session_id IS NULL OR context_request_id IS NULL
    OR context_correlation_id IS NULL OR context_policy_version IS NULL
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'support.sessions.use'
    OR context_reauthenticated_at IS NULL
    OR context_reauthenticated_at < changed_at - interval '15 minutes'
    OR context_reauthenticated_at > changed_at + interval '1 minute'
    OR char_length(normalized_reason) NOT BETWEEN 3 AND 512
  THEN
    RAISE EXCEPTION 'SUPPORT_ACCESS_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
  PERFORM set_config('app.support_grant_id', p_support_grant_id::text, true);
  SELECT account, account_session, support_grant
  INTO resolved_account, resolved_session, resolved_grant
  FROM public.support_access_grants AS support_grant
  INNER JOIN public.accounts AS account
    ON account.id = support_grant.support_account_id
    AND account.identity_provider = context_identity_provider
    AND account.provider_subject = context_provider_subject
    AND account.status = 'active'
  INNER JOIN public.account_sessions AS account_session
    ON account_session.account_id = account.id
    AND account_session.provider_session_id = context_provider_session_id
    AND account_session.status = 'active'
    AND account_session.security_version = account.security_version
    AND account_session.assurance_level = 'aal2'
    AND account_session.reauthenticated_at = context_reauthenticated_at
    AND account_session.expires_at > changed_at
  INNER JOIN public.platform_access_grants AS platform_grant
    ON platform_grant.id = support_grant.platform_access_grant_id
    AND platform_grant.account_id = account.id
    AND platform_grant.status = 'active'
    AND platform_grant.valid_from <= changed_at
    AND platform_grant.valid_until > changed_at
    AND platform_grant.role_template_key = CASE support_grant.kind
      WHEN 'support' THEN 'support_agent' ELSE 'break_glass_operator' END
  WHERE support_grant.id = p_support_grant_id
    AND support_grant.tenant_id = p_tenant_id
    AND support_grant.status = 'active'
    AND support_grant.bound_account_session_id = account_session.id
  FOR UPDATE OF support_grant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.account_id', resolved_account.id::text, true);
  PERFORM set_config('app.person_id', '', true);
  UPDATE public.support_access_grants
  SET status = 'closed', closed_at = changed_at,
    closed_by_account_id = resolved_account.id, closed_by_person_id = NULL,
    close_reason = normalized_reason, review_status = 'pending', updated_at = changed_at
  WHERE id = p_support_grant_id;
  pending_notification_id := openschool_private.append_support_notification(
    p_tenant_id, p_support_grant_id, operation_id, 'closed',
    resolved_account.id, changed_at
  );

  INSERT INTO public.audit_events (
    id, occurred_at, event_version, event_type, outcome, tenant_id,
    education_organization_id, school_id, actor_type, actor_account_id,
    actor_person_id, capability, policy_version, policy_decision, request_id,
    correlation_id, support_grant_id, target_type, target_id, data_classes,
    change_summary, purpose, source, retention_class, content_hash, created_at
  ) VALUES (
    event_id, changed_at, 1, 'support.session.close', 'succeeded', p_tenant_id,
    resolved_grant.education_organization_id, resolved_grant.school_id,
    'support', resolved_account.id, NULL, 'support.sessions.use', context_policy_version,
    jsonb_build_object('effect', 'allow'), context_request_id, context_correlation_id,
    p_support_grant_id, 'support_access_grant', p_support_grant_id::text,
    '["internal"]'::jsonb,
    jsonb_build_object('changedFields', jsonb_build_array('status')),
    resolved_grant.purpose, 'support', 'security', 'pending', changed_at
  );
  INSERT INTO public.audit_outbox (
    id, tenant_id, audit_event_id, audit_event_occurred_at, topic,
    deduplication_key, correlation_id, context, payload, payload_hash,
    status, attempt_count, available_at, created_at, updated_at
  ) VALUES (
    outbox_id, p_tenant_id, event_id, changed_at, 'security.context.invalidate',
    'support.session.close:' || p_support_grant_id::text, context_correlation_id,
    jsonb_build_object(
      'tenantId', p_tenant_id, 'requestId', context_request_id,
      'correlationId', context_correlation_id, 'actorAccountId', resolved_account.id,
      'supportGrantId', p_support_grant_id
    ),
    jsonb_build_object(
      'auditEventId', event_id, 'eventVersion', 1,
      'eventType', 'support.session.close', 'outcome', 'succeeded',
      'targetType', 'support_access_grant', 'targetId', p_support_grant_id
    ),
    'pending', 'pending', 0, changed_at, changed_at, changed_at
  );
  RETURN QUERY SELECT p_support_grant_id, 'closed'::text,
    pending_notification_id, event_id, changed_at;
END;
$$;--> statement-breakpoint

CREATE POLICY "audit_events_support_expiry_insert"
  ON "audit_events" AS PERMISSIVE FOR INSERT TO "openschool_support_grant_manager"
  WITH CHECK (
    current_user = 'openschool_support_grant_manager'
    AND session_user = 'openschool_worker'
    AND "audit_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND "audit_events"."actor_type" = 'worker'
    AND "audit_events"."actor_account_id" IS NULL
    AND "audit_events"."actor_person_id" IS NULL
    AND "audit_events"."request_id" = nullif(current_setting('app.request_id', true), '')
    AND "audit_events"."target_type" = 'support_access_grant'
    AND "audit_events"."source" = 'worker'
  );--> statement-breakpoint
CREATE POLICY "audit_outbox_support_expiry_insert"
  ON "audit_outbox" AS PERMISSIVE FOR INSERT TO "openschool_support_grant_manager"
  WITH CHECK (
    current_user = 'openschool_support_grant_manager'
    AND session_user = 'openschool_worker'
    AND "audit_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND "audit_outbox"."context" ->> 'requestId' = nullif(current_setting('app.request_id', true), '')
  );--> statement-breakpoint

CREATE FUNCTION "openschool_private"."expire_support_access_grant"(p_support_grant_id uuid)
RETURNS TABLE (
  support_grant_id uuid,
  status text,
  notification_id uuid,
  audit_event_id uuid,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  context_tenant_id uuid;
  changed_at timestamp with time zone := statement_timestamp();
  target_grant public.support_access_grants%ROWTYPE;
  operation_id uuid := gen_random_uuid();
  pending_notification_id uuid;
  event_id uuid := gen_random_uuid();
  outbox_id uuid := gen_random_uuid();
  context_request_id text := nullif(current_setting('app.request_id', true), '');
  context_job_id text := nullif(current_setting('app.job_id', true), '');
BEGIN
  BEGIN
    context_tenant_id := nullif(current_setting('app.tenant_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'SUPPORT_EXPIRY_CONTEXT_INVALID' USING ERRCODE = '22023';
  END;
  IF session_user <> 'openschool_worker'
    OR current_user <> 'openschool_support_grant_manager'
    OR context_tenant_id IS NULL
    OR context_request_id IS NULL
    OR context_job_id IS NULL
    OR nullif(current_setting('app.job_type', true), '') <> 'support_access_expiry'
  THEN
    RAISE EXCEPTION 'SUPPORT_EXPIRY_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.support_grant_id', p_support_grant_id::text, true);
  SELECT candidate.* INTO target_grant
  FROM public.support_access_grants AS candidate
  WHERE candidate.tenant_id = context_tenant_id
    AND candidate.id = p_support_grant_id
    AND candidate.status IN ('approved', 'active')
    AND candidate.valid_until <= changed_at
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_EXPIRY_NOT_DUE' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.support_access_grants
  SET status = 'expired', closed_at = changed_at, closed_by_account_id = NULL,
    closed_by_person_id = NULL, close_reason = 'automatic_expiry',
    review_status = 'pending', updated_at = changed_at
  WHERE id = p_support_grant_id;
  pending_notification_id := openschool_private.append_support_notification(
    context_tenant_id, p_support_grant_id, operation_id, 'expired', NULL, changed_at
  );

  INSERT INTO public.audit_events (
    id, occurred_at, event_version, event_type, outcome, tenant_id,
    education_organization_id, school_id, actor_type, actor_account_id,
    actor_person_id, capability, policy_version, policy_decision, request_id,
    correlation_id, target_type, target_id, data_classes, change_summary,
    purpose, source, retention_class, content_hash, created_at
  ) VALUES (
    event_id, changed_at, 1, 'support.grant.expire', 'succeeded', context_tenant_id,
    target_grant.education_organization_id, target_grant.school_id,
    'worker', NULL, NULL, NULL, NULL, NULL, context_request_id, context_job_id,
    'support_access_grant', p_support_grant_id::text, '["internal"]'::jsonb,
    jsonb_build_object('changedFields', jsonb_build_array('status')),
    target_grant.purpose, 'worker', 'security', 'pending', changed_at
  );
  INSERT INTO public.audit_outbox (
    id, tenant_id, audit_event_id, audit_event_occurred_at, topic,
    deduplication_key, correlation_id, context, payload, payload_hash,
    status, attempt_count, available_at, created_at, updated_at
  ) VALUES (
    outbox_id, context_tenant_id, event_id, changed_at, 'security.context.invalidate',
    'support.grant.expire:' || p_support_grant_id::text, context_job_id,
    jsonb_build_object(
      'tenantId', context_tenant_id, 'requestId', context_request_id,
      'correlationId', context_job_id, 'jobId', context_job_id
    ),
    jsonb_build_object(
      'auditEventId', event_id, 'eventVersion', 1,
      'eventType', 'support.grant.expire', 'outcome', 'succeeded',
      'targetType', 'support_access_grant', 'targetId', p_support_grant_id
    ),
    'pending', 'pending', 0, changed_at, changed_at, changed_at
  );
  RETURN QUERY SELECT p_support_grant_id, 'expired'::text,
    pending_notification_id, event_id, changed_at;
END;
$$;--> statement-breakpoint

GRANT SELECT ON TABLE
  public.accounts, public.account_sessions, public.account_links, public.people,
  public.affiliations, public.role_template_assignments, public.platform_access_grants,
  public.tenants, public.education_organizations, public.organization_tree_versions,
  public.organization_tree_closure, public.school_governance_assignments, public.schools,
  public.support_access_grants
  TO "openschool_support_grant_manager";--> statement-breakpoint
GRANT INSERT, UPDATE ON TABLE public.support_access_grants
  TO "openschool_support_grant_manager";--> statement-breakpoint
GRANT INSERT ON TABLE
  public.support_access_notifications, public.support_notification_outbox,
  public.audit_events, public.audit_outbox
  TO "openschool_support_grant_manager";--> statement-breakpoint

GRANT SELECT ON TABLE
  public.accounts, public.account_sessions, public.platform_access_grants,
  public.tenants, public.support_access_grants
  TO "openschool_support_access_resolver";--> statement-breakpoint
GRANT UPDATE ON TABLE public.support_access_grants
  TO "openschool_support_access_resolver";--> statement-breakpoint
GRANT INSERT ON TABLE
  public.support_access_notifications, public.support_notification_outbox,
  public.audit_events, public.audit_outbox
  TO "openschool_support_access_resolver";--> statement-breakpoint

GRANT USAGE, CREATE ON SCHEMA "openschool_private"
  TO "openschool_support_grant_manager", "openschool_support_access_resolver";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."append_support_notification"(uuid, uuid, uuid, text, uuid, timestamp with time zone)
  OWNER TO "openschool_support_grant_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."tenant_admin_can_manage_support"(uuid, uuid, text, uuid, uuid, timestamp with time zone)
  OWNER TO "openschool_support_grant_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."issue_support_access_grant"(uuid, text, uuid, uuid, jsonb, text, text, text, timestamp with time zone)
  OWNER TO "openschool_support_grant_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."revoke_support_access_grant"(uuid, text)
  OWNER TO "openschool_support_grant_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."review_support_access_grant"(uuid, text, text)
  OWNER TO "openschool_support_grant_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."open_break_glass_access"(uuid, text, uuid, uuid, jsonb, text, text, text, timestamp with time zone)
  OWNER TO "openschool_support_grant_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."expire_support_access_grant"(uuid)
  OWNER TO "openschool_support_grant_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."resolve_support_access"(uuid, uuid, text)
  OWNER TO "openschool_support_access_resolver";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."close_support_access"(uuid, uuid, text)
  OWNER TO "openschool_support_access_resolver";--> statement-breakpoint
REVOKE CREATE ON SCHEMA "openschool_private"
  FROM "openschool_support_grant_manager", "openschool_support_access_resolver";--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_private"."append_support_notification"(uuid, uuid, uuid, text, uuid, timestamp with time zone) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."tenant_admin_can_manage_support"(uuid, uuid, text, uuid, uuid, timestamp with time zone) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."issue_support_access_grant"(uuid, text, uuid, uuid, jsonb, text, text, text, timestamp with time zone) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."revoke_support_access_grant"(uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."review_support_access_grant"(uuid, text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."open_break_glass_access"(uuid, text, uuid, uuid, jsonb, text, text, text, timestamp with time zone) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."expire_support_access_grant"(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."resolve_support_access"(uuid, uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."close_support_access"(uuid, uuid, text) FROM PUBLIC;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION "openschool_private"."issue_support_access_grant"(uuid, text, uuid, uuid, jsonb, text, text, text, timestamp with time zone)
  TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."revoke_support_access_grant"(uuid, text)
  TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."review_support_access_grant"(uuid, text, text)
  TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."open_break_glass_access"(uuid, text, uuid, uuid, jsonb, text, text, text, timestamp with time zone)
  TO "openschool_control_plane";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."resolve_support_access"(uuid, uuid, text)
  TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."close_support_access"(uuid, uuid, text)
  TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."expire_support_access_grant"(uuid)
  TO "openschool_worker";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."append_support_notification"(uuid, uuid, uuid, text, uuid, timestamp with time zone)
  TO "openschool_support_grant_manager", "openschool_support_access_resolver";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."tenant_admin_can_manage_support"(uuid, uuid, text, uuid, uuid, timestamp with time zone)
  TO "openschool_support_grant_manager";--> statement-breakpoint

REVOKE ALL ON TABLE
  public.support_access_grants, public.support_access_notifications,
  public.support_notification_outbox
  FROM PUBLIC, "openschool_runtime", "openschool_control_plane";--> statement-breakpoint
GRANT SELECT ON TABLE public.support_access_notifications TO "openschool_runtime";--> statement-breakpoint
GRANT SELECT ON TABLE
  public.support_access_grants, public.support_access_notifications,
  public.support_notification_outbox
  TO "openschool_worker";--> statement-breakpoint
GRANT UPDATE ON TABLE public.support_access_grants, public.support_notification_outbox
  TO "openschool_worker";--> statement-breakpoint
GRANT INSERT ON TABLE public.support_access_notifications, public.support_notification_outbox
  TO "openschool_worker";--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_guard_support_access_grant_transition"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_guard_support_notification_outbox_change"() FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."list_support_access_grants"(p_limit integer DEFAULT 50)
RETURNS TABLE (
  support_grant_id uuid,
  support_account_id uuid,
  support_account_email text,
  kind text,
  status text,
  scope_type text,
  education_organization_id uuid,
  school_id uuid,
  allowed_capabilities jsonb,
  purpose text,
  ticket_reference text,
  authorization_reason text,
  valid_from timestamp with time zone,
  valid_until timestamp with time zone,
  opened_at timestamp with time zone,
  closed_at timestamp with time zone,
  close_reason text,
  revoked_at timestamp with time zone,
  revocation_reason text,
  review_status text,
  review_outcome text,
  review_notes text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  actor_account_id uuid;
  actor_person_id uuid;
  context_tenant_id uuid;
  context_reauthenticated_at timestamp with time zone;
  resolved_at timestamp with time zone := statement_timestamp();
BEGIN
  BEGIN
    actor_account_id := nullif(current_setting('app.account_id', true), '')::uuid;
    actor_person_id := nullif(current_setting('app.person_id', true), '')::uuid;
    context_tenant_id := nullif(current_setting('app.tenant_id', true), '')::uuid;
    context_reauthenticated_at := nullif(current_setting('app.reauthenticated_at', true), '')::timestamp with time zone;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_CONTEXT_INVALID' USING ERRCODE = '22023';
  END;
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_support_grant_manager'
    OR actor_account_id IS NULL OR actor_person_id IS NULL OR context_tenant_id IS NULL
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.support.grants.manage'
    OR context_reauthenticated_at IS NULL
    OR context_reauthenticated_at < resolved_at - interval '15 minutes'
    OR context_reauthenticated_at > resolved_at + interval '1 minute'
    OR p_limit NOT BETWEEN 1 AND 100
  THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM 1
  FROM public.accounts AS account
  INNER JOIN public.account_links AS account_link
    ON account_link.account_id = account.id
    AND account_link.tenant_id = context_tenant_id
    AND account_link.person_id = actor_person_id
    AND account_link.status = 'active'
    AND account_link.valid_from <= resolved_at
    AND (account_link.valid_until IS NULL OR account_link.valid_until > resolved_at)
  WHERE account.id = actor_account_id AND account.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_GRANT_CONTEXT_STALE' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    support_grant.id, support_grant.support_account_id, support_account.primary_email,
    support_grant.kind, support_grant.status, support_grant.scope_type,
    support_grant.education_organization_id, support_grant.school_id,
    support_grant.allowed_capabilities, support_grant.purpose,
    support_grant.ticket_reference, support_grant.authorization_reason,
    support_grant.valid_from, support_grant.valid_until, support_grant.opened_at,
    support_grant.closed_at, support_grant.close_reason, support_grant.revoked_at,
    support_grant.revocation_reason, support_grant.review_status,
    support_grant.review_outcome, support_grant.review_notes, support_grant.created_at
  FROM public.support_access_grants AS support_grant
  INNER JOIN public.accounts AS support_account ON support_account.id = support_grant.support_account_id
  WHERE support_grant.tenant_id = context_tenant_id
    AND openschool_private.tenant_admin_can_manage_support(
      context_tenant_id, actor_person_id, support_grant.scope_type,
      support_grant.education_organization_id, support_grant.school_id, resolved_at
    )
  ORDER BY support_grant.created_at DESC, support_grant.id DESC
  LIMIT p_limit;
END;
$$;--> statement-breakpoint

GRANT USAGE, CREATE ON SCHEMA "openschool_private" TO "openschool_support_grant_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."list_support_access_grants"(integer)
  OWNER TO "openschool_support_grant_manager";--> statement-breakpoint
REVOKE CREATE ON SCHEMA "openschool_private" FROM "openschool_support_grant_manager";--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."list_support_access_grants"(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."list_support_access_grants"(integer)
  TO "openschool_runtime";
