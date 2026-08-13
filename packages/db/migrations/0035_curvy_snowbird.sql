CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"course_type" text NOT NULL,
	"subject_area" text,
	"description" text,
	"credit_value" numeric(8, 3),
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_account_id" uuid NOT NULL,
	"creation_reason" text NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_account_id" uuid,
	"archive_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "courses_tenant_school_id_id_unique" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "courses_tenant_school_code_unique" UNIQUE("tenant_id","school_id","code"),
	CONSTRAINT "courses_code_check" CHECK (char_length(btrim("courses"."code")) BETWEEN 1 AND 64 AND "courses"."code" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
	CONSTRAINT "courses_name_check" CHECK (char_length(btrim("courses"."name")) BETWEEN 1 AND 160),
	CONSTRAINT "courses_type_check" CHECK ("courses"."course_type" IN ('general', 'subject', 'elective', 'support')),
	CONSTRAINT "courses_credit_check" CHECK ("courses"."credit_value" IS NULL OR ("courses"."credit_value" >= 0 AND "courses"."credit_value" <= 100)),
	CONSTRAINT "courses_creation_reason_check" CHECK (char_length(btrim("courses"."creation_reason")) BETWEEN 3 AND 512),
	CONSTRAINT "courses_archive_evidence_check" CHECK ("courses"."status" <> 'archived' OR ("courses"."archived_at" IS NOT NULL AND "courses"."archived_by_account_id" IS NOT NULL AND char_length(btrim("courses"."archive_reason")) BETWEEN 3 AND 512))
);
--> statement-breakpoint
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "section_compatibility_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"legacy_class_id" uuid NOT NULL,
	"section_id" uuid,
	"mapping_status" text NOT NULL,
	"legacy_roster_count" integer NOT NULL,
	"canonical_roster_count" integer NOT NULL,
	"legacy_roster_hash" text,
	"canonical_roster_hash" text,
	"reason" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "section_compatibility_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "section_compatibility_legacy_class_unique" UNIQUE("tenant_id","legacy_class_id"),
	CONSTRAINT "section_compatibility_status_check" CHECK ("section_compatibility_evidence"."mapping_status" IN ('mapped', 'unmapped', 'review_required')),
	CONSTRAINT "section_compatibility_counts_check" CHECK ("section_compatibility_evidence"."legacy_roster_count" >= 0 AND "section_compatibility_evidence"."canonical_roster_count" >= 0),
	CONSTRAINT "section_compatibility_mapping_check" CHECK ("section_compatibility_evidence"."mapping_status" <> 'mapped' OR ("section_compatibility_evidence"."section_id" IS NOT NULL AND "section_compatibility_evidence"."legacy_roster_count" = "section_compatibility_evidence"."canonical_roster_count" AND "section_compatibility_evidence"."legacy_roster_hash" = "section_compatibility_evidence"."canonical_roster_hash")),
	CONSTRAINT "section_compatibility_reason_check" CHECK (char_length(btrim("section_compatibility_evidence"."reason")) BETWEEN 3 AND 512)
);
--> statement-breakpoint
ALTER TABLE "section_compatibility_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "section_roster_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"school_enrollment_id" uuid NOT NULL,
	"roster_key" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"issued_by_account_id" uuid NOT NULL,
	"issuance_reason" text NOT NULL,
	"ended_by_account_id" uuid,
	"end_reason" text,
	"legacy_enrollment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "section_rosters_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "section_rosters_key_version_unique" UNIQUE("tenant_id","roster_key","version"),
	CONSTRAINT "section_rosters_legacy_enrollment_unique" UNIQUE("tenant_id","legacy_enrollment_id"),
	CONSTRAINT "section_rosters_period_check" CHECK ("section_roster_memberships"."valid_until" IS NULL OR "section_roster_memberships"."valid_until" > "section_roster_memberships"."valid_from"),
	CONSTRAINT "section_rosters_end_evidence_check" CHECK ("section_roster_memberships"."status" <> 'ended' OR ("section_roster_memberships"."valid_until" IS NOT NULL AND "section_roster_memberships"."ended_by_account_id" IS NOT NULL AND char_length(btrim("section_roster_memberships"."end_reason")) BETWEEN 3 AND 512)),
	CONSTRAINT "section_rosters_version_positive" CHECK ("section_roster_memberships"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "section_roster_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "section_staff_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"assignment_key" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"role" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"issued_by_account_id" uuid NOT NULL,
	"issuance_reason" text NOT NULL,
	"ended_by_account_id" uuid,
	"end_reason" text,
	"legacy_teacher_class_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "section_staff_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "section_staff_key_version_unique" UNIQUE("tenant_id","assignment_key","version"),
	CONSTRAINT "section_staff_legacy_assignment_unique" UNIQUE("tenant_id","legacy_teacher_class_id"),
	CONSTRAINT "section_staff_role_check" CHECK ("section_staff_assignments"."role" IN ('lead_teacher', 'teacher', 'assistant', 'counselor')),
	CONSTRAINT "section_staff_period_check" CHECK ("section_staff_assignments"."valid_until" IS NULL OR "section_staff_assignments"."valid_until" > "section_staff_assignments"."valid_from"),
	CONSTRAINT "section_staff_end_evidence_check" CHECK ("section_staff_assignments"."status" <> 'ended' OR ("section_staff_assignments"."valid_until" IS NOT NULL AND "section_staff_assignments"."ended_by_account_id" IS NOT NULL AND char_length(btrim("section_staff_assignments"."end_reason")) BETWEEN 3 AND 512)),
	CONSTRAINT "section_staff_version_positive" CHECK ("section_staff_assignments"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "section_staff_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"academic_term_id" uuid,
	"learner_level_id" uuid,
	"course_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"section_type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"capacity" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'native' NOT NULL,
	"legacy_class_id" uuid,
	"created_by_account_id" uuid NOT NULL,
	"creation_reason" text NOT NULL,
	"activated_at" timestamp with time zone,
	"activated_by_account_id" uuid,
	"closed_at" timestamp with time zone,
	"closed_by_account_id" uuid,
	"closure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sections_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "sections_tenant_school_id_id_unique" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "sections_year_code_unique" UNIQUE("tenant_id","academic_year_id","code"),
	CONSTRAINT "sections_legacy_class_unique" UNIQUE("tenant_id","legacy_class_id"),
	CONSTRAINT "sections_code_check" CHECK (char_length(btrim("sections"."code")) BETWEEN 1 AND 64 AND "sections"."code" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
	CONSTRAINT "sections_name_check" CHECK (char_length(btrim("sections"."name")) BETWEEN 1 AND 160),
	CONSTRAINT "sections_type_check" CHECK ("sections"."section_type" IN ('homeroom', 'course')),
	CONSTRAINT "sections_course_requirement_check" CHECK ("sections"."section_type" <> 'course' OR "sections"."course_id" IS NOT NULL),
	CONSTRAINT "sections_dates_check" CHECK ("sections"."end_date" >= "sections"."start_date"),
	CONSTRAINT "sections_capacity_check" CHECK ("sections"."capacity" IS NULL OR "sections"."capacity" > 0),
	CONSTRAINT "sections_version_positive" CHECK ("sections"."version" > 0),
	CONSTRAINT "sections_source_check" CHECK ("sections"."source" IN ('native', 'legacy_backfill') AND ("sections"."source" <> 'legacy_backfill' OR "sections"."legacy_class_id" IS NOT NULL)),
	CONSTRAINT "sections_creation_reason_check" CHECK (char_length(btrim("sections"."creation_reason")) BETWEEN 3 AND 512),
	CONSTRAINT "sections_activation_evidence_check" CHECK ("sections"."status" = 'draft' OR ("sections"."activated_at" IS NOT NULL AND "sections"."activated_by_account_id" IS NOT NULL)),
	CONSTRAINT "sections_closure_evidence_check" CHECK ("sections"."status" <> 'closed' OR ("sections"."closed_at" IS NOT NULL AND "sections"."closed_by_account_id" IS NOT NULL AND char_length(btrim("sections"."closure_reason")) BETWEEN 3 AND 512))
);
--> statement-breakpoint
ALTER TABLE "sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_archived_by_account_id_accounts_id_fk" FOREIGN KEY ("archived_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_compatibility_evidence" ADD CONSTRAINT "section_compatibility_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_compatibility_evidence" ADD CONSTRAINT "section_compatibility_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_compatibility_evidence" ADD CONSTRAINT "section_compatibility_tenant_legacy_class_fk" FOREIGN KEY ("tenant_id","legacy_class_id") REFERENCES "public"."classes"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_compatibility_evidence" ADD CONSTRAINT "section_compatibility_tenant_section_fk" FOREIGN KEY ("tenant_id","section_id") REFERENCES "public"."sections"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_roster_memberships" ADD CONSTRAINT "section_roster_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_roster_memberships" ADD CONSTRAINT "section_roster_memberships_issued_by_account_id_accounts_id_fk" FOREIGN KEY ("issued_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_roster_memberships" ADD CONSTRAINT "section_roster_memberships_ended_by_account_id_accounts_id_fk" FOREIGN KEY ("ended_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_roster_memberships" ADD CONSTRAINT "section_rosters_tenant_section_fk" FOREIGN KEY ("tenant_id","school_id","section_id") REFERENCES "public"."sections"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_roster_memberships" ADD CONSTRAINT "section_rosters_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_roster_memberships" ADD CONSTRAINT "section_rosters_tenant_school_enrollment_fk" FOREIGN KEY ("tenant_id","school_enrollment_id") REFERENCES "public"."school_enrollments"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_roster_memberships" ADD CONSTRAINT "section_rosters_tenant_legacy_enrollment_fk" FOREIGN KEY ("tenant_id","legacy_enrollment_id") REFERENCES "public"."enrollments"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_staff_assignments" ADD CONSTRAINT "section_staff_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_staff_assignments" ADD CONSTRAINT "section_staff_assignments_issued_by_account_id_accounts_id_fk" FOREIGN KEY ("issued_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_staff_assignments" ADD CONSTRAINT "section_staff_assignments_ended_by_account_id_accounts_id_fk" FOREIGN KEY ("ended_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_staff_assignments" ADD CONSTRAINT "section_staff_tenant_section_fk" FOREIGN KEY ("tenant_id","school_id","section_id") REFERENCES "public"."sections"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_staff_assignments" ADD CONSTRAINT "section_staff_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "section_staff_assignments" ADD CONSTRAINT "section_staff_tenant_legacy_assignment_fk" FOREIGN KEY ("tenant_id","legacy_teacher_class_id") REFERENCES "public"."teachers_on_class"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_activated_by_account_id_accounts_id_fk" FOREIGN KEY ("activated_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_closed_by_account_id_accounts_id_fk" FOREIGN KEY ("closed_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_tenant_school_year_fk" FOREIGN KEY ("tenant_id","school_id","academic_year_id") REFERENCES "public"."academic_years"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_tenant_school_term_fk" FOREIGN KEY ("tenant_id","school_id","academic_term_id") REFERENCES "public"."academic_terms"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_tenant_school_level_fk" FOREIGN KEY ("tenant_id","school_id","learner_level_id") REFERENCES "public"."learner_levels"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_tenant_school_course_fk" FOREIGN KEY ("tenant_id","school_id","course_id") REFERENCES "public"."courses"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_tenant_legacy_class_fk" FOREIGN KEY ("tenant_id","legacy_class_id") REFERENCES "public"."classes"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "courses_tenant_school_status_name_idx" ON "courses" USING btree ("tenant_id","school_id","status","name","id");--> statement-breakpoint
CREATE INDEX "section_compatibility_tenant_school_status_idx" ON "section_compatibility_evidence" USING btree ("tenant_id","school_id","mapping_status","id");--> statement-breakpoint
CREATE INDEX "section_rosters_tenant_section_effective_idx" ON "section_roster_memberships" USING btree ("tenant_id","section_id","status","valid_from","valid_until","person_id");--> statement-breakpoint
CREATE INDEX "section_rosters_tenant_person_effective_idx" ON "section_roster_memberships" USING btree ("tenant_id","person_id","status","valid_from","valid_until","section_id");--> statement-breakpoint
CREATE INDEX "section_staff_tenant_section_effective_idx" ON "section_staff_assignments" USING btree ("tenant_id","section_id","status","valid_from","valid_until","person_id");--> statement-breakpoint
CREATE INDEX "sections_tenant_school_year_status_idx" ON "sections" USING btree ("tenant_id","school_id","academic_year_id","status","start_date","id");--> statement-breakpoint

-- Legacy Class labels do not establish authoritative date boundaries. Preserve
-- a complete parity/rollback record and keep those Classes on the legacy read
-- path until an administrator explicitly places them in a canonical year.
INSERT INTO "section_compatibility_evidence" (
  "tenant_id", "school_id", "legacy_class_id", "mapping_status",
  "legacy_roster_count", "canonical_roster_count", "legacy_roster_hash",
  "canonical_roster_hash", "reason"
)
SELECT
  legacy_class.tenant_id,
  legacy_class.school_id,
  legacy_class.id,
  'unmapped',
  count(legacy_enrollment.id)::integer,
  0,
  md5(COALESCE(string_agg(legacy_enrollment.id::text, ',' ORDER BY legacy_enrollment.id), '')),
  md5(''),
  'Legacy Class Academic Year is a label without authoritative dates; retained on the legacy read path pending explicit placement.'
FROM public.classes AS legacy_class
LEFT JOIN public.enrollments AS legacy_enrollment
  ON legacy_enrollment.tenant_id = legacy_class.tenant_id
  AND legacy_enrollment.class_id = legacy_class.id
  AND legacy_enrollment.status = 'active'
GROUP BY legacy_class.tenant_id, legacy_class.school_id, legacy_class.id
ON CONFLICT (tenant_id, legacy_class_id) DO NOTHING;--> statement-breakpoint

ALTER TABLE "courses" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "section_staff_assignments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "section_roster_memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "section_compatibility_evidence" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "section_staff_assignments"
  ADD CONSTRAINT "section_staff_no_effective_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "section_id" WITH =,
    "person_id" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active');--> statement-breakpoint
ALTER TABLE "section_staff_assignments"
  ADD CONSTRAINT "section_staff_primary_no_effective_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "section_id" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active' AND "is_primary");--> statement-breakpoint
ALTER TABLE "section_roster_memberships"
  ADD CONSTRAINT "section_rosters_no_effective_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "section_id" WITH =,
    "person_id" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active');--> statement-breakpoint

CREATE POLICY "sections_scope_resolver_select" ON "sections"
  AS PERMISSIVE FOR SELECT TO "openschool_section_scope_resolver" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_section_scope_resolver'
    AND "sections"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND nullif(current_setting('app.policy_capability', true), '')
      IN ('tenant.sections.read', 'tenant.sections.manage')
  );--> statement-breakpoint
CREATE POLICY "section_staff_scope_resolver_select" ON "section_staff_assignments"
  AS PERMISSIVE FOR SELECT TO "openschool_section_scope_resolver" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_section_scope_resolver'
    AND "section_staff_assignments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND nullif(current_setting('app.policy_capability', true), '')
      IN ('tenant.sections.read', 'tenant.sections.manage')
  );--> statement-breakpoint
CREATE POLICY "section_rosters_scope_resolver_select" ON "section_roster_memberships"
  AS PERMISSIVE FOR SELECT TO "openschool_section_scope_resolver" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_section_scope_resolver'
    AND "section_roster_memberships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND nullif(current_setting('app.policy_capability', true), '')
      IN ('tenant.sections.read', 'tenant.sections.manage')
  );--> statement-breakpoint

CREATE FUNCTION "openschool_section_scope_allows"(
  row_tenant_id uuid,
  row_school_id uuid,
  row_section_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT public.openschool_school_scope_allows(row_tenant_id, row_school_id)
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(public.openschool_policy_constraints()) AS policy_constraint
      WHERE policy_constraint ->> 'tenantId' = row_tenant_id::text
        AND (
          (
            policy_constraint ->> 'kind' = 'class'
            AND policy_constraint ->> 'actorPersonId' = nullif(current_setting('app.person_id', true), '')
            AND (policy_constraint ->> 'schoolId' IS NULL OR policy_constraint ->> 'schoolId' = row_school_id::text)
            AND (policy_constraint ->> 'classId' IS NULL OR policy_constraint ->> 'classId' = row_section_id::text)
            AND EXISTS (
              SELECT 1 FROM public.section_staff_assignments AS assignment
              WHERE assignment.tenant_id = row_tenant_id
                AND assignment.section_id = row_section_id
                AND assignment.person_id::text = nullif(current_setting('app.person_id', true), '')
                AND assignment.status = 'active'
                AND assignment.valid_from <= now()
                AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
            )
          )
          OR (
            policy_constraint ->> 'kind' = 'self'
            AND policy_constraint ->> 'personId' = nullif(current_setting('app.person_id', true), '')
            AND EXISTS (
              SELECT 1 FROM public.section_roster_memberships AS roster
              WHERE roster.tenant_id = row_tenant_id
                AND roster.section_id = row_section_id
                AND roster.person_id::text = nullif(current_setting('app.person_id', true), '')
                AND roster.status = 'active'
                AND roster.valid_from <= now()
                AND (roster.valid_until IS NULL OR roster.valid_until > now())
            )
          )
          OR (
            policy_constraint ->> 'kind' = 'linked_student'
            AND policy_constraint ->> 'guardianPersonId' = nullif(current_setting('app.person_id', true), '')
            AND (policy_constraint ->> 'classId' IS NULL OR policy_constraint ->> 'classId' = row_section_id::text)
            AND EXISTS (
              SELECT 1 FROM public.section_roster_memberships AS roster
              WHERE roster.tenant_id = row_tenant_id
                AND roster.section_id = row_section_id
                AND roster.status = 'active'
                AND roster.valid_from <= now()
                AND (roster.valid_until IS NULL OR roster.valid_until > now())
                AND public.openschool_guardian_contact_read_scope_allows(row_tenant_id, roster.person_id)
            )
          )
        )
    )
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_section_roster_scope_allows"(
  row_tenant_id uuid,
  row_school_id uuid,
  row_section_id uuid,
  row_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT public.openschool_school_scope_allows(row_tenant_id, row_school_id)
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(public.openschool_policy_constraints()) AS policy_constraint
      WHERE policy_constraint ->> 'tenantId' = row_tenant_id::text
        AND (
          (
            policy_constraint ->> 'kind' = 'class'
            AND policy_constraint ->> 'actorPersonId' = nullif(current_setting('app.person_id', true), '')
            AND (policy_constraint ->> 'schoolId' IS NULL OR policy_constraint ->> 'schoolId' = row_school_id::text)
            AND (policy_constraint ->> 'classId' IS NULL OR policy_constraint ->> 'classId' = row_section_id::text)
            AND EXISTS (
              SELECT 1 FROM public.section_staff_assignments AS assignment
              WHERE assignment.tenant_id = row_tenant_id
                AND assignment.section_id = row_section_id
                AND assignment.person_id::text = nullif(current_setting('app.person_id', true), '')
                AND assignment.status = 'active'
                AND assignment.valid_from <= now()
                AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
            )
          )
          OR (
            policy_constraint ->> 'kind' = 'self'
            AND policy_constraint ->> 'personId' = row_person_id::text
            AND row_person_id::text = nullif(current_setting('app.person_id', true), '')
          )
          OR (
            policy_constraint ->> 'kind' = 'linked_student'
            AND policy_constraint ->> 'guardianPersonId' = nullif(current_setting('app.person_id', true), '')
            AND (policy_constraint ->> 'studentId' IS NULL OR policy_constraint ->> 'studentId' = row_person_id::text)
            AND (policy_constraint ->> 'classId' IS NULL OR policy_constraint ->> 'classId' = row_section_id::text)
            AND public.openschool_guardian_contact_read_scope_allows(row_tenant_id, row_person_id)
          )
        )
    )
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_course_scope_allows"(
  row_tenant_id uuid,
  row_school_id uuid,
  row_course_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT public.openschool_school_scope_allows(row_tenant_id, row_school_id)
    OR EXISTS (
      SELECT 1 FROM public.sections AS section
      WHERE section.tenant_id = row_tenant_id
        AND section.school_id = row_school_id
        AND section.course_id = row_course_id
        AND public.openschool_section_scope_allows(row_tenant_id, row_school_id, section.id)
    )
$$;--> statement-breakpoint

ALTER FUNCTION "openschool_section_scope_allows"(uuid, uuid, uuid)
  OWNER TO "openschool_section_scope_resolver";--> statement-breakpoint
ALTER FUNCTION "openschool_section_roster_scope_allows"(uuid, uuid, uuid, uuid)
  OWNER TO "openschool_section_scope_resolver";--> statement-breakpoint
ALTER FUNCTION "openschool_course_scope_allows"(uuid, uuid, uuid)
  OWNER TO "openschool_section_scope_resolver";--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_section_scope_allows"(uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_section_roster_scope_allows"(uuid, uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_course_scope_allows"(uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_section_scope_allows"(uuid, uuid, uuid),
  "openschool_section_roster_scope_allows"(uuid, uuid, uuid, uuid),
  "openschool_course_scope_allows"(uuid, uuid, uuid)
  TO "openschool_runtime", "openschool_section_manager";--> statement-breakpoint
GRANT USAGE ON SCHEMA "public" TO "openschool_section_scope_resolver";--> statement-breakpoint
GRANT SELECT ON "sections", "section_staff_assignments", "section_roster_memberships",
  "school_governance_assignments", "organization_tree_closure", "organization_tree_versions"
  TO "openschool_section_scope_resolver";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_policy_constraints"(),
  "openschool_school_scope_allows"(uuid, uuid),
  "openschool_guardian_contact_read_scope_allows"(uuid, uuid)
  TO "openschool_section_scope_resolver";--> statement-breakpoint

CREATE POLICY "courses_runtime_select" ON "courses" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "courses"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.sections.read', 'tenant.sections.manage')
        AND public.openschool_course_scope_allows("courses"."tenant_id", "courses"."school_id", "courses"."id")
      );--> statement-breakpoint
CREATE POLICY "courses_runtime_write_deny" ON "courses" AS PERMISSIVE FOR ALL TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "courses_manager_all" ON "courses" AS PERMISSIVE FOR ALL TO "openschool_section_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_section_manager'
  AND "courses"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.sections.manage'
  AND public.openschool_school_scope_allows("courses"."tenant_id", "courses"."school_id")
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_section_manager'
  AND "courses"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.sections.manage'
  AND public.openschool_school_scope_allows("courses"."tenant_id", "courses"."school_id")
);--> statement-breakpoint
CREATE POLICY "section_compatibility_runtime_select" ON "section_compatibility_evidence" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "section_compatibility_evidence"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.sections.read', 'tenant.sections.manage')
        AND public.openschool_school_scope_allows("section_compatibility_evidence"."tenant_id", "section_compatibility_evidence"."school_id")
      );--> statement-breakpoint
CREATE POLICY "section_compatibility_runtime_write_deny" ON "section_compatibility_evidence" AS PERMISSIVE FOR ALL TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "section_rosters_runtime_select" ON "section_roster_memberships" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "section_roster_memberships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.sections.read', 'tenant.sections.manage')
        AND public.openschool_section_roster_scope_allows(
          "section_roster_memberships"."tenant_id", "section_roster_memberships"."school_id", "section_roster_memberships"."section_id", "section_roster_memberships"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "section_rosters_runtime_write_deny" ON "section_roster_memberships" AS PERMISSIVE FOR ALL TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "section_rosters_manager_all" ON "section_roster_memberships" AS PERMISSIVE FOR ALL TO "openschool_section_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_section_manager'
  AND "section_roster_memberships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.sections.manage'
  AND public.openschool_school_scope_allows("section_roster_memberships"."tenant_id", "section_roster_memberships"."school_id")
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_section_manager'
  AND "section_roster_memberships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.sections.manage'
  AND public.openschool_school_scope_allows("section_roster_memberships"."tenant_id", "section_roster_memberships"."school_id")
);--> statement-breakpoint
CREATE POLICY "section_staff_runtime_select" ON "section_staff_assignments" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "section_staff_assignments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN ('tenant.sections.read', 'tenant.sections.manage')
  AND public.openschool_section_scope_allows("section_staff_assignments"."tenant_id", "section_staff_assignments"."school_id", "section_staff_assignments"."section_id")
);--> statement-breakpoint
CREATE POLICY "section_staff_runtime_write_deny" ON "section_staff_assignments" AS PERMISSIVE FOR ALL TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "section_staff_manager_all" ON "section_staff_assignments" AS PERMISSIVE FOR ALL TO "openschool_section_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_section_manager'
  AND "section_staff_assignments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.sections.manage'
  AND public.openschool_school_scope_allows("section_staff_assignments"."tenant_id", "section_staff_assignments"."school_id")
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_section_manager'
  AND "section_staff_assignments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.sections.manage'
  AND public.openschool_school_scope_allows("section_staff_assignments"."tenant_id", "section_staff_assignments"."school_id")
);--> statement-breakpoint
CREATE POLICY "sections_runtime_select" ON "sections" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "sections"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN ('tenant.sections.read', 'tenant.sections.manage')
  AND public.openschool_section_scope_allows("sections"."tenant_id", "sections"."school_id", "sections"."id")
);--> statement-breakpoint
CREATE POLICY "sections_runtime_write_deny" ON "sections" AS PERMISSIVE FOR ALL TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "sections_manager_all" ON "sections" AS PERMISSIVE FOR ALL TO "openschool_section_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_section_manager'
  AND "sections"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.sections.manage'
  AND public.openschool_school_scope_allows("sections"."tenant_id", "sections"."school_id")
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_section_manager'
  AND "sections"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.sections.manage'
  AND public.openschool_school_scope_allows("sections"."tenant_id", "sections"."school_id")
);
