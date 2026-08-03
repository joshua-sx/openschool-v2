CREATE TABLE "school_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"student_affiliation_id" uuid NOT NULL,
	"legacy_student_id" uuid,
	"enrollment_type" text DEFAULT 'primary' NOT NULL,
	"status" text DEFAULT 'enrolled' NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"admission_reason" text NOT NULL,
	"source" text DEFAULT 'native' NOT NULL,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_enrollments_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "school_enrollments_type_check" CHECK ("school_enrollments"."enrollment_type" IN ('primary', 'secondary')),
	CONSTRAINT "school_enrollments_status_check" CHECK ("school_enrollments"."status" IN ('enrolled', 'withdrawn', 'graduated', 'cancelled')),
	CONSTRAINT "school_enrollments_source_check" CHECK ("school_enrollments"."source" IN ('legacy_backfill', 'native')),
	CONSTRAINT "school_enrollments_valid_period_check" CHECK ("school_enrollments"."valid_until" IS NULL OR "school_enrollments"."valid_until" > "school_enrollments"."valid_from"),
	CONSTRAINT "school_enrollments_closed_status_check" CHECK ("school_enrollments"."status" = 'enrolled' OR "school_enrollments"."valid_until" IS NOT NULL),
	CONSTRAINT "school_enrollments_legacy_source_check" CHECK ("school_enrollments"."source" <> 'legacy_backfill' OR "school_enrollments"."legacy_student_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "school_enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_compatibility_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"school_enrollment_id" uuid NOT NULL,
	"student_affiliation_id" uuid NOT NULL,
	"legacy_student_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"parity_status" text NOT NULL,
	"canonical_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legacy_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text NOT NULL,
	"recorded_by_account_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_compatibility_evidence_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "student_compatibility_evidence_request_unique" UNIQUE("tenant_id","person_id","request_id","operation"),
	CONSTRAINT "student_compatibility_evidence_operation_check" CHECK ("student_compatibility_evidence"."operation" IN ('backfill', 'create', 'update')),
	CONSTRAINT "student_compatibility_evidence_parity_check" CHECK ("student_compatibility_evidence"."parity_status" IN ('matched', 'mismatch')),
	CONSTRAINT "student_compatibility_evidence_request_check" CHECK (btrim("student_compatibility_evidence"."request_id") <> '')
);
--> statement-breakpoint
ALTER TABLE "student_compatibility_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_tenant_affiliation_fk" FOREIGN KEY ("tenant_id","student_affiliation_id") REFERENCES "public"."affiliations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_tenant_legacy_student_fk" FOREIGN KEY ("tenant_id","legacy_student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "student_compatibility_evidence" ADD CONSTRAINT "student_compatibility_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "student_compatibility_evidence" ADD CONSTRAINT "student_compatibility_evidence_recorded_by_account_id_accounts_id_fk" FOREIGN KEY ("recorded_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "student_compatibility_evidence" ADD CONSTRAINT "student_compatibility_evidence_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "student_compatibility_evidence" ADD CONSTRAINT "student_compatibility_evidence_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "student_compatibility_evidence" ADD CONSTRAINT "student_compatibility_evidence_tenant_enrollment_fk" FOREIGN KEY ("tenant_id","school_enrollment_id") REFERENCES "public"."school_enrollments"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "student_compatibility_evidence" ADD CONSTRAINT "student_compatibility_evidence_tenant_affiliation_fk" FOREIGN KEY ("tenant_id","student_affiliation_id") REFERENCES "public"."affiliations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "student_compatibility_evidence" ADD CONSTRAINT "student_compatibility_evidence_tenant_legacy_student_fk" FOREIGN KEY ("tenant_id","legacy_student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "school_enrollments_tenant_school_current_idx" ON "school_enrollments" USING btree ("tenant_id","school_id","status","valid_from","valid_until","person_id");--> statement-breakpoint
CREATE INDEX "school_enrollments_tenant_person_history_idx" ON "school_enrollments" USING btree ("tenant_id","person_id","valid_from","id");--> statement-breakpoint
CREATE INDEX "student_compatibility_evidence_tenant_person_idx" ON "student_compatibility_evidence" USING btree ("tenant_id","person_id","recorded_at","id");--> statement-breakpoint

CREATE FUNCTION "openschool_canonical_student_scope_allows"(
  row_tenant_id uuid,
  row_school_id uuid,
  row_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  SELECT public.openschool_school_scope_allows(row_tenant_id, row_school_id)
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(public.openschool_policy_constraints()) AS policy_constraint
      WHERE policy_constraint ->> 'tenantId' = row_tenant_id::text
        AND (
          (
            policy_constraint ->> 'kind' = 'class'
            AND policy_constraint ->> 'actorPersonId' =
              nullif(current_setting('app.person_id', true), '')
            AND (
              policy_constraint ->> 'schoolId' IS NULL
              OR policy_constraint ->> 'schoolId' = row_school_id::text
            )
            AND EXISTS (
              SELECT 1
              FROM public.student_profiles AS profile
              INNER JOIN public.enrollments AS enrollment
                ON enrollment.tenant_id = profile.tenant_id
                AND enrollment.student_id = profile.legacy_student_id
                AND enrollment.status = 'active'
              INNER JOIN public.affiliations AS teacher_affiliation
                ON teacher_affiliation.tenant_id = enrollment.tenant_id
                AND teacher_affiliation.class_id = enrollment.class_id
                AND teacher_affiliation.kind = 'teacher'
                AND teacher_affiliation.scope_type = 'class'
                AND teacher_affiliation.status = 'active'
                AND teacher_affiliation.valid_from <= now()
                AND (
                  teacher_affiliation.valid_until IS NULL
                  OR teacher_affiliation.valid_until > now()
                )
              WHERE profile.tenant_id = row_tenant_id
                AND profile.person_id = row_person_id
                AND profile.status = 'active'
                AND teacher_affiliation.person_id::text =
                  nullif(current_setting('app.person_id', true), '')
                AND (
                  policy_constraint ->> 'classId' IS NULL
                  OR policy_constraint ->> 'classId' = enrollment.class_id::text
                )
            )
          )
          OR (
            policy_constraint ->> 'kind' = 'self'
            AND policy_constraint ->> 'personId' = row_person_id::text
            AND row_person_id::text = nullif(current_setting('app.person_id', true), '')
          )
          OR (
            policy_constraint ->> 'kind' = 'linked_student'
            AND policy_constraint ->> 'guardianPersonId' =
              nullif(current_setting('app.person_id', true), '')
            AND EXISTS (
              SELECT 1
              FROM public.person_relationships AS relationship
              WHERE relationship.tenant_id = row_tenant_id
                AND relationship.subject_person_id::text =
                  nullif(current_setting('app.person_id', true), '')
                AND relationship.related_person_id = row_person_id
                AND relationship.type IN ('guardian_of', 'parent_of')
                AND relationship.status = 'active'
                AND relationship.valid_from <= now()
                AND (
                  relationship.valid_until IS NULL
                  OR relationship.valid_until > now()
                )
            )
          )
        )
    )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_canonical_student_scope_allows"(uuid, uuid, uuid)
  FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_canonical_student_scope_allows"(uuid, uuid, uuid)
  TO "openschool_runtime", "openschool_student_admitter";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_school_scope_allows"(uuid, uuid)
  TO "openschool_student_admitter";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_policy_constraints"()
  TO "openschool_student_admitter";--> statement-breakpoint

-- Capture any Student rows created after the original identity backfill before
-- establishing School Enrollment as the canonical read anchor.
INSERT INTO "people" (
  "tenant_id",
  "legacy_student_id",
  "display_name",
  "normalized_display_name",
  "first_name",
  "last_name",
  "date_of_birth",
  "email",
  "normalized_email",
  "status",
  "source",
  "created_at",
  "updated_at"
)
SELECT
  student."tenant_id",
  student."id",
  trim(concat_ws(' ', student."first_name", student."last_name")),
  lower(regexp_replace(trim(concat_ws(' ', student."first_name", student."last_name")), '\s+', ' ', 'g')),
  student."first_name",
  student."last_name",
  student."date_of_birth",
  student."email",
  CASE WHEN student."email" IS NULL THEN NULL ELSE lower(trim(student."email")) END,
  CASE student."status" WHEN 'active' THEN 'active' ELSE 'archived' END,
  'legacy_student',
  student."created_at" AT TIME ZONE 'UTC',
  student."updated_at" AT TIME ZONE 'UTC'
FROM "students" AS student
WHERE NOT EXISTS (
  SELECT 1
  FROM "people" AS existing
  WHERE existing."tenant_id" = student."tenant_id"
    AND existing."legacy_student_id" = student."id"
);--> statement-breakpoint

INSERT INTO "student_profiles" (
  "tenant_id",
  "person_id",
  "legacy_student_id",
  "student_number",
  "status"
)
SELECT
  person."tenant_id",
  person."id",
  student."id",
  student."student_number",
  CASE student."status" WHEN 'active' THEN 'active' ELSE 'inactive' END
FROM "students" AS student
INNER JOIN "people" AS person
  ON person."tenant_id" = student."tenant_id"
  AND person."legacy_student_id" = student."id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "student_profiles" AS existing
  WHERE existing."tenant_id" = person."tenant_id"
    AND existing."person_id" = person."id"
);--> statement-breakpoint

INSERT INTO "affiliations" (
  "tenant_id",
  "person_id",
  "kind",
  "scope_type",
  "school_id",
  "status",
  "valid_from",
  "issuance_reason"
)
SELECT
  student."tenant_id",
  person."id",
  'student',
  'school',
  student."school_id",
  'active',
  student."created_at" AT TIME ZONE 'UTC',
  'M2 compatibility backfill from students:' || student."id"::text
FROM "students" AS student
INNER JOIN "people" AS person
  ON person."tenant_id" = student."tenant_id"
  AND person."legacy_student_id" = student."id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "affiliations" AS existing
  WHERE existing."tenant_id" = student."tenant_id"
    AND existing."person_id" = person."id"
    AND existing."kind" = 'student'
    AND existing."scope_type" = 'school'
    AND existing."school_id" = student."school_id"
    AND existing."status" = 'active'
    AND existing."valid_from" <= now()
    AND (existing."valid_until" IS NULL OR existing."valid_until" > now())
);--> statement-breakpoint

INSERT INTO "school_enrollments" (
  "tenant_id",
  "person_id",
  "school_id",
  "student_affiliation_id",
  "legacy_student_id",
  "enrollment_type",
  "status",
  "valid_from",
  "valid_until",
  "admission_reason",
  "source"
)
SELECT
  student."tenant_id",
  person."id",
  student."school_id",
  student_affiliation."id",
  student."id",
  'primary',
  CASE student."status" WHEN 'active' THEN 'enrolled' ELSE 'withdrawn' END,
  student."created_at" AT TIME ZONE 'UTC',
  CASE
    WHEN student."status" = 'active' THEN NULL
    ELSE greatest(
      student."updated_at",
      student."created_at" + interval '1 microsecond'
    ) AT TIME ZONE 'UTC'
  END,
  'Backfilled from the legacy Student compatibility record',
  'legacy_backfill'
FROM "students" AS student
INNER JOIN "people" AS person
  ON person."tenant_id" = student."tenant_id"
  AND person."legacy_student_id" = student."id"
INNER JOIN LATERAL (
  SELECT affiliation."id"
  FROM "affiliations" AS affiliation
  WHERE affiliation."tenant_id" = student."tenant_id"
    AND affiliation."person_id" = person."id"
    AND affiliation."kind" = 'student'
    AND affiliation."scope_type" = 'school'
    AND affiliation."school_id" = student."school_id"
  ORDER BY
    CASE WHEN affiliation."status" = 'active' THEN 0 ELSE 1 END,
    affiliation."valid_from" DESC,
    affiliation."id"
  LIMIT 1
) AS student_affiliation ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM "school_enrollments" AS existing
  WHERE existing."tenant_id" = student."tenant_id"
    AND existing."legacy_student_id" = student."id"
);--> statement-breakpoint

INSERT INTO "student_compatibility_evidence" (
  "tenant_id",
  "person_id",
  "school_id",
  "school_enrollment_id",
  "student_affiliation_id",
  "legacy_student_id",
  "operation",
  "parity_status",
  "canonical_snapshot",
  "legacy_snapshot",
  "request_id"
)
SELECT
  enrollment."tenant_id",
  enrollment."person_id",
  enrollment."school_id",
  enrollment."id",
  enrollment."student_affiliation_id",
  student."id",
  'backfill',
  'matched',
  jsonb_build_object(
    'firstName', person."first_name",
    'lastName', person."last_name",
    'dateOfBirth', person."date_of_birth",
    'studentNumber', profile."student_number",
    'email', person."email",
    'schoolId', enrollment."school_id"
  ),
  jsonb_build_object(
    'firstName', student."first_name",
    'lastName', student."last_name",
    'dateOfBirth', student."date_of_birth",
    'studentNumber', student."student_number",
    'email', student."email",
    'schoolId', student."school_id"
  ),
  'migration:0028:' || student."id"::text
FROM "school_enrollments" AS enrollment
INNER JOIN "students" AS student
  ON student."tenant_id" = enrollment."tenant_id"
  AND student."id" = enrollment."legacy_student_id"
INNER JOIN "people" AS person
  ON person."tenant_id" = enrollment."tenant_id"
  AND person."id" = enrollment."person_id"
INNER JOIN "student_profiles" AS profile
  ON profile."tenant_id" = enrollment."tenant_id"
  AND profile."person_id" = enrollment."person_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "student_compatibility_evidence" AS existing
  WHERE existing."tenant_id" = enrollment."tenant_id"
    AND existing."person_id" = enrollment."person_id"
    AND existing."request_id" = 'migration:0028:' || student."id"::text
    AND existing."operation" = 'backfill'
);--> statement-breakpoint

ALTER TABLE "school_enrollments"
  ADD CONSTRAINT "school_enrollments_primary_no_active_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "person_id" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'enrolled' AND "enrollment_type" = 'primary');--> statement-breakpoint

CREATE FUNCTION "openschool_validate_school_enrollment"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.affiliations AS affiliation
    WHERE affiliation.tenant_id = NEW.tenant_id
      AND affiliation.id = NEW.student_affiliation_id
      AND affiliation.person_id = NEW.person_id
      AND affiliation.kind = 'student'
      AND affiliation.scope_type = 'school'
      AND affiliation.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'SCHOOL_ENROLLMENT_AFFILIATION_MISMATCH'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER "school_enrollments_validate_before_write"
  BEFORE INSERT OR UPDATE ON "school_enrollments"
  FOR EACH ROW EXECUTE FUNCTION "openschool_validate_school_enrollment"();--> statement-breakpoint
CREATE TRIGGER "school_enrollments_identity_anchors_immutable"
  BEFORE UPDATE ON "school_enrollments"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'tenant_id', 'person_id', 'school_id', 'student_affiliation_id',
    'legacy_student_id', 'enrollment_type', 'source'
  );--> statement-breakpoint

CREATE FUNCTION "openschool_validate_student_compatibility_evidence"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.school_enrollments AS enrollment
    WHERE enrollment.tenant_id = NEW.tenant_id
      AND enrollment.id = NEW.school_enrollment_id
      AND enrollment.person_id = NEW.person_id
      AND enrollment.school_id = NEW.school_id
      AND enrollment.student_affiliation_id = NEW.student_affiliation_id
      AND enrollment.legacy_student_id = NEW.legacy_student_id
  ) THEN
    RAISE EXCEPTION 'STUDENT_COMPATIBILITY_LINK_MISMATCH'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER "student_compatibility_evidence_validate_before_insert"
  BEFORE INSERT ON "student_compatibility_evidence"
  FOR EACH ROW EXECUTE FUNCTION "openschool_validate_student_compatibility_evidence"();--> statement-breakpoint
CREATE TRIGGER "student_compatibility_evidence_append_only"
  BEFORE UPDATE OR DELETE ON "student_compatibility_evidence"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_immutable_row_mutation"();--> statement-breakpoint

ALTER TABLE "school_enrollments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_compatibility_evidence" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "schools_student_admitter_select" ON "schools" AS PERMISSIVE FOR SELECT TO "openschool_student_admitter" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "schools"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.students.create', 'tenant.students.update')
        AND public.openschool_school_scope_allows("schools"."tenant_id", "schools"."id")
      );--> statement-breakpoint
CREATE POLICY "students_admitter_select" ON "students" AS PERMISSIVE FOR SELECT TO "openschool_student_admitter" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.students.create', 'tenant.students.update')
        AND public.openschool_school_scope_allows("students"."tenant_id", "students"."school_id")
      );--> statement-breakpoint
CREATE POLICY "students_admitter_insert" ON "students" AS PERMISSIVE FOR INSERT TO "openschool_student_admitter" WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.students.create'
        AND public.openschool_school_scope_allows("students"."tenant_id", "students"."school_id")
      );--> statement-breakpoint
CREATE POLICY "students_admitter_update" ON "students" AS PERMISSIVE FOR UPDATE TO "openschool_student_admitter" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.students.update'
        AND public.openschool_school_scope_allows("students"."tenant_id", "students"."school_id")
      ) WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.students.update'
        AND public.openschool_school_scope_allows("students"."tenant_id", "students"."school_id")
      );--> statement-breakpoint
CREATE POLICY "students_admitter_delete_deny" ON "students" AS PERMISSIVE FOR DELETE TO "openschool_student_admitter" USING (false);--> statement-breakpoint
CREATE POLICY "school_enrollments_runtime_select" ON "school_enrollments" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') IN (

  'tenant.students.read', 'tenant.students.update',
  'tenant.students.delete', 'support.students.read'

        )
        AND public.openschool_canonical_student_scope_allows(
          "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "school_enrollments_runtime_insert_deny" ON "school_enrollments" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "school_enrollments_runtime_update_deny" ON "school_enrollments" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "school_enrollments_runtime_delete_deny" ON "school_enrollments" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "school_enrollments_admitter_select" ON "school_enrollments" AS PERMISSIVE FOR SELECT TO "openschool_student_admitter" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.students.create', 'tenant.students.update')
        AND public.openschool_canonical_student_scope_allows(
          "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "school_enrollments_admitter_insert" ON "school_enrollments" AS PERMISSIVE FOR INSERT TO "openschool_student_admitter" WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.students.create'
        AND public.openschool_school_scope_allows("school_enrollments"."tenant_id", "school_enrollments"."school_id")
      );--> statement-breakpoint
CREATE POLICY "school_enrollments_admitter_update" ON "school_enrollments" AS PERMISSIVE FOR UPDATE TO "openschool_student_admitter" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.students.update'
        AND public.openschool_canonical_student_scope_allows(
          "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
        )
      ) WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.students.update'
        AND public.openschool_canonical_student_scope_allows(
          "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "school_enrollments_admitter_delete_deny" ON "school_enrollments" AS PERMISSIVE FOR DELETE TO "openschool_student_admitter" USING (false);--> statement-breakpoint
CREATE POLICY "student_compatibility_evidence_runtime_select" ON "student_compatibility_evidence" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "student_compatibility_evidence"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') IN (

  'tenant.students.read', 'tenant.students.update',
  'tenant.students.delete', 'support.students.read'

        )
        AND public.openschool_canonical_student_scope_allows(
          "student_compatibility_evidence"."tenant_id", "student_compatibility_evidence"."school_id", "student_compatibility_evidence"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "student_compatibility_evidence_runtime_insert_deny" ON "student_compatibility_evidence" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "student_compatibility_evidence_runtime_update_deny" ON "student_compatibility_evidence" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "student_compatibility_evidence_runtime_delete_deny" ON "student_compatibility_evidence" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "student_compatibility_evidence_admitter_select" ON "student_compatibility_evidence" AS PERMISSIVE FOR SELECT TO "openschool_student_admitter" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "student_compatibility_evidence"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.students.create', 'tenant.students.update')
        AND public.openschool_canonical_student_scope_allows(
          "student_compatibility_evidence"."tenant_id", "student_compatibility_evidence"."school_id", "student_compatibility_evidence"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "student_compatibility_evidence_admitter_insert" ON "student_compatibility_evidence" AS PERMISSIVE FOR INSERT TO "openschool_student_admitter" WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "student_compatibility_evidence"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.students.create', 'tenant.students.update')
        AND public.openschool_canonical_student_scope_allows(
          "student_compatibility_evidence"."tenant_id", "student_compatibility_evidence"."school_id", "student_compatibility_evidence"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "student_compatibility_evidence_admitter_update_deny" ON "student_compatibility_evidence" AS PERMISSIVE FOR UPDATE TO "openschool_student_admitter" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "student_compatibility_evidence_admitter_delete_deny" ON "student_compatibility_evidence" AS PERMISSIVE FOR DELETE TO "openschool_student_admitter" USING (false);--> statement-breakpoint
ALTER POLICY "students_runtime_insert" ON "students" TO openschool_runtime WITH CHECK (false);--> statement-breakpoint
ALTER POLICY "students_runtime_update" ON "students" TO openschool_runtime USING (false) WITH CHECK (false);--> statement-breakpoint
ALTER POLICY "students_runtime_delete" ON "students" TO openschool_runtime USING (false);--> statement-breakpoint

GRANT USAGE ON SCHEMA "public", "openschool_private"
  TO "openschool_student_admitter";--> statement-breakpoint
GRANT SELECT ON
  "schools",
  "school_governance_assignments",
  "organization_tree_versions",
  "organization_tree_closure",
  "people",
  "student_profiles",
  "affiliations",
  "person_relationships",
  "enrollments",
  "students",
  "school_enrollments",
  "student_compatibility_evidence"
  TO "openschool_student_admitter";--> statement-breakpoint
GRANT INSERT ON
  "students",
  "people",
  "student_profiles",
  "affiliations",
  "school_enrollments",
  "student_compatibility_evidence"
  TO "openschool_student_admitter";--> statement-breakpoint
GRANT UPDATE ("first_name", "last_name", "date_of_birth", "student_number", "email", "updated_at")
  ON "students" TO "openschool_student_admitter";--> statement-breakpoint
GRANT UPDATE (
  "display_name",
  "normalized_display_name",
  "first_name",
  "last_name",
  "date_of_birth",
  "email",
  "normalized_email",
  "updated_at"
) ON "people" TO "openschool_student_admitter";--> statement-breakpoint
GRANT UPDATE ("student_number", "updated_at")
  ON "student_profiles" TO "openschool_student_admitter";--> statement-breakpoint

CREATE FUNCTION "openschool_private"."admit_canonical_student"(
  p_person_id uuid,
  p_legacy_student_id uuid,
  p_school_enrollment_id uuid,
  p_student_affiliation_id uuid,
  p_evidence_id uuid,
  p_school_id uuid,
  p_first_name text,
  p_last_name text,
  p_display_name text,
  p_normalized_display_name text,
  p_date_of_birth date,
  p_student_number text,
  p_email text,
  p_normalized_email text,
  p_valid_from timestamp with time zone
)
RETURNS TABLE (
  person_id uuid,
  legacy_student_id uuid,
  school_enrollment_id uuid,
  student_affiliation_id uuid,
  evidence_id uuid,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_request_id text := nullif(current_setting('app.request_id', true), '');
  v_created_at timestamp with time zone := clock_timestamp();
  v_canonical_snapshot jsonb;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_student_admitter'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.students.create'
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR v_request_id IS NULL
    OR p_person_id IS NULL
    OR p_legacy_student_id IS NULL
    OR p_school_enrollment_id IS NULL
    OR p_student_affiliation_id IS NULL
    OR p_evidence_id IS NULL
    OR p_school_id IS NULL
    OR p_valid_from IS NULL
    OR btrim(p_first_name) = ''
    OR btrim(p_last_name) = ''
    OR btrim(p_display_name) = ''
    OR btrim(p_normalized_display_name) = ''
    OR (p_date_of_birth IS NOT NULL AND p_date_of_birth > current_date)
    OR NOT public.openschool_school_scope_allows(v_tenant_id, p_school_id)
  THEN
    RAISE EXCEPTION 'CANONICAL_STUDENT_ADMISSION_CONTEXT_INVALID'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.schools AS school
    WHERE school.tenant_id = v_tenant_id
      AND school.id = p_school_id
      AND school.status = 'active'
  ) THEN
    RAISE EXCEPTION 'CANONICAL_STUDENT_ADMISSION_SCHOOL_UNAVAILABLE'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.students (
    id,
    tenant_id,
    school_id,
    first_name,
    last_name,
    date_of_birth,
    student_number,
    email,
    status,
    created_at,
    updated_at
  ) VALUES (
    p_legacy_student_id,
    v_tenant_id,
    p_school_id,
    p_first_name,
    p_last_name,
    p_date_of_birth,
    p_student_number,
    p_email,
    'active',
    p_valid_from AT TIME ZONE 'UTC',
    p_valid_from AT TIME ZONE 'UTC'
  );

  INSERT INTO public.people (
    id,
    tenant_id,
    legacy_student_id,
    display_name,
    normalized_display_name,
    first_name,
    last_name,
    date_of_birth,
    email,
    normalized_email,
    status,
    source,
    created_at,
    updated_at
  ) VALUES (
    p_person_id,
    v_tenant_id,
    p_legacy_student_id,
    p_display_name,
    p_normalized_display_name,
    p_first_name,
    p_last_name,
    p_date_of_birth,
    p_email,
    p_normalized_email,
    'active',
    'native',
    p_valid_from,
    p_valid_from
  );

  INSERT INTO public.student_profiles (
    tenant_id,
    person_id,
    legacy_student_id,
    student_number,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_tenant_id,
    p_person_id,
    p_legacy_student_id,
    p_student_number,
    'active',
    p_valid_from,
    p_valid_from
  );

  INSERT INTO public.affiliations (
    id,
    tenant_id,
    person_id,
    kind,
    scope_type,
    school_id,
    status,
    valid_from,
    issued_by_account_id,
    issuance_reason,
    created_at,
    updated_at
  ) VALUES (
    p_student_affiliation_id,
    v_tenant_id,
    p_person_id,
    'student',
    'school',
    p_school_id,
    'active',
    p_valid_from,
    v_account_id,
    'Canonical learner admission',
    p_valid_from,
    p_valid_from
  );

  INSERT INTO public.school_enrollments (
    id,
    tenant_id,
    person_id,
    school_id,
    student_affiliation_id,
    legacy_student_id,
    enrollment_type,
    status,
    valid_from,
    admission_reason,
    source,
    created_by_account_id,
    created_at,
    updated_at
  ) VALUES (
    p_school_enrollment_id,
    v_tenant_id,
    p_person_id,
    p_school_id,
    p_student_affiliation_id,
    p_legacy_student_id,
    'primary',
    'enrolled',
    p_valid_from,
    'Admitted through the canonical SIS workflow',
    'native',
    v_account_id,
    p_valid_from,
    p_valid_from
  );

  v_canonical_snapshot := jsonb_build_object(
    'firstName', p_first_name,
    'lastName', p_last_name,
    'dateOfBirth', p_date_of_birth,
    'studentNumber', p_student_number,
    'email', p_email,
    'schoolId', p_school_id
  );

  INSERT INTO public.student_compatibility_evidence (
    id,
    tenant_id,
    person_id,
    school_id,
    school_enrollment_id,
    student_affiliation_id,
    legacy_student_id,
    operation,
    parity_status,
    canonical_snapshot,
    legacy_snapshot,
    request_id,
    recorded_by_account_id,
    recorded_at
  ) VALUES (
    p_evidence_id,
    v_tenant_id,
    p_person_id,
    p_school_id,
    p_school_enrollment_id,
    p_student_affiliation_id,
    p_legacy_student_id,
    'create',
    'matched',
    v_canonical_snapshot,
    v_canonical_snapshot,
    v_request_id,
    v_account_id,
    v_created_at
  );

  RETURN QUERY SELECT
    p_person_id,
    p_legacy_student_id,
    p_school_enrollment_id,
    p_student_affiliation_id,
    p_evidence_id,
    v_created_at;
END
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."update_canonical_student"(
  p_person_id uuid,
  p_evidence_id uuid,
  p_first_name text,
  p_last_name text,
  p_display_name text,
  p_normalized_display_name text,
  p_date_of_birth date,
  p_student_number text,
  p_email text,
  p_normalized_email text
)
RETURNS TABLE (
  person_id uuid,
  legacy_student_id uuid,
  school_enrollment_id uuid,
  student_affiliation_id uuid,
  evidence_id uuid,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_request_id text := nullif(current_setting('app.request_id', true), '');
  v_school_id uuid;
  v_legacy_student_id uuid;
  v_school_enrollment_id uuid;
  v_student_affiliation_id uuid;
  v_updated_at timestamp with time zone := clock_timestamp();
  v_canonical_snapshot jsonb;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_student_admitter'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.students.update'
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR v_request_id IS NULL
    OR p_person_id IS NULL
    OR p_evidence_id IS NULL
    OR btrim(p_first_name) = ''
    OR btrim(p_last_name) = ''
    OR btrim(p_display_name) = ''
    OR btrim(p_normalized_display_name) = ''
    OR (p_date_of_birth IS NOT NULL AND p_date_of_birth > current_date)
  THEN
    RAISE EXCEPTION 'CANONICAL_STUDENT_UPDATE_CONTEXT_INVALID'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    enrollment.school_id,
    enrollment.legacy_student_id,
    enrollment.id,
    enrollment.student_affiliation_id
  INTO
    v_school_id,
    v_legacy_student_id,
    v_school_enrollment_id,
    v_student_affiliation_id
  FROM public.school_enrollments AS enrollment
  WHERE enrollment.tenant_id = v_tenant_id
    AND enrollment.person_id = p_person_id
    AND enrollment.status = 'enrolled'
    AND enrollment.valid_from <= now()
    AND (enrollment.valid_until IS NULL OR enrollment.valid_until > now())
  ORDER BY
    CASE WHEN enrollment.enrollment_type = 'primary' THEN 0 ELSE 1 END,
    enrollment.valid_from DESC,
    enrollment.id
  LIMIT 1;

  IF v_school_enrollment_id IS NULL
    OR v_legacy_student_id IS NULL
    OR NOT public.openschool_canonical_student_scope_allows(
      v_tenant_id,
      v_school_id,
      p_person_id
    )
  THEN
    RAISE EXCEPTION 'CANONICAL_STUDENT_UPDATE_UNAVAILABLE'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.people
  SET
    display_name = p_display_name,
    normalized_display_name = p_normalized_display_name,
    first_name = p_first_name,
    last_name = p_last_name,
    date_of_birth = p_date_of_birth,
    email = p_email,
    normalized_email = p_normalized_email,
    updated_at = v_updated_at
  WHERE tenant_id = v_tenant_id
    AND id = p_person_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANONICAL_STUDENT_PERSON_UNAVAILABLE'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.student_profiles AS profile
  SET
    student_number = p_student_number,
    updated_at = v_updated_at
  WHERE profile.tenant_id = v_tenant_id
    AND profile.person_id = p_person_id
    AND profile.legacy_student_id = v_legacy_student_id
    AND profile.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANONICAL_STUDENT_PROFILE_UNAVAILABLE'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.students
  SET
    first_name = p_first_name,
    last_name = p_last_name,
    date_of_birth = p_date_of_birth,
    student_number = p_student_number,
    email = p_email,
    updated_at = v_updated_at AT TIME ZONE 'UTC'
  WHERE tenant_id = v_tenant_id
    AND id = v_legacy_student_id
    AND school_id = v_school_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEGACY_STUDENT_COMPATIBILITY_UNAVAILABLE'
      USING ERRCODE = 'P0002';
  END IF;

  v_canonical_snapshot := jsonb_build_object(
    'firstName', p_first_name,
    'lastName', p_last_name,
    'dateOfBirth', p_date_of_birth,
    'studentNumber', p_student_number,
    'email', p_email,
    'schoolId', v_school_id
  );

  INSERT INTO public.student_compatibility_evidence (
    id,
    tenant_id,
    person_id,
    school_id,
    school_enrollment_id,
    student_affiliation_id,
    legacy_student_id,
    operation,
    parity_status,
    canonical_snapshot,
    legacy_snapshot,
    request_id,
    recorded_by_account_id,
    recorded_at
  ) VALUES (
    p_evidence_id,
    v_tenant_id,
    p_person_id,
    v_school_id,
    v_school_enrollment_id,
    v_student_affiliation_id,
    v_legacy_student_id,
    'update',
    'matched',
    v_canonical_snapshot,
    v_canonical_snapshot,
    v_request_id,
    v_account_id,
    v_updated_at
  );

  RETURN QUERY SELECT
    p_person_id,
    v_legacy_student_id,
    v_school_enrollment_id,
    v_student_affiliation_id,
    p_evidence_id,
    v_updated_at;
END
$$;--> statement-breakpoint

ALTER FUNCTION "openschool_private"."admit_canonical_student"(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, text,
  timestamp with time zone
) OWNER TO "openschool_student_admitter";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."update_canonical_student"(
  uuid, uuid, text, text, text, text, date, text, text, text
) OWNER TO "openschool_student_admitter";--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."admit_canonical_student"(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, text,
  timestamp with time zone
) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."update_canonical_student"(
  uuid, uuid, text, text, text, text, date, text, text, text
) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."admit_canonical_student"(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, date, text, text, text,
  timestamp with time zone
) TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."update_canonical_student"(
  uuid, uuid, text, text, text, text, date, text, text, text
) TO "openschool_runtime";--> statement-breakpoint

REVOKE INSERT, UPDATE, DELETE ON TABLE "students" FROM "openschool_runtime";--> statement-breakpoint
GRANT SELECT ON TABLE "school_enrollments", "student_compatibility_evidence"
  TO "openschool_runtime";--> statement-breakpoint

DO $$
DECLARE
  unsafe_execution_membership boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'openschool_student_admitter'
      AND NOT rolcanlogin
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolinherit
      AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Student admitter role attributes are unsafe'
      USING ERRCODE = '55000';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_roles AS execution_role
    WHERE execution_role.rolname IN (
      'openschool_runtime',
      'openschool_worker',
      'openschool_control_plane'
    )
      AND pg_has_role(
        execution_role.oid,
        'openschool_student_admitter'::regrole,
        'member'
      )
  ) INTO unsafe_execution_membership;

  IF unsafe_execution_membership THEN
    RAISE EXCEPTION 'Execution roles must not assume the Student admitter'
      USING ERRCODE = '55000';
  END IF;
END
$$;
