CREATE TABLE "person_duplicate_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_school_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"event_type" text NOT NULL,
	"score" integer NOT NULL,
	"signals" jsonb NOT NULL,
	"evidence_hash" text NOT NULL,
	"reason" text NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_duplicate_case_events_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "person_duplicate_case_events_case_version_unique" UNIQUE("tenant_id","case_id","version"),
	CONSTRAINT "person_duplicate_case_events_version_check" CHECK ("person_duplicate_case_events"."version" > 0),
	CONSTRAINT "person_duplicate_case_events_type_check" CHECK ("person_duplicate_case_events"."event_type" IN ('candidate_detected', 'evidence_refreshed', 'evidence_no_longer_matches', 'marked_distinct', 'merge_approval_requested')),
	CONSTRAINT "person_duplicate_case_events_score_check" CHECK ("person_duplicate_case_events"."score" BETWEEN 0 AND 100),
	CONSTRAINT "person_duplicate_case_events_signals_check" CHECK (jsonb_typeof("person_duplicate_case_events"."signals") = 'array' AND jsonb_array_length("person_duplicate_case_events"."signals") <= 4),
	CONSTRAINT "person_duplicate_case_events_hash_check" CHECK ("person_duplicate_case_events"."evidence_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "person_duplicate_case_events_reason_check" CHECK (char_length(btrim("person_duplicate_case_events"."reason")) BETWEEN 3 AND 512)
);
--> statement-breakpoint
ALTER TABLE "person_duplicate_case_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "person_duplicate_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_school_id" uuid NOT NULL,
	"first_person_id" uuid NOT NULL,
	"second_person_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"current_score" integer NOT NULL,
	"current_signals" jsonb NOT NULL,
	"current_evidence_hash" text NOT NULL,
	"created_by_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_duplicate_cases_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "person_duplicate_cases_school_pair_unique" UNIQUE("tenant_id","review_school_id","first_person_id","second_person_id"),
	CONSTRAINT "person_duplicate_cases_pair_order_check" CHECK ("person_duplicate_cases"."first_person_id"::text < "person_duplicate_cases"."second_person_id"::text),
	CONSTRAINT "person_duplicate_cases_status_check" CHECK ("person_duplicate_cases"."status" IN ('open', 'distinct', 'merge_approval_requested', 'superseded')),
	CONSTRAINT "person_duplicate_cases_version_check" CHECK ("person_duplicate_cases"."current_version" > 0),
	CONSTRAINT "person_duplicate_cases_score_check" CHECK ("person_duplicate_cases"."current_score" BETWEEN 0 AND 100),
	CONSTRAINT "person_duplicate_cases_signals_check" CHECK (jsonb_typeof("person_duplicate_cases"."current_signals") = 'array' AND jsonb_array_length("person_duplicate_cases"."current_signals") <= 4),
	CONSTRAINT "person_duplicate_cases_hash_check" CHECK ("person_duplicate_cases"."current_evidence_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "person_duplicate_cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "person_duplicate_case_events" ADD CONSTRAINT "person_duplicate_case_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_duplicate_case_events" ADD CONSTRAINT "person_duplicate_case_events_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_duplicate_case_events" ADD CONSTRAINT "person_duplicate_case_events_tenant_case_fk" FOREIGN KEY ("tenant_id","case_id") REFERENCES "public"."person_duplicate_cases"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_duplicate_case_events" ADD CONSTRAINT "person_duplicate_case_events_tenant_school_fk" FOREIGN KEY ("tenant_id","review_school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_duplicate_cases" ADD CONSTRAINT "person_duplicate_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_duplicate_cases" ADD CONSTRAINT "person_duplicate_cases_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_duplicate_cases" ADD CONSTRAINT "person_duplicate_cases_tenant_school_fk" FOREIGN KEY ("tenant_id","review_school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_duplicate_cases" ADD CONSTRAINT "person_duplicate_cases_tenant_first_person_fk" FOREIGN KEY ("tenant_id","first_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_duplicate_cases" ADD CONSTRAINT "person_duplicate_cases_tenant_second_person_fk" FOREIGN KEY ("tenant_id","second_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "person_duplicate_case_events_history_idx" ON "person_duplicate_case_events" USING btree ("tenant_id","case_id","version","id");--> statement-breakpoint
CREATE INDEX "person_duplicate_cases_queue_idx" ON "person_duplicate_cases" USING btree ("tenant_id","review_school_id","status","updated_at","id");--> statement-breakpoint
CREATE INDEX "person_duplicate_cases_first_person_idx" ON "person_duplicate_cases" USING btree ("tenant_id","first_person_id","review_school_id","id");--> statement-breakpoint
CREATE INDEX "person_duplicate_cases_second_person_idx" ON "person_duplicate_cases" USING btree ("tenant_id","second_person_id","review_school_id","id");--> statement-breakpoint
CREATE POLICY "person_duplicate_case_events_runtime_select" ON "person_duplicate_case_events" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "person_duplicate_case_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_duplicates.read',
    'tenant.people_duplicates.review'
  )
  AND public.openschool_school_scope_allows("person_duplicate_case_events"."tenant_id", "person_duplicate_case_events"."review_school_id")
);--> statement-breakpoint
CREATE POLICY "person_duplicate_case_events_runtime_write_deny" ON "person_duplicate_case_events" AS PERMISSIVE FOR ALL TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "person_duplicate_case_events_manager_select" ON "person_duplicate_case_events" AS PERMISSIVE FOR SELECT TO "openschool_duplicate_review_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_duplicate_review_manager'
  AND "person_duplicate_case_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.students.create',
    'tenant.students.update',
    'tenant.guardian_contacts.manage',
    'tenant.people_duplicates.review'
  )
  AND public.openschool_school_scope_allows("person_duplicate_case_events"."tenant_id", "person_duplicate_case_events"."review_school_id")
);--> statement-breakpoint
CREATE POLICY "person_duplicate_case_events_manager_insert" ON "person_duplicate_case_events" AS PERMISSIVE FOR INSERT TO "openschool_duplicate_review_manager" WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_duplicate_review_manager'
  AND "person_duplicate_case_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.students.create',
    'tenant.students.update',
    'tenant.guardian_contacts.manage',
    'tenant.people_duplicates.review'
  )
  AND public.openschool_school_scope_allows("person_duplicate_case_events"."tenant_id", "person_duplicate_case_events"."review_school_id")
);--> statement-breakpoint
CREATE POLICY "person_duplicate_cases_runtime_select" ON "person_duplicate_cases" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "person_duplicate_cases"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_duplicates.read',
    'tenant.people_duplicates.review'
  )
  AND public.openschool_school_scope_allows("person_duplicate_cases"."tenant_id", "person_duplicate_cases"."review_school_id")
);--> statement-breakpoint
CREATE POLICY "person_duplicate_cases_runtime_write_deny" ON "person_duplicate_cases" AS PERMISSIVE FOR ALL TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "person_duplicate_cases_manager_all" ON "person_duplicate_cases" AS PERMISSIVE FOR ALL TO "openschool_duplicate_review_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_duplicate_review_manager'
  AND "person_duplicate_cases"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.students.create',
    'tenant.students.update',
    'tenant.guardian_contacts.manage',
    'tenant.people_duplicates.review'
  )
  AND public.openschool_school_scope_allows("person_duplicate_cases"."tenant_id", "person_duplicate_cases"."review_school_id")
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_duplicate_review_manager'
  AND "person_duplicate_cases"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.students.create',
    'tenant.students.update',
    'tenant.guardian_contacts.manage',
    'tenant.people_duplicates.review'
  )
  AND public.openschool_school_scope_allows("person_duplicate_cases"."tenant_id", "person_duplicate_cases"."review_school_id")
);