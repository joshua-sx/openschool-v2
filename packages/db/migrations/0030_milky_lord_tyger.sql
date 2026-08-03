CREATE TABLE "school_enrollment_transition_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transition_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"from_enrollment_id" uuid,
	"to_enrollment_id" uuid,
	"source_school_id" uuid,
	"destination_school_id" uuid,
	"event_type" text NOT NULL,
	"transition_type" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"evidence_reference" text,
	"expected_enrollment_version" bigint,
	"organization_tree_version_id" uuid NOT NULL,
	"authorization_version_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_enrollment_transition_events_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "school_enrollment_transition_events_kind_unique" UNIQUE("tenant_id","transition_id","event_type"),
	CONSTRAINT "school_enrollment_transition_events_request_unique" UNIQUE("tenant_id","request_id","event_type"),
	CONSTRAINT "school_enrollment_transition_events_event_check" CHECK ("school_enrollment_transition_events"."event_type" IN ('scheduled', 'applied', 'cancelled')),
	CONSTRAINT "school_enrollment_transition_events_transition_check" CHECK ("school_enrollment_transition_events"."transition_type" IN ('withdraw', 'transfer', 'graduate', 'reenroll', 'add_secondary', 'end_secondary')),
	CONSTRAINT "school_enrollment_transition_events_reason_check" CHECK (char_length(btrim("school_enrollment_transition_events"."reason")) BETWEEN 3 AND 512),
	CONSTRAINT "school_enrollment_transition_events_evidence_check" CHECK ("school_enrollment_transition_events"."evidence_reference" IS NULL OR char_length(btrim("school_enrollment_transition_events"."evidence_reference")) BETWEEN 3 AND 512),
	CONSTRAINT "school_enrollment_transition_events_expected_version_check" CHECK ("school_enrollment_transition_events"."expected_enrollment_version" IS NULL OR "school_enrollment_transition_events"."expected_enrollment_version" > 0),
	CONSTRAINT "school_enrollment_transition_events_shape_check" CHECK (("school_enrollment_transition_events"."transition_type" IN ('withdraw', 'transfer', 'graduate', 'end_secondary') AND "school_enrollment_transition_events"."from_enrollment_id" IS NOT NULL)
        OR ("school_enrollment_transition_events"."transition_type" IN ('reenroll', 'add_secondary')))
);
--> statement-breakpoint
ALTER TABLE "school_enrollment_transition_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_compatibility_evidence" DROP CONSTRAINT "student_compatibility_evidence_operation_check";--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD COLUMN "end_reason" text;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD COLUMN "end_evidence_reference" text;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD COLUMN "ended_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD COLUMN "supersedes_enrollment_id" uuid;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD COLUMN "organization_tree_version_id" uuid;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "school_enrollments"
SET
	"end_reason" = CASE "status"
		WHEN 'withdrawn' THEN 'withdrawal'
		WHEN 'graduated' THEN 'graduation'
		ELSE 'correction'
	END,
	"end_evidence_reference" = 'Migrated from the pre-lifecycle enrollment record',
	"ended_at" = COALESCE("updated_at", "valid_until")
WHERE "valid_until" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "school_enrollment_transition_events" ADD CONSTRAINT "school_enrollment_transition_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollment_transition_events" ADD CONSTRAINT "school_enrollment_transition_events_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollment_transition_events" ADD CONSTRAINT "school_enrollment_transition_events_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollment_transition_events" ADD CONSTRAINT "school_enrollment_transition_events_tenant_from_fk" FOREIGN KEY ("tenant_id","from_enrollment_id") REFERENCES "public"."school_enrollments"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollment_transition_events" ADD CONSTRAINT "school_enrollment_transition_events_tenant_to_fk" FOREIGN KEY ("tenant_id","to_enrollment_id") REFERENCES "public"."school_enrollments"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollment_transition_events" ADD CONSTRAINT "school_enrollment_transition_events_tenant_source_school_fk" FOREIGN KEY ("tenant_id","source_school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollment_transition_events" ADD CONSTRAINT "school_enrollment_transition_events_tenant_destination_school_fk" FOREIGN KEY ("tenant_id","destination_school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollment_transition_events" ADD CONSTRAINT "school_enrollment_transition_events_tenant_tree_version_fk" FOREIGN KEY ("tenant_id","organization_tree_version_id") REFERENCES "public"."organization_tree_versions"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "school_enrollment_transition_events_timeline_idx" ON "school_enrollment_transition_events" USING btree ("tenant_id","person_id","effective_at","occurred_at","id");--> statement-breakpoint
CREATE INDEX "school_enrollment_transition_events_due_idx" ON "school_enrollment_transition_events" USING btree ("tenant_id","event_type","effective_at","transition_id");--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_ended_by_account_id_accounts_id_fk" FOREIGN KEY ("ended_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_tenant_supersedes_fk" FOREIGN KEY ("tenant_id","supersedes_enrollment_id") REFERENCES "public"."school_enrollments"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_tenant_tree_version_fk" FOREIGN KEY ("tenant_id","organization_tree_version_id") REFERENCES "public"."organization_tree_versions"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_version_positive" CHECK ("school_enrollments"."version" > 0);--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_end_evidence_check" CHECK (("school_enrollments"."valid_until" IS NULL AND "school_enrollments"."end_reason" IS NULL AND "school_enrollments"."ended_by_account_id" IS NULL AND "school_enrollments"."ended_at" IS NULL)
        OR ("school_enrollments"."valid_until" IS NOT NULL AND "school_enrollments"."end_reason" IS NOT NULL AND "school_enrollments"."ended_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_end_reason_check" CHECK ("school_enrollments"."end_reason" IS NULL OR "school_enrollments"."end_reason" IN ('withdrawal', 'transfer', 'graduation', 'secondary_ended', 'correction'));--> statement-breakpoint
ALTER TABLE "student_compatibility_evidence" ADD CONSTRAINT "student_compatibility_evidence_operation_check" CHECK ("student_compatibility_evidence"."operation" IN ('backfill', 'create', 'update', 'transition'));--> statement-breakpoint

CREATE FUNCTION "openschool_enrollment_transition_scope_allows"(
  row_tenant_id uuid,
  row_person_id uuid,
  row_source_school_id uuid,
  row_destination_school_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  SELECT row_tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND (
      (
        row_source_school_id IS NOT NULL
        AND public.openschool_canonical_student_scope_allows(
          row_tenant_id, row_source_school_id, row_person_id
        )
      )
      OR (
        row_destination_school_id IS NOT NULL
        AND public.openschool_canonical_student_scope_allows(
          row_tenant_id, row_destination_school_id, row_person_id
        )
      )
    )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_enrollment_transition_scope_allows"(uuid, uuid, uuid, uuid)
  FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_enrollment_transition_scope_allows"(uuid, uuid, uuid, uuid)
  TO "openschool_runtime", "openschool_student_admitter";--> statement-breakpoint

CREATE FUNCTION "openschool_guard_school_enrollment_period"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SCHOOL_ENROLLMENT_DELETE_REJECTED' USING ERRCODE = '55000';
  END IF;

  IF OLD.valid_until IS NOT NULL THEN
    RAISE EXCEPTION 'SCHOOL_ENROLLMENT_HISTORY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF NEW.valid_until IS NULL
    OR NEW.valid_until <= OLD.valid_from
    OR NEW.end_reason IS NULL
    OR NEW.ended_at IS NULL
    OR NEW.version <> OLD.version + 1
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.admission_reason IS DISTINCT FROM OLD.admission_reason
    OR NEW.created_by_account_id IS DISTINCT FROM OLD.created_by_account_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.organization_tree_version_id IS DISTINCT FROM OLD.organization_tree_version_id
    OR NEW.supersedes_enrollment_id IS DISTINCT FROM OLD.supersedes_enrollment_id
  THEN
    RAISE EXCEPTION 'SCHOOL_ENROLLMENT_CLOSE_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER "school_enrollments_period_guard"
  BEFORE UPDATE OR DELETE ON "school_enrollments"
  FOR EACH ROW EXECUTE FUNCTION "openschool_guard_school_enrollment_period"();--> statement-breakpoint
CREATE TRIGGER "school_enrollment_transition_events_append_only"
  BEFORE UPDATE OR DELETE ON "school_enrollment_transition_events"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_immutable_row_mutation"();--> statement-breakpoint

ALTER TABLE "school_enrollment_transition_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

GRANT SELECT ON "school_enrollment_transition_events" TO "openschool_runtime";--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "school_enrollment_transition_events"
  FROM "openschool_runtime";--> statement-breakpoint

GRANT SELECT ON
  "accounts", "account_links", "organization_tree_versions",
  "school_enrollment_transition_events"
  TO "openschool_student_admitter";--> statement-breakpoint
GRANT INSERT ON "school_enrollment_transition_events"
  TO "openschool_student_admitter";--> statement-breakpoint
GRANT UPDATE ("valid_until", "end_reason", "end_evidence_reference", "ended_by_account_id", "ended_at", "version", "updated_at")
  ON "school_enrollments" TO "openschool_student_admitter";--> statement-breakpoint
GRANT UPDATE ("status", "valid_until", "revoked_at", "revoked_by_account_id", "revocation_reason", "updated_at")
  ON "affiliations" TO "openschool_student_admitter";--> statement-breakpoint
GRANT UPDATE ("status", "updated_at")
  ON "student_profiles" TO "openschool_student_admitter";--> statement-breakpoint
GRANT UPDATE ("membership_version", "updated_at")
  ON "accounts" TO "openschool_student_admitter";--> statement-breakpoint
GRANT UPDATE ("school_id", "status", "updated_at")
  ON "students" TO "openschool_student_admitter";--> statement-breakpoint

CREATE FUNCTION "openschool_private"."schedule_school_enrollment_transition"(
  p_event_id uuid,
  p_transition_id uuid,
  p_person_id uuid,
  p_from_enrollment_id uuid,
  p_destination_school_id uuid,
  p_transition_type text,
  p_effective_at timestamp with time zone,
  p_reason text,
  p_evidence_reference text,
  p_expected_enrollment_version bigint
)
RETURNS TABLE (
  event_id uuid,
  transition_id uuid,
  person_id uuid,
  source_school_id uuid,
  destination_school_id uuid,
  transition_type text,
  effective_at timestamp with time zone,
  event_type text,
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
  v_membership_version bigint := nullif(current_setting('app.membership_version', true), '')::bigint;
  v_now timestamp with time zone := statement_timestamp();
  v_source_school_id uuid;
  v_source_person_id uuid;
  v_source_type text;
  v_source_valid_from timestamp with time zone;
  v_source_valid_until timestamp with time zone;
  v_source_version bigint;
  v_tree_version_id uuid;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_student_admitter'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.student_enrollments.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR v_request_id IS NULL
    OR v_membership_version IS NULL
    OR p_event_id IS NULL
    OR p_transition_id IS NULL
    OR p_person_id IS NULL
    OR p_transition_type IS NULL
    OR p_transition_type NOT IN (
      'withdraw', 'transfer', 'graduate', 'reenroll', 'add_secondary', 'end_secondary'
    )
    OR p_effective_at IS NULL
    OR p_effective_at < v_now - interval '5 minutes'
    OR p_effective_at > v_now + interval '2 years'
    OR p_reason IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
    OR (
      p_evidence_reference IS NOT NULL
      AND char_length(btrim(p_evidence_reference)) NOT BETWEEN 3 AND 512
    )
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text || ':' || p_person_id::text, 0));

  IF NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    INNER JOIN public.student_profiles AS profile
      ON profile.tenant_id = person.tenant_id
      AND profile.person_id = person.id
    WHERE person.tenant_id = v_tenant_id
      AND person.id = p_person_id
      AND person.status = 'active'
  ) THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_UNAVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  IF p_from_enrollment_id IS NOT NULL THEN
    SELECT
      enrollment.school_id,
      enrollment.person_id,
      enrollment.enrollment_type,
      enrollment.valid_from,
      enrollment.valid_until,
      enrollment.version
    INTO
      v_source_school_id,
      v_source_person_id,
      v_source_type,
      v_source_valid_from,
      v_source_valid_until,
      v_source_version
    FROM public.school_enrollments AS enrollment
    WHERE enrollment.tenant_id = v_tenant_id
      AND enrollment.id = p_from_enrollment_id
      AND enrollment.person_id = p_person_id
    FOR UPDATE;
  END IF;

  IF p_transition_type IN ('withdraw', 'transfer', 'graduate', 'end_secondary')
    AND v_source_person_id IS NULL
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_UNAVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  IF p_transition_type IN ('withdraw', 'transfer', 'graduate', 'end_secondary')
    AND (
      p_expected_enrollment_version IS NULL
      OR v_source_version <> p_expected_enrollment_version
      OR v_source_valid_until IS NOT NULL
      OR v_source_valid_from >= p_effective_at
    )
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_STALE' USING ERRCODE = '40001';
  END IF;

  IF (p_transition_type = 'withdraw' AND v_source_type <> 'primary')
    OR (p_transition_type = 'graduate' AND v_source_type <> 'primary')
    OR (p_transition_type = 'transfer' AND v_source_type <> 'primary')
    OR (p_transition_type = 'end_secondary' AND v_source_type <> 'secondary')
    OR (
      p_transition_type IN ('transfer', 'reenroll', 'add_secondary')
      AND p_destination_school_id IS NULL
    )
    OR (
      p_transition_type IN ('withdraw', 'graduate', 'end_secondary')
      AND p_destination_school_id IS NOT NULL
    )
    OR (
      p_transition_type = 'transfer'
      AND p_destination_school_id = v_source_school_id
    )
    OR (
      p_transition_type IN ('reenroll', 'add_secondary')
      AND p_from_enrollment_id IS NOT NULL
    )
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF v_source_school_id IS NOT NULL
    AND NOT public.openschool_school_scope_allows(v_tenant_id, v_source_school_id)
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_UNAVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  IF p_destination_school_id IS NOT NULL AND (
    NOT public.openschool_school_scope_allows(v_tenant_id, p_destination_school_id)
    OR NOT EXISTS (
      SELECT 1
      FROM public.schools AS school
      WHERE school.tenant_id = v_tenant_id
        AND school.id = p_destination_school_id
        AND school.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_UNAVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  IF p_transition_type = 'reenroll' AND EXISTS (
    SELECT 1
    FROM public.school_enrollments AS current_enrollment
    WHERE current_enrollment.tenant_id = v_tenant_id
      AND current_enrollment.person_id = p_person_id
      AND current_enrollment.enrollment_type = 'primary'
      AND current_enrollment.status = 'enrolled'
      AND tstzrange(
        current_enrollment.valid_from,
        COALESCE(current_enrollment.valid_until, 'infinity'::timestamptz),
        '[)'
      ) @> p_effective_at
  ) THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_CONFLICT' USING ERRCODE = '23P01';
  END IF;

  IF p_transition_type = 'add_secondary' AND EXISTS (
    SELECT 1
    FROM public.school_enrollments AS current_enrollment
    WHERE current_enrollment.tenant_id = v_tenant_id
      AND current_enrollment.person_id = p_person_id
      AND current_enrollment.school_id = p_destination_school_id
      AND current_enrollment.status = 'enrolled'
      AND tstzrange(
        current_enrollment.valid_from,
        COALESCE(current_enrollment.valid_until, 'infinity'::timestamptz),
        '[)'
      ) @> p_effective_at
  ) THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_CONFLICT' USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.school_enrollment_transition_events AS scheduled
    WHERE scheduled.tenant_id = v_tenant_id
      AND scheduled.person_id = p_person_id
      AND scheduled.event_type = 'scheduled'
      AND NOT EXISTS (
        SELECT 1
        FROM public.school_enrollment_transition_events AS resolved
        WHERE resolved.tenant_id = scheduled.tenant_id
          AND resolved.transition_id = scheduled.transition_id
          AND resolved.event_type IN ('applied', 'cancelled')
      )
  ) THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_PENDING' USING ERRCODE = '23505';
  END IF;

  SELECT tree_version.id
  INTO v_tree_version_id
  FROM public.organization_tree_versions AS tree_version
  WHERE tree_version.tenant_id = v_tenant_id
    AND tree_version.effective_from <= v_now
  ORDER BY tree_version.effective_from DESC, tree_version.id
  LIMIT 1;

  IF v_tree_version_id IS NULL THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_CONTEXT_STALE' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.school_enrollment_transition_events (
    id,
    tenant_id,
    transition_id,
    person_id,
    from_enrollment_id,
    source_school_id,
    destination_school_id,
    event_type,
    transition_type,
    effective_at,
    reason,
    evidence_reference,
    expected_enrollment_version,
    organization_tree_version_id,
    authorization_version_evidence,
    actor_account_id,
    request_id,
    occurred_at
  ) VALUES (
    p_event_id,
    v_tenant_id,
    p_transition_id,
    p_person_id,
    p_from_enrollment_id,
    v_source_school_id,
    p_destination_school_id,
    'scheduled',
    p_transition_type,
    p_effective_at,
    btrim(p_reason),
    nullif(btrim(p_evidence_reference), ''),
    p_expected_enrollment_version,
    v_tree_version_id,
    jsonb_build_array(jsonb_build_object(
      'actorAccountId', v_account_id,
      'membershipVersion', v_membership_version
    )),
    v_account_id,
    v_request_id,
    v_now
  );

  RETURN QUERY SELECT
    p_event_id,
    p_transition_id,
    p_person_id,
    v_source_school_id,
    p_destination_school_id,
    p_transition_type,
    p_effective_at,
    'scheduled'::text,
    v_now;
END
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."apply_school_enrollment_transition"(
  p_event_id uuid,
  p_transition_id uuid,
  p_new_enrollment_id uuid,
  p_new_affiliation_id uuid,
  p_compatibility_evidence_id uuid
)
RETURNS TABLE (
  event_id uuid,
  transition_id uuid,
  person_id uuid,
  from_enrollment_id uuid,
  to_enrollment_id uuid,
  source_school_id uuid,
  destination_school_id uuid,
  transition_type text,
  effective_at timestamp with time zone,
  event_type text,
  authorization_version_evidence jsonb,
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
  v_now timestamp with time zone := statement_timestamp();
  v_person_id uuid;
  v_from_enrollment_id uuid;
  v_source_school_id uuid;
  v_destination_school_id uuid;
  v_transition_type text;
  v_effective_at timestamp with time zone;
  v_reason text;
  v_evidence_reference text;
  v_expected_version bigint;
  v_tree_version_id uuid;
  v_source_affiliation_id uuid;
  v_source_enrollment_type text;
  v_source_valid_from timestamp with time zone;
  v_source_valid_until timestamp with time zone;
  v_source_version bigint;
  v_legacy_student_id uuid;
  v_to_enrollment_id uuid;
  v_to_affiliation_id uuid;
  v_end_reason text;
  v_authorization_evidence jsonb := '[]'::jsonb;
  v_current_school_id uuid;
  v_current_enrollment_id uuid;
  v_current_affiliation_id uuid;
  v_profile_status text;
  v_legacy_status text;
  v_canonical_snapshot jsonb;
  v_legacy_snapshot jsonb;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_student_admitter'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.student_enrollments.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR v_request_id IS NULL
    OR p_event_id IS NULL
    OR p_transition_id IS NULL
    OR p_compatibility_evidence_id IS NULL
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_tenant_id::text || ':transition:' || p_transition_id::text, 0)
  );

  SELECT
    scheduled.person_id,
    scheduled.from_enrollment_id,
    scheduled.source_school_id,
    scheduled.destination_school_id,
    scheduled.transition_type,
    scheduled.effective_at,
    scheduled.reason,
    scheduled.evidence_reference,
    scheduled.expected_enrollment_version,
    scheduled.organization_tree_version_id
  INTO
    v_person_id,
    v_from_enrollment_id,
    v_source_school_id,
    v_destination_school_id,
    v_transition_type,
    v_effective_at,
    v_reason,
    v_evidence_reference,
    v_expected_version,
    v_tree_version_id
  FROM public.school_enrollment_transition_events AS scheduled
  WHERE scheduled.tenant_id = v_tenant_id
    AND scheduled.transition_id = p_transition_id
    AND scheduled.event_type = 'scheduled'
  ;

  IF v_person_id IS NULL
    OR v_effective_at > v_now
    OR EXISTS (
      SELECT 1
      FROM public.school_enrollment_transition_events AS resolved
      WHERE resolved.tenant_id = v_tenant_id
        AND resolved.transition_id = p_transition_id
        AND resolved.event_type IN ('applied', 'cancelled')
    )
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_UNAVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text || ':' || v_person_id::text, 0));

  IF v_source_school_id IS NOT NULL
    AND NOT public.openschool_school_scope_allows(v_tenant_id, v_source_school_id)
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_UNAVAILABLE' USING ERRCODE = 'P0002';
  END IF;
  IF v_destination_school_id IS NOT NULL
    AND NOT public.openschool_school_scope_allows(v_tenant_id, v_destination_school_id)
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_UNAVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  SELECT
    profile.legacy_student_id,
    profile.status
  INTO
    v_legacy_student_id,
    v_profile_status
  FROM public.student_profiles AS profile
  WHERE profile.tenant_id = v_tenant_id
    AND profile.person_id = v_person_id
  FOR UPDATE;

  IF v_legacy_student_id IS NULL THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_UNAVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  IF v_from_enrollment_id IS NOT NULL THEN
    SELECT
      enrollment.student_affiliation_id,
      enrollment.enrollment_type,
      enrollment.valid_from,
      enrollment.valid_until,
      enrollment.version
    INTO
      v_source_affiliation_id,
      v_source_enrollment_type,
      v_source_valid_from,
      v_source_valid_until,
      v_source_version
    FROM public.school_enrollments AS enrollment
    WHERE enrollment.tenant_id = v_tenant_id
      AND enrollment.id = v_from_enrollment_id
      AND enrollment.person_id = v_person_id
      AND enrollment.school_id = v_source_school_id
    FOR UPDATE;
  END IF;

  IF v_transition_type IN ('withdraw', 'transfer', 'graduate', 'end_secondary')
    AND v_source_affiliation_id IS NULL
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_UNAVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  IF v_transition_type IN ('withdraw', 'transfer', 'graduate', 'end_secondary')
    AND (
      v_source_version <> v_expected_version
      OR v_source_valid_until IS NOT NULL
      OR v_source_valid_from >= v_effective_at
    )
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_STALE' USING ERRCODE = '40001';
  END IF;

  IF (v_transition_type = 'withdraw' AND v_source_enrollment_type <> 'primary')
    OR (v_transition_type = 'graduate' AND v_source_enrollment_type <> 'primary')
    OR (v_transition_type = 'transfer' AND v_source_enrollment_type <> 'primary')
    OR (v_transition_type = 'end_secondary' AND v_source_enrollment_type <> 'secondary')
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF v_transition_type IN ('transfer', 'reenroll') AND EXISTS (
    SELECT 1
    FROM public.school_enrollments AS current_enrollment
    WHERE current_enrollment.tenant_id = v_tenant_id
      AND current_enrollment.person_id = v_person_id
      AND current_enrollment.enrollment_type = 'primary'
      AND current_enrollment.status = 'enrolled'
      AND current_enrollment.id IS DISTINCT FROM v_from_enrollment_id
      AND tstzrange(
        current_enrollment.valid_from,
        COALESCE(current_enrollment.valid_until, 'infinity'::timestamptz),
        '[)'
      ) @> v_effective_at
  ) THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_CONFLICT' USING ERRCODE = '23P01';
  END IF;

  IF v_transition_type = 'add_secondary' AND EXISTS (
    SELECT 1
    FROM public.school_enrollments AS current_enrollment
    WHERE current_enrollment.tenant_id = v_tenant_id
      AND current_enrollment.person_id = v_person_id
      AND current_enrollment.school_id = v_destination_school_id
      AND current_enrollment.status = 'enrolled'
      AND tstzrange(
        current_enrollment.valid_from,
        COALESCE(current_enrollment.valid_until, 'infinity'::timestamptz),
        '[)'
      ) @> v_effective_at
  ) THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_CONFLICT' USING ERRCODE = '23P01';
  END IF;

  IF v_transition_type IN ('transfer', 'reenroll', 'add_secondary') THEN
    IF p_new_enrollment_id IS NULL
      OR p_new_affiliation_id IS NULL
      OR v_destination_school_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.schools AS school
        WHERE school.tenant_id = v_tenant_id
          AND school.id = v_destination_school_id
          AND school.status = 'active'
      )
    THEN
      RAISE EXCEPTION 'ENROLLMENT_TRANSITION_UNAVAILABLE' USING ERRCODE = 'P0002';
    END IF;
  ELSIF p_new_enrollment_id IS NOT NULL OR p_new_affiliation_id IS NOT NULL THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF v_transition_type IN ('withdraw', 'transfer', 'graduate', 'end_secondary') THEN
    v_end_reason := CASE v_transition_type
      WHEN 'withdraw' THEN 'withdrawal'
      WHEN 'transfer' THEN 'transfer'
      WHEN 'graduate' THEN 'graduation'
      ELSE 'secondary_ended'
    END;

    UPDATE public.school_enrollments AS enrollment
    SET
      valid_until = v_effective_at,
      end_reason = v_end_reason,
      end_evidence_reference = v_evidence_reference,
      ended_by_account_id = v_account_id,
      ended_at = v_now,
      version = enrollment.version + 1,
      updated_at = v_now
    WHERE enrollment.tenant_id = v_tenant_id
      AND enrollment.id = v_from_enrollment_id
      AND enrollment.version = v_expected_version;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ENROLLMENT_TRANSITION_STALE' USING ERRCODE = '40001';
    END IF;

    UPDATE public.affiliations AS affiliation
    SET
      status = 'revoked',
      valid_until = v_effective_at,
      revoked_at = v_now,
      revoked_by_account_id = v_account_id,
      revocation_reason = v_reason,
      updated_at = v_now
    WHERE affiliation.tenant_id = v_tenant_id
      AND affiliation.id = v_source_affiliation_id
      AND affiliation.status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ENROLLMENT_TRANSITION_STALE' USING ERRCODE = '40001';
    END IF;
  END IF;

  IF v_transition_type IN ('transfer', 'reenroll', 'add_secondary') THEN
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
      p_new_affiliation_id,
      v_tenant_id,
      v_person_id,
      'student',
      'school',
      v_destination_school_id,
      'active',
      v_effective_at,
      v_account_id,
      v_reason,
      v_now,
      v_now
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
      supersedes_enrollment_id,
      organization_tree_version_id,
      version,
      source,
      created_by_account_id,
      created_at,
      updated_at
    ) VALUES (
      p_new_enrollment_id,
      v_tenant_id,
      v_person_id,
      v_destination_school_id,
      p_new_affiliation_id,
      v_legacy_student_id,
      CASE WHEN v_transition_type = 'add_secondary' THEN 'secondary' ELSE 'primary' END,
      'enrolled',
      v_effective_at,
      v_reason,
      CASE WHEN v_transition_type = 'transfer' THEN v_from_enrollment_id ELSE NULL END,
      v_tree_version_id,
      1,
      'native',
      v_account_id,
      v_now,
      v_now
    );
    v_to_enrollment_id := p_new_enrollment_id;
    v_to_affiliation_id := p_new_affiliation_id;
  END IF;

  IF v_transition_type IN ('withdraw', 'graduate') AND EXISTS (
    SELECT 1
    FROM public.school_enrollments AS remaining_enrollment
    WHERE remaining_enrollment.tenant_id = v_tenant_id
      AND remaining_enrollment.person_id = v_person_id
      AND remaining_enrollment.status = 'enrolled'
      AND remaining_enrollment.id IS DISTINCT FROM v_from_enrollment_id
      AND tstzrange(
        remaining_enrollment.valid_from,
        COALESCE(remaining_enrollment.valid_until, 'infinity'::timestamptz),
        '[)'
      ) @> v_effective_at
  ) THEN
    UPDATE public.student_profiles AS profile
    SET status = 'active', updated_at = v_now
    WHERE profile.tenant_id = v_tenant_id AND profile.person_id = v_person_id;
    v_legacy_status := 'active';
  ELSIF v_transition_type = 'withdraw' THEN
    UPDATE public.student_profiles AS profile
    SET status = 'withdrawn', updated_at = v_now
    WHERE profile.tenant_id = v_tenant_id AND profile.person_id = v_person_id;
    v_legacy_status := 'archived';
  ELSIF v_transition_type = 'graduate' THEN
    UPDATE public.student_profiles AS profile
    SET status = 'graduated', updated_at = v_now
    WHERE profile.tenant_id = v_tenant_id AND profile.person_id = v_person_id;
    v_legacy_status := 'archived';
  ELSIF v_transition_type IN ('transfer', 'reenroll') THEN
    UPDATE public.student_profiles AS profile
    SET status = 'active', updated_at = v_now
    WHERE profile.tenant_id = v_tenant_id AND profile.person_id = v_person_id;
    v_legacy_status := 'active';
  END IF;

  IF v_transition_type IN ('withdraw', 'graduate') THEN
    UPDATE public.students
    SET status = v_legacy_status, updated_at = v_now AT TIME ZONE 'UTC'
    WHERE tenant_id = v_tenant_id AND id = v_legacy_student_id;
  ELSIF v_transition_type IN ('transfer', 'reenroll') THEN
    UPDATE public.students
    SET
      school_id = v_destination_school_id,
      status = v_legacy_status,
      updated_at = v_now AT TIME ZONE 'UTC'
    WHERE tenant_id = v_tenant_id AND id = v_legacy_student_id;
  END IF;

  WITH updated_account AS (
    UPDATE public.accounts AS account
    SET
      membership_version = account.membership_version + 1,
      updated_at = v_now
    FROM public.account_links AS link
    WHERE link.tenant_id = v_tenant_id
      AND link.person_id = v_person_id
      AND link.account_id = account.id
      AND link.status = 'active'
      AND (link.valid_from IS NULL OR link.valid_from <= v_now)
      AND (link.valid_until IS NULL OR link.valid_until > v_now)
    RETURNING account.id, account.membership_version
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'accountId', updated_account.id,
        'membershipVersion', updated_account.membership_version
      ) ORDER BY updated_account.id
    ),
    '[]'::jsonb
  )
  INTO v_authorization_evidence
  FROM updated_account;

  SELECT
    enrollment.school_id,
    enrollment.id,
    enrollment.student_affiliation_id
  INTO
    v_current_school_id,
    v_current_enrollment_id,
    v_current_affiliation_id
  FROM public.school_enrollments AS enrollment
  WHERE enrollment.tenant_id = v_tenant_id
    AND enrollment.person_id = v_person_id
    AND enrollment.enrollment_type = 'primary'
    AND enrollment.status = 'enrolled'
    AND enrollment.valid_from <= v_now
    AND (enrollment.valid_until IS NULL OR enrollment.valid_until > v_now)
  ORDER BY enrollment.valid_from DESC, enrollment.id
  LIMIT 1;

  IF v_current_enrollment_id IS NULL THEN
    v_current_school_id := v_source_school_id;
    v_current_enrollment_id := v_from_enrollment_id;
    v_current_affiliation_id := v_source_affiliation_id;
  END IF;

  SELECT profile.status
  INTO v_profile_status
  FROM public.student_profiles AS profile
  WHERE profile.tenant_id = v_tenant_id
    AND profile.person_id = v_person_id;

  SELECT student.status
  INTO v_legacy_status
  FROM public.students AS student
  WHERE student.tenant_id = v_tenant_id
    AND student.id = v_legacy_student_id;

  v_canonical_snapshot := jsonb_build_object(
    'schoolId', v_current_school_id,
    'status', v_profile_status,
    'transitionType', v_transition_type
  );
  v_legacy_snapshot := jsonb_build_object(
    'schoolId', v_current_school_id,
    'status', v_legacy_status,
    'transitionType', v_transition_type
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
    p_compatibility_evidence_id,
    v_tenant_id,
    v_person_id,
    v_current_school_id,
    v_current_enrollment_id,
    v_current_affiliation_id,
    v_legacy_student_id,
    'transition',
    'matched',
    v_canonical_snapshot,
    v_legacy_snapshot,
    v_request_id,
    v_account_id,
    v_now
  );

  INSERT INTO public.school_enrollment_transition_events (
    id,
    tenant_id,
    transition_id,
    person_id,
    from_enrollment_id,
    to_enrollment_id,
    source_school_id,
    destination_school_id,
    event_type,
    transition_type,
    effective_at,
    reason,
    evidence_reference,
    expected_enrollment_version,
    organization_tree_version_id,
    authorization_version_evidence,
    actor_account_id,
    request_id,
    occurred_at
  ) VALUES (
    p_event_id,
    v_tenant_id,
    p_transition_id,
    v_person_id,
    v_from_enrollment_id,
    v_to_enrollment_id,
    v_source_school_id,
    v_destination_school_id,
    'applied',
    v_transition_type,
    v_effective_at,
    v_reason,
    v_evidence_reference,
    v_expected_version,
    v_tree_version_id,
    v_authorization_evidence,
    v_account_id,
    v_request_id,
    v_now
  );

  RETURN QUERY SELECT
    p_event_id,
    p_transition_id,
    v_person_id,
    v_from_enrollment_id,
    v_to_enrollment_id,
    v_source_school_id,
    v_destination_school_id,
    v_transition_type,
    v_effective_at,
    'applied'::text,
    v_authorization_evidence,
    v_now;
END
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."cancel_school_enrollment_transition"(
  p_event_id uuid,
  p_transition_id uuid,
  p_reason text
)
RETURNS TABLE (
  event_id uuid,
  transition_id uuid,
  person_id uuid,
  transition_type text,
  effective_at timestamp with time zone,
  event_type text,
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
  v_membership_version bigint := nullif(current_setting('app.membership_version', true), '')::bigint;
  v_now timestamp with time zone := statement_timestamp();
  v_person_id uuid;
  v_from_enrollment_id uuid;
  v_source_school_id uuid;
  v_destination_school_id uuid;
  v_transition_type text;
  v_effective_at timestamp with time zone;
  v_expected_version bigint;
  v_tree_version_id uuid;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_student_admitter'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.student_enrollments.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR v_request_id IS NULL
    OR v_membership_version IS NULL
    OR p_event_id IS NULL
    OR p_transition_id IS NULL
    OR p_reason IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_tenant_id::text || ':transition:' || p_transition_id::text, 0)
  );

  SELECT
    scheduled.person_id,
    scheduled.from_enrollment_id,
    scheduled.source_school_id,
    scheduled.destination_school_id,
    scheduled.transition_type,
    scheduled.effective_at,
    scheduled.expected_enrollment_version,
    scheduled.organization_tree_version_id
  INTO
    v_person_id,
    v_from_enrollment_id,
    v_source_school_id,
    v_destination_school_id,
    v_transition_type,
    v_effective_at,
    v_expected_version,
    v_tree_version_id
  FROM public.school_enrollment_transition_events AS scheduled
  WHERE scheduled.tenant_id = v_tenant_id
    AND scheduled.transition_id = p_transition_id
    AND scheduled.event_type = 'scheduled'
  ;

  IF v_person_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.school_enrollment_transition_events AS resolved
      WHERE resolved.tenant_id = v_tenant_id
        AND resolved.transition_id = p_transition_id
        AND resolved.event_type IN ('applied', 'cancelled')
    )
    OR (
      v_source_school_id IS NOT NULL
      AND NOT public.openschool_school_scope_allows(v_tenant_id, v_source_school_id)
    )
    OR (
      v_destination_school_id IS NOT NULL
      AND NOT public.openschool_school_scope_allows(v_tenant_id, v_destination_school_id)
    )
  THEN
    RAISE EXCEPTION 'ENROLLMENT_TRANSITION_UNAVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.school_enrollment_transition_events (
    id,
    tenant_id,
    transition_id,
    person_id,
    from_enrollment_id,
    source_school_id,
    destination_school_id,
    event_type,
    transition_type,
    effective_at,
    reason,
    expected_enrollment_version,
    organization_tree_version_id,
    authorization_version_evidence,
    actor_account_id,
    request_id,
    occurred_at
  ) VALUES (
    p_event_id,
    v_tenant_id,
    p_transition_id,
    v_person_id,
    v_from_enrollment_id,
    v_source_school_id,
    v_destination_school_id,
    'cancelled',
    v_transition_type,
    v_effective_at,
    btrim(p_reason),
    v_expected_version,
    v_tree_version_id,
    jsonb_build_array(jsonb_build_object(
      'actorAccountId', v_account_id,
      'membershipVersion', v_membership_version
    )),
    v_account_id,
    v_request_id,
    v_now
  );

  RETURN QUERY SELECT
    p_event_id,
    p_transition_id,
    v_person_id,
    v_transition_type,
    v_effective_at,
    'cancelled'::text,
    v_now;
END
$$;--> statement-breakpoint

ALTER FUNCTION "openschool_private"."schedule_school_enrollment_transition"(
  uuid, uuid, uuid, uuid, uuid, text, timestamp with time zone, text, text, bigint
) OWNER TO "openschool_student_admitter";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."apply_school_enrollment_transition"(
  uuid, uuid, uuid, uuid, uuid
) OWNER TO "openschool_student_admitter";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."cancel_school_enrollment_transition"(
  uuid, uuid, text
) OWNER TO "openschool_student_admitter";--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_private"."schedule_school_enrollment_transition"(
  uuid, uuid, uuid, uuid, uuid, text, timestamp with time zone, text, text, bigint
) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."apply_school_enrollment_transition"(
  uuid, uuid, uuid, uuid, uuid
) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."cancel_school_enrollment_transition"(
  uuid, uuid, text
) FROM PUBLIC;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION "openschool_private"."schedule_school_enrollment_transition"(
  uuid, uuid, uuid, uuid, uuid, text, timestamp with time zone, text, text, bigint
) TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."apply_school_enrollment_transition"(
  uuid, uuid, uuid, uuid, uuid
) TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."cancel_school_enrollment_transition"(
  uuid, uuid, text
) TO "openschool_runtime";--> statement-breakpoint
CREATE POLICY "school_enrollment_transition_events_runtime_select" ON "school_enrollment_transition_events" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "school_enrollment_transition_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.student_enrollments.read', 'tenant.student_enrollments.manage')
        AND public.openschool_enrollment_transition_scope_allows(
          "school_enrollment_transition_events"."tenant_id", "school_enrollment_transition_events"."person_id", "school_enrollment_transition_events"."source_school_id", "school_enrollment_transition_events"."destination_school_id"
        )
      );--> statement-breakpoint
CREATE POLICY "school_enrollment_transition_events_runtime_insert_deny" ON "school_enrollment_transition_events" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "school_enrollment_transition_events_runtime_update_deny" ON "school_enrollment_transition_events" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "school_enrollment_transition_events_runtime_delete_deny" ON "school_enrollment_transition_events" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "school_enrollment_transition_events_admitter_select" ON "school_enrollment_transition_events" AS PERMISSIVE FOR SELECT TO "openschool_student_admitter" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "school_enrollment_transition_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.student_enrollments.manage'
        AND public.openschool_enrollment_transition_scope_allows(
          "school_enrollment_transition_events"."tenant_id", "school_enrollment_transition_events"."person_id", "school_enrollment_transition_events"."source_school_id", "school_enrollment_transition_events"."destination_school_id"
        )
      );--> statement-breakpoint
CREATE POLICY "school_enrollment_transition_events_admitter_insert" ON "school_enrollment_transition_events" AS PERMISSIVE FOR INSERT TO "openschool_student_admitter" WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "school_enrollment_transition_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.student_enrollments.manage'
        AND public.openschool_enrollment_transition_scope_allows(
          "school_enrollment_transition_events"."tenant_id", "school_enrollment_transition_events"."person_id", "school_enrollment_transition_events"."source_school_id", "school_enrollment_transition_events"."destination_school_id"
        )
      );--> statement-breakpoint
CREATE POLICY "school_enrollment_transition_events_admitter_update_deny" ON "school_enrollment_transition_events" AS PERMISSIVE FOR UPDATE TO "openschool_student_admitter" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "school_enrollment_transition_events_admitter_delete_deny" ON "school_enrollment_transition_events" AS PERMISSIVE FOR DELETE TO "openschool_student_admitter" USING (false);--> statement-breakpoint
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
                'tenant.student_enrollments.read', 'tenant.student_enrollments.manage',
                'identity.context.resolve'
              )
            AND public.openschool_school_scope_allows(
              "schools"."tenant_id", "schools"."id"
            )
          )
        )
      );--> statement-breakpoint
ALTER POLICY "schools_student_admitter_select" ON "schools" TO openschool_student_admitter USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "schools"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN (
  'tenant.students.create', 'tenant.students.update',
  'tenant.student_enrollments.manage'
)
        AND public.openschool_school_scope_allows("schools"."tenant_id", "schools"."id")
      );--> statement-breakpoint
ALTER POLICY "students_admitter_select" ON "students" TO openschool_student_admitter USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN (
  'tenant.students.create', 'tenant.students.update',
  'tenant.student_enrollments.manage'
)
        AND public.openschool_school_scope_allows("students"."tenant_id", "students"."school_id")
      );--> statement-breakpoint
ALTER POLICY "students_admitter_update" ON "students" TO openschool_student_admitter USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.students.update', 'tenant.student_enrollments.manage')
        AND public.openschool_school_scope_allows("students"."tenant_id", "students"."school_id")
      ) WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.students.update', 'tenant.student_enrollments.manage')
        AND public.openschool_school_scope_allows("students"."tenant_id", "students"."school_id")
      );--> statement-breakpoint
ALTER POLICY "school_enrollments_runtime_select" ON "school_enrollments" TO openschool_runtime USING (
        "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') IN (

  'tenant.students.read', 'tenant.students.update',
  'tenant.students.delete', 'support.students.read',
  'tenant.student_enrollments.read', 'tenant.student_enrollments.manage'

        )
        AND public.openschool_canonical_student_scope_allows(
          "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
        )
      );--> statement-breakpoint
ALTER POLICY "school_enrollments_admitter_select" ON "school_enrollments" TO openschool_student_admitter USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN (
  'tenant.students.create', 'tenant.students.update',
  'tenant.student_enrollments.manage'
)
        AND public.openschool_canonical_student_scope_allows(
          "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
        )
      );--> statement-breakpoint
ALTER POLICY "school_enrollments_admitter_insert" ON "school_enrollments" TO openschool_student_admitter WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.students.create', 'tenant.student_enrollments.manage')
        AND public.openschool_school_scope_allows("school_enrollments"."tenant_id", "school_enrollments"."school_id")
      );--> statement-breakpoint
ALTER POLICY "school_enrollments_admitter_update" ON "school_enrollments" TO openschool_student_admitter USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.students.update', 'tenant.student_enrollments.manage')
        AND public.openschool_canonical_student_scope_allows(
          "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
        )
      ) WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.students.update', 'tenant.student_enrollments.manage')
        AND public.openschool_canonical_student_scope_allows(
          "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
        )
      );--> statement-breakpoint
ALTER POLICY "student_compatibility_evidence_runtime_select" ON "student_compatibility_evidence" TO openschool_runtime USING (
        "student_compatibility_evidence"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') IN (

  'tenant.students.read', 'tenant.students.update',
  'tenant.students.delete', 'support.students.read',
  'tenant.student_enrollments.read', 'tenant.student_enrollments.manage'

        )
        AND public.openschool_canonical_student_scope_allows(
          "student_compatibility_evidence"."tenant_id", "student_compatibility_evidence"."school_id", "student_compatibility_evidence"."person_id"
        )
      );--> statement-breakpoint
ALTER POLICY "student_compatibility_evidence_admitter_select" ON "student_compatibility_evidence" TO openschool_student_admitter USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "student_compatibility_evidence"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN (
  'tenant.students.create', 'tenant.students.update',
  'tenant.student_enrollments.manage'
)
        AND public.openschool_canonical_student_scope_allows(
          "student_compatibility_evidence"."tenant_id", "student_compatibility_evidence"."school_id", "student_compatibility_evidence"."person_id"
        )
      );--> statement-breakpoint
ALTER POLICY "student_compatibility_evidence_admitter_insert" ON "student_compatibility_evidence" TO openschool_student_admitter WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "student_compatibility_evidence"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN (
  'tenant.students.create', 'tenant.students.update',
  'tenant.student_enrollments.manage'
)
        AND public.openschool_canonical_student_scope_allows(
          "student_compatibility_evidence"."tenant_id", "student_compatibility_evidence"."school_id", "student_compatibility_evidence"."person_id"
        )
      );
