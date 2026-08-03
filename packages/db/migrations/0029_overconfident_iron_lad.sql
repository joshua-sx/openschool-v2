CREATE TABLE "academic_compatibility_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_key" text NOT NULL,
	"legacy_value" jsonb NOT NULL,
	"mapping_status" text NOT NULL,
	"reason" text NOT NULL,
	"academic_year_id" uuid,
	"academic_term_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_compatibility_evidence_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "academic_compatibility_evidence_source_unique" UNIQUE("tenant_id","source_type","source_key"),
	CONSTRAINT "academic_compatibility_evidence_source_type_check" CHECK ("academic_compatibility_evidence"."source_type" IN ('school_academic_year', 'school_term', 'class_academic_year')),
	CONSTRAINT "academic_compatibility_evidence_mapping_status_check" CHECK ("academic_compatibility_evidence"."mapping_status" IN ('mapped', 'unmapped', 'review_required')),
	CONSTRAINT "academic_compatibility_evidence_source_key_check" CHECK (char_length(btrim("academic_compatibility_evidence"."source_key")) BETWEEN 1 AND 256),
	CONSTRAINT "academic_compatibility_evidence_reason_check" CHECK (char_length(btrim("academic_compatibility_evidence"."reason")) BETWEEN 3 AND 512),
	CONSTRAINT "academic_compatibility_evidence_mapping_check" CHECK ("academic_compatibility_evidence"."mapping_status" <> 'mapped' OR "academic_compatibility_evidence"."academic_year_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "academic_compatibility_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "academic_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"ordinal" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_terms_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "academic_terms_tenant_school_id_id_unique" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "academic_terms_year_code_unique" UNIQUE("tenant_id","academic_year_id","code"),
	CONSTRAINT "academic_terms_year_ordinal_unique" UNIQUE("tenant_id","academic_year_id","ordinal"),
	CONSTRAINT "academic_terms_code_check" CHECK (char_length(btrim("academic_terms"."code")) BETWEEN 1 AND 64 AND "academic_terms"."code" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
	CONSTRAINT "academic_terms_name_check" CHECK (char_length(btrim("academic_terms"."name")) BETWEEN 1 AND 128),
	CONSTRAINT "academic_terms_ordinal_check" CHECK ("academic_terms"."ordinal" BETWEEN 1 AND 20),
	CONSTRAINT "academic_terms_dates_check" CHECK ("academic_terms"."end_date" >= "academic_terms"."start_date")
);
--> statement-breakpoint
ALTER TABLE "academic_terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" text DEFAULT 'native' NOT NULL,
	"migration_review_status" text DEFAULT 'not_required' NOT NULL,
	"legacy_academic_year" text,
	"created_by_account_id" uuid,
	"published_by_account_id" uuid,
	"closed_by_account_id" uuid,
	"published_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_years_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "academic_years_tenant_school_id_id_unique" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "academic_years_tenant_school_code_unique" UNIQUE("tenant_id","school_id","code"),
	CONSTRAINT "academic_years_code_check" CHECK (char_length(btrim("academic_years"."code")) BETWEEN 1 AND 64 AND "academic_years"."code" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
	CONSTRAINT "academic_years_name_check" CHECK (char_length(btrim("academic_years"."name")) BETWEEN 1 AND 128),
	CONSTRAINT "academic_years_timezone_check" CHECK (char_length(btrim("academic_years"."time_zone")) BETWEEN 1 AND 128),
	CONSTRAINT "academic_years_dates_check" CHECK ("academic_years"."end_date" >= "academic_years"."start_date"),
	CONSTRAINT "academic_years_status_check" CHECK ("academic_years"."status" IN ('draft', 'published', 'closed')),
	CONSTRAINT "academic_years_source_check" CHECK ("academic_years"."source" IN ('native', 'legacy_backfill')),
	CONSTRAINT "academic_years_review_check" CHECK ("academic_years"."migration_review_status" IN ('not_required', 'needs_review', 'approved')),
	CONSTRAINT "academic_years_review_source_check" CHECK ("academic_years"."source" = 'legacy_backfill' OR "academic_years"."migration_review_status" = 'not_required'),
	CONSTRAINT "academic_years_publish_evidence_check" CHECK ("academic_years"."status" = 'draft' OR ("academic_years"."published_at" IS NOT NULL AND "academic_years"."published_by_account_id" IS NOT NULL)),
	CONSTRAINT "academic_years_close_evidence_check" CHECK ("academic_years"."status" <> 'closed' OR ("academic_years"."closed_at" IS NOT NULL AND "academic_years"."closed_by_account_id" IS NOT NULL AND char_length(btrim("academic_years"."closure_reason")) BETWEEN 3 AND 512))
);
--> statement-breakpoint
ALTER TABLE "academic_years" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "learner_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"ordinal" integer NOT NULL,
	"education_stage" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_levels_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "learner_levels_tenant_school_id_id_unique" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "learner_levels_year_code_unique" UNIQUE("tenant_id","academic_year_id","code"),
	CONSTRAINT "learner_levels_year_ordinal_unique" UNIQUE("tenant_id","academic_year_id","ordinal"),
	CONSTRAINT "learner_levels_code_check" CHECK (char_length(btrim("learner_levels"."code")) BETWEEN 1 AND 64 AND "learner_levels"."code" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
	CONSTRAINT "learner_levels_name_check" CHECK (char_length(btrim("learner_levels"."name")) BETWEEN 1 AND 128),
	CONSTRAINT "learner_levels_ordinal_check" CHECK ("learner_levels"."ordinal" BETWEEN 1 AND 30),
	CONSTRAINT "learner_levels_stage_check" CHECK ("learner_levels"."education_stage" IS NULL OR char_length(btrim("learner_levels"."education_stage")) BETWEEN 1 AND 64)
);
--> statement-breakpoint
ALTER TABLE "learner_levels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academic_compatibility_evidence" ADD CONSTRAINT "academic_compatibility_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "academic_compatibility_evidence" ADD CONSTRAINT "academic_compatibility_evidence_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "academic_compatibility_evidence" ADD CONSTRAINT "academic_compatibility_evidence_tenant_year_fk" FOREIGN KEY ("tenant_id","academic_year_id") REFERENCES "public"."academic_years"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "academic_compatibility_evidence" ADD CONSTRAINT "academic_compatibility_evidence_tenant_term_fk" FOREIGN KEY ("tenant_id","academic_term_id") REFERENCES "public"."academic_terms"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_tenant_school_year_fk" FOREIGN KEY ("tenant_id","school_id","academic_year_id") REFERENCES "public"."academic_years"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_published_by_account_id_accounts_id_fk" FOREIGN KEY ("published_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_closed_by_account_id_accounts_id_fk" FOREIGN KEY ("closed_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "learner_levels" ADD CONSTRAINT "learner_levels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "learner_levels" ADD CONSTRAINT "learner_levels_tenant_school_year_fk" FOREIGN KEY ("tenant_id","school_id","academic_year_id") REFERENCES "public"."academic_years"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "academic_compatibility_evidence_tenant_school_idx" ON "academic_compatibility_evidence" USING btree ("tenant_id","school_id","mapping_status","source_type","id");--> statement-breakpoint
CREATE INDEX "academic_terms_year_dates_idx" ON "academic_terms" USING btree ("tenant_id","academic_year_id","start_date","end_date","id");--> statement-breakpoint
CREATE INDEX "academic_years_tenant_school_status_dates_idx" ON "academic_years" USING btree ("tenant_id","school_id","status","start_date","end_date","id");--> statement-breakpoint
CREATE INDEX "learner_levels_year_order_idx" ON "learner_levels" USING btree ("tenant_id","academic_year_id","ordinal","id");--> statement-breakpoint
CREATE POLICY "schools_academic_configurator_select" ON "schools" AS PERMISSIVE FOR SELECT TO "openschool_academic_configurator" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_academic_configurator'
        AND "schools"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.academic_structure.manage'
        AND public.openschool_school_scope_allows("schools"."tenant_id", "schools"."id")
      );--> statement-breakpoint
CREATE POLICY "academic_compatibility_evidence_runtime_select" ON "academic_compatibility_evidence" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "academic_compatibility_evidence"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN (
  'tenant.academic_structure.read', 'tenant.academic_structure.manage'
)
  AND public.openschool_school_scope_allows("academic_compatibility_evidence"."tenant_id", "academic_compatibility_evidence"."school_id")
);--> statement-breakpoint
CREATE POLICY "academic_compatibility_evidence_runtime_insert_deny" ON "academic_compatibility_evidence" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "academic_compatibility_evidence_runtime_update_deny" ON "academic_compatibility_evidence" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "academic_compatibility_evidence_runtime_delete_deny" ON "academic_compatibility_evidence" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "academic_terms_runtime_select" ON "academic_terms" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "academic_terms"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN (
  'tenant.academic_structure.read', 'tenant.academic_structure.manage'
)
  AND public.openschool_school_scope_allows("academic_terms"."tenant_id", "academic_terms"."school_id")
);--> statement-breakpoint
CREATE POLICY "academic_terms_runtime_insert_deny" ON "academic_terms" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "academic_terms_runtime_update_deny" ON "academic_terms" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "academic_terms_runtime_delete_deny" ON "academic_terms" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "academic_terms_configurator_select" ON "academic_terms" AS PERMISSIVE FOR SELECT TO "openschool_academic_configurator" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_academic_configurator'
  AND "academic_terms"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    = 'tenant.academic_structure.manage'
  AND public.openschool_school_scope_allows("academic_terms"."tenant_id", "academic_terms"."school_id")
);--> statement-breakpoint
CREATE POLICY "academic_terms_configurator_insert" ON "academic_terms" AS PERMISSIVE FOR INSERT TO "openschool_academic_configurator" WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_academic_configurator'
  AND "academic_terms"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    = 'tenant.academic_structure.manage'
  AND public.openschool_school_scope_allows("academic_terms"."tenant_id", "academic_terms"."school_id")
);--> statement-breakpoint
CREATE POLICY "academic_terms_configurator_update_deny" ON "academic_terms" AS PERMISSIVE FOR UPDATE TO "openschool_academic_configurator" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "academic_terms_configurator_delete_deny" ON "academic_terms" AS PERMISSIVE FOR DELETE TO "openschool_academic_configurator" USING (false);--> statement-breakpoint
CREATE POLICY "academic_years_runtime_select" ON "academic_years" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "academic_years"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN (
  'tenant.academic_structure.read', 'tenant.academic_structure.manage'
)
  AND public.openschool_school_scope_allows("academic_years"."tenant_id", "academic_years"."school_id")
);--> statement-breakpoint
CREATE POLICY "academic_years_runtime_insert_deny" ON "academic_years" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "academic_years_runtime_update_deny" ON "academic_years" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "academic_years_runtime_delete_deny" ON "academic_years" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "academic_years_configurator_select" ON "academic_years" AS PERMISSIVE FOR SELECT TO "openschool_academic_configurator" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_academic_configurator'
  AND "academic_years"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    = 'tenant.academic_structure.manage'
  AND public.openschool_school_scope_allows("academic_years"."tenant_id", "academic_years"."school_id")
);--> statement-breakpoint
CREATE POLICY "academic_years_configurator_insert" ON "academic_years" AS PERMISSIVE FOR INSERT TO "openschool_academic_configurator" WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_academic_configurator'
  AND "academic_years"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    = 'tenant.academic_structure.manage'
  AND public.openschool_school_scope_allows("academic_years"."tenant_id", "academic_years"."school_id")
);--> statement-breakpoint
CREATE POLICY "academic_years_configurator_update" ON "academic_years" AS PERMISSIVE FOR UPDATE TO "openschool_academic_configurator" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_academic_configurator'
  AND "academic_years"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    = 'tenant.academic_structure.manage'
  AND public.openschool_school_scope_allows("academic_years"."tenant_id", "academic_years"."school_id")
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_academic_configurator'
  AND "academic_years"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    = 'tenant.academic_structure.manage'
  AND public.openschool_school_scope_allows("academic_years"."tenant_id", "academic_years"."school_id")
);--> statement-breakpoint
CREATE POLICY "academic_years_configurator_delete_deny" ON "academic_years" AS PERMISSIVE FOR DELETE TO "openschool_academic_configurator" USING (false);--> statement-breakpoint
CREATE POLICY "learner_levels_runtime_select" ON "learner_levels" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "learner_levels"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN (
  'tenant.academic_structure.read', 'tenant.academic_structure.manage'
)
  AND public.openschool_school_scope_allows("learner_levels"."tenant_id", "learner_levels"."school_id")
);--> statement-breakpoint
CREATE POLICY "learner_levels_runtime_insert_deny" ON "learner_levels" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "learner_levels_runtime_update_deny" ON "learner_levels" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "learner_levels_runtime_delete_deny" ON "learner_levels" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "learner_levels_configurator_select" ON "learner_levels" AS PERMISSIVE FOR SELECT TO "openschool_academic_configurator" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_academic_configurator'
  AND "learner_levels"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    = 'tenant.academic_structure.manage'
  AND public.openschool_school_scope_allows("learner_levels"."tenant_id", "learner_levels"."school_id")
);--> statement-breakpoint
CREATE POLICY "learner_levels_configurator_insert" ON "learner_levels" AS PERMISSIVE FOR INSERT TO "openschool_academic_configurator" WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_academic_configurator'
  AND "learner_levels"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    = 'tenant.academic_structure.manage'
  AND public.openschool_school_scope_allows("learner_levels"."tenant_id", "learner_levels"."school_id")
);--> statement-breakpoint
CREATE POLICY "learner_levels_configurator_update_deny" ON "learner_levels" AS PERMISSIVE FOR UPDATE TO "openschool_academic_configurator" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "learner_levels_configurator_delete_deny" ON "learner_levels" AS PERMISSIVE FOR DELETE TO "openschool_academic_configurator" USING (false);--> statement-breakpoint
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
                'tenant.academic_structure.read', 'tenant.academic_structure.manage',
                'identity.context.resolve'
              )
            AND public.openschool_school_scope_allows(
              "schools"."tenant_id", "schools"."id"
            )
          )
        )
      );--> statement-breakpoint

-- Preserve every legacy label and term without guessing an authoritative date
-- range. Administrators can compare this evidence while creating canonical
-- Academic Years; no inferred dates silently become operational authority.
INSERT INTO "academic_compatibility_evidence" (
  "tenant_id", "school_id", "source_type", "source_key", "legacy_value",
  "mapping_status", "reason"
)
SELECT
  school.tenant_id,
  school.id,
  'school_academic_year',
  'school:' || school.id::text || ':academic_year',
  jsonb_build_object('academicYear', school.academic_year),
  'unmapped',
  'Legacy Academic Year is a label without authoritative year boundary dates; no dates were inferred.'
FROM public.schools AS school
WHERE school.academic_year IS NOT NULL
  AND btrim(school.academic_year) <> ''
ON CONFLICT (tenant_id, source_type, source_key) DO NOTHING;--> statement-breakpoint

INSERT INTO "academic_compatibility_evidence" (
  "tenant_id", "school_id", "source_type", "source_key", "legacy_value",
  "mapping_status", "reason"
)
SELECT
  school.tenant_id,
  school.id,
  'school_term',
  'school:' || school.id::text || ':term:' || legacy_term.ordinality::text,
  legacy_term.value,
  'unmapped',
  'Legacy Term is retained for review and cannot define a canonical Academic Year without approved year boundaries.'
FROM public.schools AS school
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(school.terms) = 'array' THEN school.terms ELSE '[]'::jsonb END
) WITH ORDINALITY AS legacy_term(value, ordinality)
ON CONFLICT (tenant_id, source_type, source_key) DO NOTHING;--> statement-breakpoint

INSERT INTO "academic_compatibility_evidence" (
  "tenant_id", "school_id", "source_type", "source_key", "legacy_value",
  "mapping_status", "reason"
)
SELECT
  legacy_class.tenant_id,
  legacy_class.school_id,
  'class_academic_year',
  'class:' || legacy_class.id::text || ':academic_year',
  jsonb_build_object('academicYear', legacy_class.academic_year),
  'unmapped',
  'Legacy Class Academic Year is a label; no canonical date range or Course placement was inferred.'
FROM public.classes AS legacy_class
WHERE btrim(legacy_class.academic_year) <> ''
ON CONFLICT (tenant_id, source_type, source_key) DO NOTHING;--> statement-breakpoint

ALTER TABLE "academic_years" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academic_terms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "learner_levels" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academic_compatibility_evidence" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "academic_years"
  ADD CONSTRAINT "academic_years_no_overlapping_lifecycle_dates"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "school_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("status" IN ('published', 'closed'));--> statement-breakpoint

ALTER TABLE "academic_terms"
  ADD CONSTRAINT "academic_terms_no_overlapping_dates"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "academic_year_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  );--> statement-breakpoint

CREATE FUNCTION "openschool_private"."guard_academic_year_lifecycle"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;

  IF ROW(
    NEW.id, NEW.tenant_id, NEW.school_id, NEW.code, NEW.name, NEW.time_zone,
    NEW.start_date, NEW.end_date, NEW.source, NEW.legacy_academic_year,
    NEW.created_by_account_id, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.tenant_id, OLD.school_id, OLD.code, OLD.name, OLD.time_zone,
    OLD.start_date, OLD.end_date, OLD.source, OLD.legacy_academic_year,
    OLD.created_by_account_id, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_CORE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    IF OLD.source <> 'legacy_backfill'
      OR OLD.migration_review_status <> 'needs_review'
      OR NEW.migration_review_status <> 'approved'
      OR NEW.published_at IS NOT NULL
      OR NEW.published_by_account_id IS NOT NULL
      OR NEW.closed_at IS NOT NULL
      OR NEW.closed_by_account_id IS NOT NULL
      OR NEW.closure_reason IS NOT NULL
    THEN
      RAISE EXCEPTION 'ACADEMIC_YEAR_DRAFT_UPDATE_FORBIDDEN' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'published' THEN
    IF NEW.migration_review_status = 'needs_review'
      OR NEW.published_at IS NULL
      OR NEW.published_by_account_id IS NULL
      OR NEW.closed_at IS NOT NULL
      OR NEW.closed_by_account_id IS NOT NULL
      OR NEW.closure_reason IS NOT NULL
    THEN
      RAISE EXCEPTION 'ACADEMIC_YEAR_PUBLISH_EVIDENCE_INVALID' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'published' AND NEW.status = 'closed' THEN
    IF NEW.migration_review_status IS DISTINCT FROM OLD.migration_review_status
      OR NEW.published_at IS DISTINCT FROM OLD.published_at
      OR NEW.published_by_account_id IS DISTINCT FROM OLD.published_by_account_id
      OR NEW.closed_at IS NULL
      OR NEW.closed_by_account_id IS NULL
      OR char_length(btrim(NEW.closure_reason)) NOT BETWEEN 3 AND 512
    THEN
      RAISE EXCEPTION 'ACADEMIC_YEAR_CLOSE_EVIDENCE_INVALID' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ACADEMIC_YEAR_LIFECYCLE_TRANSITION_FORBIDDEN' USING ERRCODE = '55000';
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_private"."guard_academic_year_lifecycle"()
  FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER "academic_years_lifecycle_guard"
  BEFORE UPDATE OR DELETE ON "academic_years"
  FOR EACH ROW EXECUTE FUNCTION "openschool_private"."guard_academic_year_lifecycle"();--> statement-breakpoint

CREATE FUNCTION "openschool_private"."validate_academic_year_timezone"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.time_zone
  ) THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_TIMEZONE_INVALID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_private"."validate_academic_year_timezone"()
  FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER "academic_years_timezone_guard"
  BEFORE INSERT OR UPDATE OF "time_zone" ON "academic_years"
  FOR EACH ROW EXECUTE FUNCTION "openschool_private"."validate_academic_year_timezone"();--> statement-breakpoint

CREATE FUNCTION "openschool_private"."guard_academic_term"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_year public.academic_years%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'ACADEMIC_TERM_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_year
  FROM public.academic_years
  WHERE tenant_id = NEW.tenant_id
    AND school_id = NEW.school_id
    AND id = NEW.academic_year_id;

  IF NOT FOUND OR v_year.status <> 'draft' THEN
    RAISE EXCEPTION 'ACADEMIC_TERM_REQUIRES_DRAFT_YEAR' USING ERRCODE = '23514';
  END IF;
  IF NEW.start_date < v_year.start_date OR NEW.end_date > v_year.end_date THEN
    RAISE EXCEPTION 'ACADEMIC_TERM_OUTSIDE_YEAR' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_private"."guard_academic_term"()
  FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER "academic_terms_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "academic_terms"
  FOR EACH ROW EXECUTE FUNCTION "openschool_private"."guard_academic_term"();--> statement-breakpoint

CREATE FUNCTION "openschool_private"."guard_learner_level"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'LEARNER_LEVEL_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.academic_years
    WHERE tenant_id = NEW.tenant_id
      AND school_id = NEW.school_id
      AND id = NEW.academic_year_id
      AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'LEARNER_LEVEL_REQUIRES_DRAFT_YEAR' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_private"."guard_learner_level"()
  FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER "learner_levels_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "learner_levels"
  FOR EACH ROW EXECUTE FUNCTION "openschool_private"."guard_learner_level"();--> statement-breakpoint

CREATE FUNCTION "openschool_private"."guard_academic_compatibility_evidence"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'ACADEMIC_COMPATIBILITY_EVIDENCE_APPEND_ONLY' USING ERRCODE = '55000';
  RETURN NULL;
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_private"."guard_academic_compatibility_evidence"()
  FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER "academic_compatibility_evidence_append_only"
  BEFORE UPDATE OR DELETE ON "academic_compatibility_evidence"
  FOR EACH ROW EXECUTE FUNCTION "openschool_private"."guard_academic_compatibility_evidence"();--> statement-breakpoint

GRANT USAGE ON SCHEMA "public", "openschool_private"
  TO "openschool_academic_configurator";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_school_scope_allows"(uuid, uuid)
  TO "openschool_academic_configurator";--> statement-breakpoint
GRANT SELECT ON TABLE "schools", "academic_years", "academic_terms", "learner_levels"
  TO "openschool_academic_configurator";--> statement-breakpoint
GRANT INSERT, UPDATE ON TABLE "academic_years"
  TO "openschool_academic_configurator";--> statement-breakpoint
GRANT INSERT ON TABLE "academic_terms", "learner_levels"
  TO "openschool_academic_configurator";--> statement-breakpoint

CREATE FUNCTION "openschool_private"."create_academic_year"(
  p_academic_year_id uuid,
  p_school_id uuid,
  p_code text,
  p_name text,
  p_time_zone text,
  p_start_date date,
  p_end_date date,
  p_terms jsonb,
  p_levels jsonb
)
RETURNS TABLE (
  academic_year_id uuid,
  status text,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_request_id text := nullif(current_setting('app.request_id', true), '');
  v_occurred_at timestamp with time zone := clock_timestamp();
  v_term_count integer;
  v_level_count integer;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_academic_configurator'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.academic_structure.manage'
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR v_request_id IS NULL
    OR p_academic_year_id IS NULL
    OR p_school_id IS NULL
    OR char_length(btrim(p_code)) NOT BETWEEN 1 AND 64
    OR p_code !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
    OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 128
    OR p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_end_date < p_start_date
    OR jsonb_typeof(p_terms) <> 'array'
    OR jsonb_array_length(p_terms) NOT BETWEEN 1 AND 20
    OR jsonb_typeof(p_levels) <> 'array'
    OR jsonb_array_length(p_levels) NOT BETWEEN 1 AND 30
    OR NOT public.openschool_school_scope_allows(v_tenant_id, p_school_id)
  THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_CREATE_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.schools AS school
    WHERE school.tenant_id = v_tenant_id
      AND school.id = p_school_id
      AND school.status = 'active'
  ) THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_SCHOOL_UNAVAILABLE' USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_time_zone
  ) THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_TIMEZONE_INVALID' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.academic_years (
    id, tenant_id, school_id, code, name, time_zone, start_date, end_date,
    status, source, migration_review_status, created_by_account_id, created_at, updated_at
  ) VALUES (
    p_academic_year_id, v_tenant_id, p_school_id, btrim(p_code), btrim(p_name),
    p_time_zone, p_start_date, p_end_date, 'draft', 'native', 'not_required',
    v_account_id, v_occurred_at, v_occurred_at
  );

  INSERT INTO public.academic_terms (
    tenant_id, school_id, academic_year_id, code, name, ordinal, start_date, end_date
  )
  SELECT
    v_tenant_id,
    p_school_id,
    p_academic_year_id,
    btrim(term.code),
    btrim(term.name),
    term.ordinal,
    term.start_date,
    term.end_date
  FROM jsonb_to_recordset(p_terms) AS term(
    code text,
    name text,
    ordinal integer,
    start_date date,
    end_date date
  );

  SELECT count(*) INTO v_term_count
  FROM public.academic_terms
  WHERE tenant_id = v_tenant_id AND academic_year_id = p_academic_year_id;
  IF v_term_count <> jsonb_array_length(p_terms)
    OR NOT EXISTS (
      SELECT 1
      FROM public.academic_terms
      WHERE tenant_id = v_tenant_id AND academic_year_id = p_academic_year_id
      HAVING min(ordinal) = 1 AND max(ordinal) = count(*)
    )
    OR EXISTS (
      SELECT 1
      FROM (
        SELECT start_date, lag(end_date) OVER (ORDER BY ordinal) AS previous_end_date
        FROM public.academic_terms
        WHERE tenant_id = v_tenant_id AND academic_year_id = p_academic_year_id
      ) AS ordered_terms
      WHERE previous_end_date IS NOT NULL AND start_date <= previous_end_date
    )
  THEN
    RAISE EXCEPTION 'ACADEMIC_TERMS_ORDER_INVALID' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.learner_levels (
    tenant_id, school_id, academic_year_id, code, name, ordinal, education_stage
  )
  SELECT
    v_tenant_id,
    p_school_id,
    p_academic_year_id,
    btrim(level.code),
    btrim(level.name),
    level.ordinal,
    nullif(btrim(level.education_stage), '')
  FROM jsonb_to_recordset(p_levels) AS level(
    code text,
    name text,
    ordinal integer,
    education_stage text
  );

  SELECT count(*) INTO v_level_count
  FROM public.learner_levels
  WHERE tenant_id = v_tenant_id AND academic_year_id = p_academic_year_id;
  IF v_level_count <> jsonb_array_length(p_levels)
    OR NOT EXISTS (
      SELECT 1
      FROM public.learner_levels
      WHERE tenant_id = v_tenant_id AND academic_year_id = p_academic_year_id
      HAVING min(ordinal) = 1 AND max(ordinal) = count(*)
    )
  THEN
    RAISE EXCEPTION 'LEARNER_LEVELS_ORDER_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN QUERY SELECT p_academic_year_id, 'draft'::text, v_occurred_at;
END
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."approve_academic_year_review"(
  p_academic_year_id uuid
)
RETURNS TABLE (
  academic_year_id uuid,
  status text,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_occurred_at timestamp with time zone := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_academic_configurator'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.academic_structure.manage'
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR p_academic_year_id IS NULL
  THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_REVIEW_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  UPDATE public.academic_years
  SET migration_review_status = 'approved', updated_at = v_occurred_at
  WHERE tenant_id = v_tenant_id
    AND id = p_academic_year_id
    AND status = 'draft'
    AND source = 'legacy_backfill'
    AND migration_review_status = 'needs_review';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_REVIEW_STATE_INVALID' USING ERRCODE = '55000';
  END IF;

  RETURN QUERY SELECT p_academic_year_id, 'draft'::text, v_occurred_at;
END
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."publish_academic_year"(
  p_academic_year_id uuid
)
RETURNS TABLE (
  academic_year_id uuid,
  status text,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_year public.academic_years%ROWTYPE;
  v_occurred_at timestamp with time zone := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_academic_configurator'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.academic_structure.manage'
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR p_academic_year_id IS NULL
  THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_PUBLISH_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_year
  FROM public.academic_years
  WHERE tenant_id = v_tenant_id AND id = p_academic_year_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_year.status <> 'draft'
    OR v_year.migration_review_status = 'needs_review'
    OR NOT public.openschool_school_scope_allows(v_tenant_id, v_year.school_id)
  THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_PUBLISH_STATE_INVALID' USING ERRCODE = '55000';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_tenant_id::text || ':' || v_year.school_id::text, 0)
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.academic_terms
    WHERE tenant_id = v_tenant_id AND academic_year_id = p_academic_year_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.learner_levels
    WHERE tenant_id = v_tenant_id AND academic_year_id = p_academic_year_id
  ) THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_STRUCTURE_INCOMPLETE' USING ERRCODE = '23514';
  END IF;

  UPDATE public.academic_years
  SET status = 'published', published_at = v_occurred_at,
    published_by_account_id = v_account_id, updated_at = v_occurred_at
  WHERE tenant_id = v_tenant_id AND id = p_academic_year_id AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_PUBLISH_CONFLICT' USING ERRCODE = '40001';
  END IF;

  RETURN QUERY SELECT p_academic_year_id, 'published'::text, v_occurred_at;
END
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."close_academic_year"(
  p_academic_year_id uuid,
  p_reason text
)
RETURNS TABLE (
  academic_year_id uuid,
  status text,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_year public.academic_years%ROWTYPE;
  v_occurred_at timestamp with time zone := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_academic_configurator'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.academic_structure.manage'
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR p_academic_year_id IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
  THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_CLOSE_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_year
  FROM public.academic_years
  WHERE tenant_id = v_tenant_id AND id = p_academic_year_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_year.status <> 'published'
    OR NOT public.openschool_school_scope_allows(v_tenant_id, v_year.school_id)
  THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_CLOSE_STATE_INVALID' USING ERRCODE = '55000';
  END IF;

  UPDATE public.academic_years
  SET status = 'closed', closed_at = v_occurred_at,
    closed_by_account_id = v_account_id, closure_reason = btrim(p_reason),
    updated_at = v_occurred_at
  WHERE tenant_id = v_tenant_id AND id = p_academic_year_id AND status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACADEMIC_YEAR_CLOSE_CONFLICT' USING ERRCODE = '40001';
  END IF;

  RETURN QUERY SELECT p_academic_year_id, 'closed'::text, v_occurred_at;
END
$$;--> statement-breakpoint

ALTER FUNCTION "openschool_private"."create_academic_year"(
  uuid, uuid, text, text, text, date, date, jsonb, jsonb
) OWNER TO "openschool_academic_configurator";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."approve_academic_year_review"(uuid)
  OWNER TO "openschool_academic_configurator";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."publish_academic_year"(uuid)
  OWNER TO "openschool_academic_configurator";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."close_academic_year"(uuid, text)
  OWNER TO "openschool_academic_configurator";--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_private"."create_academic_year"(
  uuid, uuid, text, text, text, date, date, jsonb, jsonb
) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."approve_academic_year_review"(uuid)
  FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."publish_academic_year"(uuid)
  FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."close_academic_year"(uuid, text)
  FROM PUBLIC;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION "openschool_private"."create_academic_year"(
  uuid, uuid, text, text, text, date, date, jsonb, jsonb
) TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."approve_academic_year_review"(uuid)
  TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."publish_academic_year"(uuid)
  TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."close_academic_year"(uuid, text)
  TO "openschool_runtime";--> statement-breakpoint

REVOKE INSERT, UPDATE, DELETE ON TABLE "academic_years", "academic_terms", "learner_levels",
  "academic_compatibility_evidence" FROM "openschool_runtime";--> statement-breakpoint
GRANT SELECT ON TABLE "academic_years", "academic_terms", "learner_levels",
  "academic_compatibility_evidence" TO "openschool_runtime";--> statement-breakpoint

DO $$
DECLARE
  unsafe_role boolean;
BEGIN
  SELECT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls
  INTO unsafe_role
  FROM pg_catalog.pg_roles
  WHERE rolname = 'openschool_academic_configurator';

  IF unsafe_role IS NULL OR unsafe_role THEN
    RAISE EXCEPTION 'Academic configurator role attributes are unsafe';
  END IF;

  IF pg_catalog.pg_has_role('openschool_runtime', 'openschool_academic_configurator', 'member')
    OR pg_catalog.pg_has_role('openschool_worker', 'openschool_academic_configurator', 'member')
    OR pg_catalog.pg_has_role('openschool_control_plane', 'openschool_academic_configurator', 'member')
  THEN
    RAISE EXCEPTION 'Execution roles must not assume the Academic configurator';
  END IF;
END
$$;
