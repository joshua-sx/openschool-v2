CREATE TABLE "person_merge_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_school_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"source_person_id" uuid NOT NULL,
	"target_person_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"merged_at" timestamp with time zone NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_merge_aliases_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "person_merge_aliases_tenant_source_unique" UNIQUE("tenant_id","source_person_id"),
	CONSTRAINT "person_merge_aliases_tenant_operation_unique" UNIQUE("tenant_id","operation_id"),
	CONSTRAINT "person_merge_aliases_people_check" CHECK ("person_merge_aliases"."source_person_id" <> "person_merge_aliases"."target_person_id"),
	CONSTRAINT "person_merge_aliases_status_check" CHECK ("person_merge_aliases"."status" IN ('active', 'reversed')),
	CONSTRAINT "person_merge_aliases_version_check" CHECK ("person_merge_aliases"."version" > 0),
	CONSTRAINT "person_merge_aliases_reversal_check" CHECK ("person_merge_aliases"."status" <> 'reversed'
        OR ("person_merge_aliases"."reversed_at" IS NOT NULL AND "person_merge_aliases"."reversed_by_account_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "person_merge_aliases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "person_merge_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_school_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"relation_name" text NOT NULL,
	"source_record_key" text NOT NULL,
	"replacement_record_key" text,
	"action" text NOT NULL,
	"before_fingerprint" text NOT NULL,
	"after_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_merge_moves_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "person_merge_moves_operation_sequence_unique" UNIQUE("tenant_id","operation_id","sequence"),
	CONSTRAINT "person_merge_moves_operation_record_unique" UNIQUE("tenant_id","operation_id","relation_name","source_record_key"),
	CONSTRAINT "person_merge_moves_sequence_check" CHECK ("person_merge_moves"."sequence" > 0),
	CONSTRAINT "person_merge_moves_action_check" CHECK ("person_merge_moves"."action" IN ('repoint', 'end_and_recreate', 'preserve_history', 'invalidate', 'archive_source')),
	CONSTRAINT "person_merge_moves_text_check" CHECK (char_length("person_merge_moves"."relation_name") BETWEEN 3 AND 128
        AND char_length("person_merge_moves"."source_record_key") BETWEEN 1 AND 512
        AND ("person_merge_moves"."replacement_record_key" IS NULL
          OR char_length("person_merge_moves"."replacement_record_key") BETWEEN 1 AND 512)),
	CONSTRAINT "person_merge_moves_hash_check" CHECK ("person_merge_moves"."before_fingerprint" ~ '^[0-9a-f]{64}$'
        AND "person_merge_moves"."after_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "person_merge_moves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "person_merge_operations" DROP CONSTRAINT "person_merge_operations_version_check";--> statement-breakpoint
ALTER TABLE "person_merge_operations" DROP CONSTRAINT "person_merge_operations_hash_check";--> statement-breakpoint
ALTER TABLE "person_merge_operations" DROP CONSTRAINT "person_merge_operations_count_check";--> statement-breakpoint
ALTER TABLE "person_merge_operations" DROP CONSTRAINT "person_merge_operations_execution_check";--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD COLUMN "plan_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD COLUMN "execution_digest" text;--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD COLUMN "invalidation_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "person_merge_aliases" ADD CONSTRAINT "person_merge_aliases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_aliases" ADD CONSTRAINT "person_merge_aliases_reversed_by_account_id_accounts_id_fk" FOREIGN KEY ("reversed_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_aliases" ADD CONSTRAINT "person_merge_aliases_tenant_operation_fk" FOREIGN KEY ("tenant_id","operation_id") REFERENCES "public"."person_merge_operations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_aliases" ADD CONSTRAINT "person_merge_aliases_tenant_school_fk" FOREIGN KEY ("tenant_id","review_school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_aliases" ADD CONSTRAINT "person_merge_aliases_tenant_source_fk" FOREIGN KEY ("tenant_id","source_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_aliases" ADD CONSTRAINT "person_merge_aliases_tenant_target_fk" FOREIGN KEY ("tenant_id","target_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_moves" ADD CONSTRAINT "person_merge_moves_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_moves" ADD CONSTRAINT "person_merge_moves_tenant_operation_fk" FOREIGN KEY ("tenant_id","operation_id") REFERENCES "public"."person_merge_operations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_moves" ADD CONSTRAINT "person_merge_moves_tenant_school_fk" FOREIGN KEY ("tenant_id","review_school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "person_merge_aliases_target_idx" ON "person_merge_aliases" USING btree ("tenant_id","target_person_id","status");--> statement-breakpoint
CREATE INDEX "person_merge_moves_operation_idx" ON "person_merge_moves" USING btree ("tenant_id","operation_id","sequence","id");--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD CONSTRAINT "person_merge_operations_version_check" CHECK ("person_merge_operations"."current_version" > 0 AND "person_merge_operations"."plan_version" > 0);--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD CONSTRAINT "person_merge_operations_hash_check" CHECK ("person_merge_operations"."duplicate_evidence_hash" ~ '^[0-9a-f]{64}$'
        AND "person_merge_operations"."preview_digest" ~ '^[0-9a-f]{64}$'
        AND ("person_merge_operations"."execution_digest" IS NULL OR "person_merge_operations"."execution_digest" ~ '^[0-9a-f]{64}$'));--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD CONSTRAINT "person_merge_operations_count_check" CHECK ("person_merge_operations"."dependency_count" >= 0 AND "person_merge_operations"."conflict_count" >= 0
        AND "person_merge_operations"."conflict_count" <= "person_merge_operations"."dependency_count"
        AND "person_merge_operations"."invalidation_count" >= 0);--> statement-breakpoint
ALTER TABLE "person_merge_operations" ADD CONSTRAINT "person_merge_operations_execution_check" CHECK ("person_merge_operations"."status" NOT IN ('executed', 'reversed', 'manual_recovery')
        OR ("person_merge_operations"."executed_by_account_id" IS NOT NULL AND "person_merge_operations"."executed_at" IS NOT NULL
          AND "person_merge_operations"."execution_digest" IS NOT NULL));--> statement-breakpoint
CREATE POLICY "person_merge_aliases_runtime_select" ON "person_merge_aliases" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "person_merge_aliases"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )

  AND public.openschool_school_scope_allows("person_merge_aliases"."tenant_id", "person_merge_aliases"."review_school_id")
);--> statement-breakpoint
CREATE POLICY "person_merge_aliases_runtime_write_deny" ON "person_merge_aliases" AS PERMISSIVE FOR ALL TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "person_merge_aliases_manager_all" ON "person_merge_aliases" AS PERMISSIVE FOR ALL TO "openschool_person_merge_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND "person_merge_aliases"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )

  AND public.openschool_school_scope_allows("person_merge_aliases"."tenant_id", "person_merge_aliases"."review_school_id")
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND "person_merge_aliases"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )

  AND public.openschool_school_scope_allows("person_merge_aliases"."tenant_id", "person_merge_aliases"."review_school_id")
);--> statement-breakpoint
CREATE POLICY "person_merge_moves_runtime_select" ON "person_merge_moves" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "person_merge_moves"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )

  AND public.openschool_school_scope_allows("person_merge_moves"."tenant_id", "person_merge_moves"."review_school_id")
);--> statement-breakpoint
CREATE POLICY "person_merge_moves_runtime_write_deny" ON "person_merge_moves" AS PERMISSIVE FOR ALL TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "person_merge_moves_manager_all" ON "person_merge_moves" AS PERMISSIVE FOR ALL TO "openschool_person_merge_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND "person_merge_moves"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )

  AND public.openschool_school_scope_allows("person_merge_moves"."tenant_id", "person_merge_moves"."review_school_id")
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND "person_merge_moves"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )

  AND public.openschool_school_scope_allows("person_merge_moves"."tenant_id", "person_merge_moves"."review_school_id")
);--> statement-breakpoint
ALTER POLICY "person_merge_events_runtime_select" ON "person_merge_events" TO openschool_runtime USING (
  "person_merge_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )

  AND public.openschool_school_scope_allows("person_merge_events"."tenant_id", "person_merge_events"."review_school_id")
);--> statement-breakpoint
ALTER POLICY "person_merge_events_manager_all" ON "person_merge_events" TO openschool_person_merge_manager USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND "person_merge_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
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
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )

  AND public.openschool_school_scope_allows("person_merge_events"."tenant_id", "person_merge_events"."review_school_id")
);--> statement-breakpoint
ALTER POLICY "person_merge_operations_runtime_select" ON "person_merge_operations" TO openschool_runtime USING (
  "person_merge_operations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )

  AND public.openschool_school_scope_allows("person_merge_operations"."tenant_id", "person_merge_operations"."review_school_id")
);--> statement-breakpoint
ALTER POLICY "person_merge_operations_manager_all" ON "person_merge_operations" TO openschool_person_merge_manager USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND "person_merge_operations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
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
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )

  AND public.openschool_school_scope_allows("person_merge_operations"."tenant_id", "person_merge_operations"."review_school_id")
);--> statement-breakpoint
ALTER POLICY "person_merge_preview_items_runtime_select" ON "person_merge_preview_items" TO openschool_runtime USING (
  "person_merge_preview_items"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )

  AND public.openschool_school_scope_allows("person_merge_preview_items"."tenant_id", "person_merge_preview_items"."review_school_id")
);--> statement-breakpoint
ALTER POLICY "person_merge_preview_items_manager_all" ON "person_merge_preview_items" TO openschool_person_merge_manager USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND "person_merge_preview_items"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND 
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
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
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )

  AND public.openschool_school_scope_allows("person_merge_preview_items"."tenant_id", "person_merge_preview_items"."review_school_id")
);
--> statement-breakpoint
ALTER TABLE "person_merge_aliases" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "person_merge_moves" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "person_merge_aliases", "person_merge_moves" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON TABLE "person_merge_aliases", "person_merge_moves"
  TO "openschool_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "person_merge_aliases"
  TO "openschool_person_merge_manager";
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "person_merge_moves"
  TO "openschool_person_merge_manager";
--> statement-breakpoint
CREATE TRIGGER "person_merge_moves_append_only"
BEFORE UPDATE OR DELETE ON "person_merge_moves"
FOR EACH ROW EXECUTE FUNCTION "openschool_private"."reject_person_merge_append_only_change"();
--> statement-breakpoint
CREATE FUNCTION "openschool_private"."protect_person_merge_alias_anchors"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.review_school_id IS DISTINCT FROM NEW.review_school_id
    OR OLD.operation_id IS DISTINCT FROM NEW.operation_id
    OR OLD.source_person_id IS DISTINCT FROM NEW.source_person_id
    OR OLD.target_person_id IS DISTINCT FROM NEW.target_person_id
    OR OLD.merged_at IS DISTINCT FROM NEW.merged_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'person merge alias anchors are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."protect_person_merge_alias_anchors"()
  FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "person_merge_aliases_anchors_immutable"
BEFORE UPDATE ON "person_merge_aliases"
FOR EACH ROW EXECUTE FUNCTION "openschool_private"."protect_person_merge_alias_anchors"();
--> statement-breakpoint
CREATE TRIGGER "person_merge_aliases_no_delete"
BEFORE DELETE ON "person_merge_aliases"
FOR EACH ROW EXECUTE FUNCTION "openschool_private"."reject_person_merge_append_only_change"();
--> statement-breakpoint
CREATE FUNCTION "openschool_private"."protect_merged_person_alias"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.person_merge_aliases AS alias
    WHERE alias.tenant_id = OLD.tenant_id
      AND alias.source_person_id = OLD.id
      AND alias.status = 'active'
  ) THEN
    RAISE EXCEPTION 'merged Person aliases are immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."protect_merged_person_alias"()
  FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "people_merged_alias_immutable"
BEFORE UPDATE OR DELETE ON "people"
FOR EACH ROW EXECUTE FUNCTION "openschool_private"."protect_merged_person_alias"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "openschool_private"."protect_person_merge_operation_anchors"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
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
    OR OLD.plan_version IS DISTINCT FROM NEW.plan_version
    OR OLD.initiated_by_account_id IS DISTINCT FROM NEW.initiated_by_account_id
    OR OLD.initiation_reason IS DISTINCT FROM NEW.initiation_reason
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'person merge operation anchors are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;
--> statement-breakpoint
DO $verification$
BEGIN
  IF NOT (
    SELECT relrowsecurity AND relforcerowsecurity
    FROM pg_class
    WHERE oid = 'public.person_merge_aliases'::regclass
  ) OR NOT (
    SELECT relrowsecurity AND relforcerowsecurity
    FROM pg_class
    WHERE oid = 'public.person_merge_moves'::regclass
  ) THEN
    RAISE EXCEPTION 'Person merge execution ledger must force RLS';
  END IF;

  IF has_table_privilege('openschool_runtime', 'public.person_merge_aliases', 'INSERT')
    OR has_table_privilege('openschool_runtime', 'public.person_merge_moves', 'INSERT')
    OR pg_catalog.pg_has_role(
      'openschool_runtime', 'openschool_person_merge_manager', 'member'
    )
  THEN
    RAISE EXCEPTION 'Person merge execution ledger privileges are unsafe';
  END IF;
END
$verification$;
