CREATE TABLE "person_merge_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_school_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"event_type" text NOT NULL,
	"operation_status" text NOT NULL,
	"preview_digest" text NOT NULL,
	"reason" text NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_merge_events_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "person_merge_events_operation_version_unique" UNIQUE("tenant_id","operation_id","version"),
	CONSTRAINT "person_merge_events_version_check" CHECK ("person_merge_events"."version" > 0),
	CONSTRAINT "person_merge_events_type_check" CHECK ("person_merge_events"."event_type" IN ('preview_created', 'approval_granted', 'executed', 'reversal_requested', 'reversed', 'manual_recovery_required')),
	CONSTRAINT "person_merge_events_status_check" CHECK ("person_merge_events"."operation_status" IN ('blocked', 'pending_approval', 'approved', 'executed', 'reversed', 'manual_recovery')),
	CONSTRAINT "person_merge_events_hash_check" CHECK ("person_merge_events"."preview_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "person_merge_events_reason_check" CHECK (char_length(btrim("person_merge_events"."reason")) BETWEEN 3 AND 512)
);
--> statement-breakpoint
ALTER TABLE "person_merge_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "person_merge_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_school_id" uuid NOT NULL,
	"duplicate_case_id" uuid NOT NULL,
	"duplicate_case_version" integer NOT NULL,
	"duplicate_evidence_hash" text NOT NULL,
	"source_person_id" uuid NOT NULL,
	"target_person_id" uuid NOT NULL,
	"status" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"preview_digest" text NOT NULL,
	"dependency_count" integer DEFAULT 0 NOT NULL,
	"conflict_count" integer DEFAULT 0 NOT NULL,
	"initiated_by_account_id" uuid NOT NULL,
	"initiation_reason" text NOT NULL,
	"approved_by_account_id" uuid,
	"approval_reason" text,
	"approved_at" timestamp with time zone,
	"executed_by_account_id" uuid,
	"executed_at" timestamp with time zone,
	"reversed_by_account_id" uuid,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_merge_operations_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "person_merge_operations_status_check" CHECK ("person_merge_operations"."status" IN ('blocked', 'pending_approval', 'approved', 'executed', 'reversed', 'manual_recovery')),
	CONSTRAINT "person_merge_operations_people_check" CHECK ("person_merge_operations"."source_person_id" <> "person_merge_operations"."target_person_id"),
	CONSTRAINT "person_merge_operations_version_check" CHECK ("person_merge_operations"."current_version" > 0),
	CONSTRAINT "person_merge_operations_hash_check" CHECK ("person_merge_operations"."duplicate_evidence_hash" ~ '^[0-9a-f]{64}$' AND "person_merge_operations"."preview_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "person_merge_operations_count_check" CHECK ("person_merge_operations"."dependency_count" >= 0 AND "person_merge_operations"."conflict_count" >= 0 AND "person_merge_operations"."conflict_count" <= "person_merge_operations"."dependency_count"),
	CONSTRAINT "person_merge_operations_reason_check" CHECK (char_length(btrim("person_merge_operations"."initiation_reason")) BETWEEN 3 AND 512
        AND ("person_merge_operations"."approval_reason" IS NULL OR char_length(btrim("person_merge_operations"."approval_reason")) BETWEEN 3 AND 512)),
	CONSTRAINT "person_merge_operations_approval_check" CHECK (("person_merge_operations"."status" NOT IN ('approved', 'executed', 'reversed', 'manual_recovery'))
        OR ("person_merge_operations"."approved_by_account_id" IS NOT NULL AND "person_merge_operations"."approval_reason" IS NOT NULL
          AND "person_merge_operations"."approved_at" IS NOT NULL AND "person_merge_operations"."approved_by_account_id" <> "person_merge_operations"."initiated_by_account_id")),
	CONSTRAINT "person_merge_operations_execution_check" CHECK ("person_merge_operations"."status" NOT IN ('executed', 'reversed', 'manual_recovery')
        OR ("person_merge_operations"."executed_by_account_id" IS NOT NULL AND "person_merge_operations"."executed_at" IS NOT NULL)),
	CONSTRAINT "person_merge_operations_reversal_check" CHECK ("person_merge_operations"."status" <> 'reversed'
        OR ("person_merge_operations"."reversed_by_account_id" IS NOT NULL AND "person_merge_operations"."reversed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "person_merge_operations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "person_merge_preview_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_school_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"category" text NOT NULL,
	"relation_name" text NOT NULL,
	"record_key" text NOT NULL,
	"direction" text DEFAULT 'none' NOT NULL,
	"disposition" text NOT NULL,
	"conflict_code" text,
	"row_fingerprint" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_merge_preview_items_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "person_merge_preview_items_operation_record_unique" UNIQUE("tenant_id","operation_id","relation_name","record_key","direction"),
	CONSTRAINT "person_merge_preview_items_category_check" CHECK ("person_merge_preview_items"."category" IN ('account_link', 'profile', 'affiliation', 'relationship', 'household_membership', 'school_enrollment', 'section_staff', 'section_roster', 'invitation', 'authorization_history', 'academic_history', 'duplicate_case', 'audit_history', 'compatibility_evidence')),
	CONSTRAINT "person_merge_preview_items_direction_check" CHECK ("person_merge_preview_items"."direction" IN ('source', 'subject', 'related', 'actor', 'none')),
	CONSTRAINT "person_merge_preview_items_disposition_check" CHECK ("person_merge_preview_items"."disposition" IN ('move', 'end_and_recreate', 'preserve_history', 'block')),
	CONSTRAINT "person_merge_preview_items_text_check" CHECK (char_length("person_merge_preview_items"."relation_name") BETWEEN 3 AND 128
        AND char_length("person_merge_preview_items"."record_key") BETWEEN 1 AND 512
        AND ("person_merge_preview_items"."conflict_code" IS NULL OR "person_merge_preview_items"."conflict_code" ~ '^[A-Z][A-Z0-9_]{2,127}$')),
	CONSTRAINT "person_merge_preview_items_hash_check" CHECK ("person_merge_preview_items"."row_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "person_merge_preview_items_conflict_check" CHECK (("person_merge_preview_items"."disposition" = 'block') = ("person_merge_preview_items"."conflict_code" IS NOT NULL)),
	CONSTRAINT "person_merge_preview_items_metadata_check" CHECK (jsonb_typeof("person_merge_preview_items"."metadata") = 'object')
);
--> statement-breakpoint
ALTER TABLE "person_merge_preview_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "person_merge_events" ADD CONSTRAINT "person_merge_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_events" ADD CONSTRAINT "person_merge_events_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_events" ADD CONSTRAINT "person_merge_events_tenant_operation_fk" FOREIGN KEY ("tenant_id","operation_id") REFERENCES "public"."person_merge_operations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_events" ADD CONSTRAINT "person_merge_events_tenant_school_fk" FOREIGN KEY ("tenant_id","review_school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD CONSTRAINT "person_merge_operations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD CONSTRAINT "person_merge_operations_initiated_by_account_id_accounts_id_fk" FOREIGN KEY ("initiated_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD CONSTRAINT "person_merge_operations_approved_by_account_id_accounts_id_fk" FOREIGN KEY ("approved_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD CONSTRAINT "person_merge_operations_executed_by_account_id_accounts_id_fk" FOREIGN KEY ("executed_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD CONSTRAINT "person_merge_operations_reversed_by_account_id_accounts_id_fk" FOREIGN KEY ("reversed_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD CONSTRAINT "person_merge_operations_tenant_school_fk" FOREIGN KEY ("tenant_id","review_school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD CONSTRAINT "person_merge_operations_tenant_case_fk" FOREIGN KEY ("tenant_id","duplicate_case_id") REFERENCES "public"."person_duplicate_cases"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD CONSTRAINT "person_merge_operations_tenant_source_fk" FOREIGN KEY ("tenant_id","source_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD CONSTRAINT "person_merge_operations_tenant_target_fk" FOREIGN KEY ("tenant_id","target_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_preview_items" ADD CONSTRAINT "person_merge_preview_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_preview_items" ADD CONSTRAINT "person_merge_preview_items_tenant_operation_fk" FOREIGN KEY ("tenant_id","operation_id") REFERENCES "public"."person_merge_operations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_preview_items" ADD CONSTRAINT "person_merge_preview_items_tenant_school_fk" FOREIGN KEY ("tenant_id","review_school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "person_merge_events_operation_idx" ON "person_merge_events" USING btree ("tenant_id","operation_id","version","id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_merge_operations_active_source_unique" ON "person_merge_operations" USING btree ("tenant_id","source_person_id") WHERE "person_merge_operations"."status" IN ('pending_approval', 'approved', 'executed');--> statement-breakpoint
CREATE INDEX "person_merge_operations_school_status_idx" ON "person_merge_operations" USING btree ("tenant_id","review_school_id","status","updated_at","id");--> statement-breakpoint
CREATE INDEX "person_merge_operations_case_idx" ON "person_merge_operations" USING btree ("tenant_id","duplicate_case_id","created_at","id");--> statement-breakpoint
CREATE INDEX "person_merge_preview_items_operation_idx" ON "person_merge_preview_items" USING btree ("tenant_id","operation_id","category","id");--> statement-breakpoint
CREATE POLICY "person_merge_events_runtime_select" ON "person_merge_events" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "person_merge_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve'
  )

  AND public.openschool_school_scope_allows("person_merge_events"."tenant_id", "person_merge_events"."review_school_id")
);--> statement-breakpoint
CREATE POLICY "person_merge_events_runtime_write_deny" ON "person_merge_events" AS PERMISSIVE FOR ALL TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "person_merge_events_manager_all" ON "person_merge_events" AS PERMISSIVE FOR ALL TO "openschool_person_merge_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND "person_merge_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve'
  )

  AND public.openschool_school_scope_allows("person_merge_events"."tenant_id", "person_merge_events"."review_school_id")
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND "person_merge_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve'
  )

  AND public.openschool_school_scope_allows("person_merge_events"."tenant_id", "person_merge_events"."review_school_id")
);--> statement-breakpoint
CREATE POLICY "person_merge_operations_runtime_select" ON "person_merge_operations" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "person_merge_operations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve'
  )

  AND public.openschool_school_scope_allows("person_merge_operations"."tenant_id", "person_merge_operations"."review_school_id")
);--> statement-breakpoint
CREATE POLICY "person_merge_operations_runtime_write_deny" ON "person_merge_operations" AS PERMISSIVE FOR ALL TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "person_merge_operations_manager_all" ON "person_merge_operations" AS PERMISSIVE FOR ALL TO "openschool_person_merge_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND "person_merge_operations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve'
  )

  AND public.openschool_school_scope_allows("person_merge_operations"."tenant_id", "person_merge_operations"."review_school_id")
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND "person_merge_operations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve'
  )

  AND public.openschool_school_scope_allows("person_merge_operations"."tenant_id", "person_merge_operations"."review_school_id")
);--> statement-breakpoint
CREATE POLICY "person_merge_preview_items_runtime_select" ON "person_merge_preview_items" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "person_merge_preview_items"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve'
  )

  AND public.openschool_school_scope_allows("person_merge_preview_items"."tenant_id", "person_merge_preview_items"."review_school_id")
);--> statement-breakpoint
CREATE POLICY "person_merge_preview_items_runtime_write_deny" ON "person_merge_preview_items" AS PERMISSIVE FOR ALL TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "person_merge_preview_items_manager_all" ON "person_merge_preview_items" AS PERMISSIVE FOR ALL TO "openschool_person_merge_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND "person_merge_preview_items"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve'
  )

  AND public.openschool_school_scope_allows("person_merge_preview_items"."tenant_id", "person_merge_preview_items"."review_school_id")
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND "person_merge_preview_items"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve'
  )

  AND public.openschool_school_scope_allows("person_merge_preview_items"."tenant_id", "person_merge_preview_items"."review_school_id")
);
--> statement-breakpoint
ALTER TABLE "person_merge_operations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "person_merge_preview_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "person_merge_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "person_merge_operations", "person_merge_preview_items", "person_merge_events" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON TABLE "person_merge_operations", "person_merge_preview_items", "person_merge_events" TO "openschool_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "person_merge_operations" TO "openschool_person_merge_manager";
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "person_merge_preview_items", "person_merge_events" TO "openschool_person_merge_manager";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "openschool_private"."reject_person_merge_append_only_change"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'person merge evidence is append-only' USING ERRCODE = '42501';
END;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "openschool_private"."protect_person_merge_operation_anchors"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.review_school_id IS DISTINCT FROM NEW.review_school_id
    OR OLD.duplicate_case_id IS DISTINCT FROM NEW.duplicate_case_id
    OR OLD.duplicate_case_version IS DISTINCT FROM NEW.duplicate_case_version
    OR OLD.duplicate_evidence_hash IS DISTINCT FROM NEW.duplicate_evidence_hash
    OR OLD.source_person_id IS DISTINCT FROM NEW.source_person_id
    OR OLD.target_person_id IS DISTINCT FROM NEW.target_person_id
    OR OLD.initiated_by_account_id IS DISTINCT FROM NEW.initiated_by_account_id
    OR OLD.initiation_reason IS DISTINCT FROM NEW.initiation_reason
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'person merge operation anchors are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."reject_person_merge_append_only_change"() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."protect_person_merge_operation_anchors"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "person_merge_preview_items_append_only"
BEFORE UPDATE OR DELETE ON "person_merge_preview_items"
FOR EACH ROW EXECUTE FUNCTION "openschool_private"."reject_person_merge_append_only_change"();
--> statement-breakpoint
CREATE TRIGGER "person_merge_events_append_only"
BEFORE UPDATE OR DELETE ON "person_merge_events"
FOR EACH ROW EXECUTE FUNCTION "openschool_private"."reject_person_merge_append_only_change"();
--> statement-breakpoint
CREATE TRIGGER "person_merge_operations_anchors_immutable"
BEFORE UPDATE ON "person_merge_operations"
FOR EACH ROW EXECUTE FUNCTION "openschool_private"."protect_person_merge_operation_anchors"();
--> statement-breakpoint
CREATE TRIGGER "person_merge_operations_no_delete"
BEFORE DELETE ON "person_merge_operations"
FOR EACH ROW EXECUTE FUNCTION "openschool_private"."reject_person_merge_append_only_change"();
--> statement-breakpoint
DO $verification$
DECLARE
  v_role record;
BEGIN
  SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
  INTO STRICT v_role
  FROM pg_roles
  WHERE rolname = 'openschool_person_merge_manager';

  IF v_role.rolcanlogin OR v_role.rolsuper OR v_role.rolcreaterole
    OR v_role.rolcreatedb OR v_role.rolbypassrls
  THEN
    RAISE EXCEPTION 'openschool_person_merge_manager must remain a constrained NOLOGIN role';
  END IF;

  IF pg_catalog.pg_has_role('openschool_runtime', 'openschool_person_merge_manager', 'member')
    OR pg_catalog.pg_has_role('openschool_worker', 'openschool_person_merge_manager', 'member')
    OR pg_catalog.pg_has_role('openschool_control_plane', 'openschool_person_merge_manager', 'member')
  THEN
    RAISE EXCEPTION 'execution roles must not inherit person merge manager';
  END IF;
END;
$verification$;
