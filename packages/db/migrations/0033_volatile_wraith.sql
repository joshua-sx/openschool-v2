CREATE TABLE "contact_profiles" (
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"phone" text,
	"normalized_phone" text,
	"preferred_contact_method" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_profiles_pk" PRIMARY KEY("tenant_id","person_id"),
	CONSTRAINT "contact_profiles_phone_check" CHECK ("contact_profiles"."phone" IS NULL OR char_length(btrim("contact_profiles"."phone")) BETWEEN 5 AND 32),
	CONSTRAINT "contact_profiles_normalized_phone_check" CHECK ("contact_profiles"."normalized_phone" IS NULL OR char_length("contact_profiles"."normalized_phone") BETWEEN 5 AND 20),
	CONSTRAINT "contact_profiles_preferred_method_check" CHECK ("contact_profiles"."preferred_contact_method" IN ('email', 'phone', 'sms', 'none'))
);
--> statement-breakpoint
ALTER TABLE "contact_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "person_relationships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD COLUMN "legal_authority" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD COLUMN "decision_authority" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD COLUMN "emergency_priority" integer;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD COLUMN "pickup_authority" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD COLUMN "portal_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_profiles" ADD CONSTRAINT "contact_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "contact_profiles" ADD CONSTRAINT "contact_profiles_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "contact_profiles_tenant_phone_idx" ON "contact_profiles" USING btree ("tenant_id","normalized_phone");--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_decision_authority_check" CHECK ("person_relationships"."decision_authority" IN ('none', 'shared', 'sole', 'limited'));--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_emergency_priority_check" CHECK ("person_relationships"."emergency_priority" IS NULL OR "person_relationships"."emergency_priority" BETWEEN 1 AND 99);--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_portal_eligibility_check" CHECK (NOT "person_relationships"."portal_eligible" OR "person_relationships"."type" IN ('guardian_of', 'parent_of'));--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_version_positive" CHECK ("person_relationships"."version" > 0);--> statement-breakpoint

-- Existing parent and guardian relationships were the legacy portal authority.
-- Preserve that behavior explicitly before portal eligibility becomes required.
UPDATE public.person_relationships
SET portal_eligible = true
WHERE type IN ('guardian_of', 'parent_of');--> statement-breakpoint

ALTER TABLE "contact_profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "person_relationships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE FUNCTION "openschool_guardian_contact_read_scope_allows"(
  row_tenant_id uuid,
  learner_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_enrollments AS enrollment
    WHERE enrollment.tenant_id = row_tenant_id
      AND enrollment.person_id = learner_person_id
      AND public.openschool_canonical_student_scope_allows(
        enrollment.tenant_id, enrollment.school_id, enrollment.person_id
      )
  )
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_guardian_contact_manage_scope_allows"(
  row_tenant_id uuid,
  learner_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_enrollments AS enrollment
    WHERE enrollment.tenant_id = row_tenant_id
      AND enrollment.person_id = learner_person_id
      AND enrollment.status = 'enrolled'
      AND enrollment.valid_from <= now()
      AND (enrollment.valid_until IS NULL OR enrollment.valid_until > now())
      AND public.openschool_canonical_student_scope_allows(
        enrollment.tenant_id, enrollment.school_id, enrollment.person_id
      )
  )
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_contact_person_read_scope_allows"(
  row_tenant_id uuid,
  contact_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.person_relationships AS relationship
    WHERE relationship.tenant_id = row_tenant_id
      AND relationship.subject_person_id = contact_person_id
      AND public.openschool_guardian_contact_read_scope_allows(
        relationship.tenant_id, relationship.related_person_id
      )
  )
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_contact_person_manage_scope_allows"(
  row_tenant_id uuid,
  contact_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.person_relationships AS relationship
    WHERE relationship.tenant_id = row_tenant_id
      AND relationship.subject_person_id = contact_person_id
      AND public.openschool_guardian_contact_manage_scope_allows(
        relationship.tenant_id, relationship.related_person_id
      )
  )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_guardian_contact_read_scope_allows"(uuid, uuid)
  FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_guardian_contact_manage_scope_allows"(uuid, uuid)
  FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_contact_person_read_scope_allows"(uuid, uuid)
  FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_contact_person_manage_scope_allows"(uuid, uuid)
  FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_guardian_contact_read_scope_allows"(uuid, uuid)
  TO "openschool_runtime", "openschool_guardian_contact_manager";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_guardian_contact_manage_scope_allows"(uuid, uuid)
  TO "openschool_runtime", "openschool_guardian_contact_manager";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_contact_person_read_scope_allows"(uuid, uuid)
  TO "openschool_runtime", "openschool_guardian_contact_manager";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_contact_person_manage_scope_allows"(uuid, uuid)
  TO "openschool_runtime", "openschool_guardian_contact_manager";--> statement-breakpoint

CREATE POLICY "person_relationships_runtime_select" ON "person_relationships" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "person_relationships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND (
          (
            nullif(current_setting('app.policy_capability', true), '')
              = 'tenant.guardian_contacts.read'
            AND public.openschool_guardian_contact_read_scope_allows(
              "person_relationships"."tenant_id", "person_relationships"."related_person_id"
            )
          )
          OR (
            nullif(current_setting('app.policy_capability', true), '')
              = 'tenant.guardian_contacts.manage'
            AND public.openschool_guardian_contact_manage_scope_allows(
              "person_relationships"."tenant_id", "person_relationships"."related_person_id"
            )
          )
          OR (
            nullif(current_setting('app.policy_capability', true), '')
              IN ('identity.context.resolve', 'tenant.students.read')
            AND "person_relationships"."subject_person_id"::text
              = nullif(current_setting('app.person_id', true), '')
            AND "person_relationships"."type" IN ('guardian_of', 'parent_of')
            AND "person_relationships"."portal_eligible"
            AND "person_relationships"."status" = 'active'
            AND "person_relationships"."valid_from" <= now()
            AND ("person_relationships"."valid_until" IS NULL OR "person_relationships"."valid_until" > now())
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(public.openschool_policy_constraints()) AS constraint_row
              WHERE constraint_row ->> 'kind' = 'linked_student'
                AND constraint_row ->> 'tenantId' = "person_relationships"."tenant_id"::text
                AND constraint_row ->> 'guardianPersonId' = "person_relationships"."subject_person_id"::text
                AND (
                  constraint_row ->> 'studentId' IS NULL
                  OR constraint_row ->> 'studentId' = "person_relationships"."related_person_id"::text
                )
            )
          )
        )
      );--> statement-breakpoint
CREATE POLICY "person_relationships_runtime_insert_deny" ON "person_relationships" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "person_relationships_runtime_update_deny" ON "person_relationships" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "person_relationships_runtime_delete_deny" ON "person_relationships" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "person_relationships_contact_manager_select" ON "person_relationships" AS PERMISSIVE FOR SELECT TO "openschool_guardian_contact_manager" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND "person_relationships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_guardian_contact_manage_scope_allows(
          "person_relationships"."tenant_id", "person_relationships"."related_person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "person_relationships_contact_manager_insert" ON "person_relationships" AS PERMISSIVE FOR INSERT TO "openschool_guardian_contact_manager" WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND "person_relationships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_guardian_contact_manage_scope_allows(
          "person_relationships"."tenant_id", "person_relationships"."related_person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "person_relationships_contact_manager_update" ON "person_relationships" AS PERMISSIVE FOR UPDATE TO "openschool_guardian_contact_manager" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND "person_relationships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_guardian_contact_manage_scope_allows(
          "person_relationships"."tenant_id", "person_relationships"."related_person_id"
        )
      ) WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND "person_relationships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_guardian_contact_manage_scope_allows(
          "person_relationships"."tenant_id", "person_relationships"."related_person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "person_relationships_contact_manager_delete_deny" ON "person_relationships" AS PERMISSIVE FOR DELETE TO "openschool_guardian_contact_manager" USING (false);--> statement-breakpoint
CREATE POLICY "school_enrollments_contact_manager_select" ON "school_enrollments" AS PERMISSIVE FOR SELECT TO "openschool_guardian_contact_manager" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_canonical_student_scope_allows(
          "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "contact_profiles_runtime_select" ON "contact_profiles" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "contact_profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.guardian_contacts.read', 'tenant.guardian_contacts.manage')
        AND public.openschool_contact_person_read_scope_allows(
          "contact_profiles"."tenant_id", "contact_profiles"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "contact_profiles_runtime_insert_deny" ON "contact_profiles" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "contact_profiles_runtime_update_deny" ON "contact_profiles" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "contact_profiles_runtime_delete_deny" ON "contact_profiles" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "contact_profiles_contact_manager_select" ON "contact_profiles" AS PERMISSIVE FOR SELECT TO "openschool_guardian_contact_manager" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND "contact_profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_contact_person_manage_scope_allows(
          "contact_profiles"."tenant_id", "contact_profiles"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "contact_profiles_contact_manager_insert" ON "contact_profiles" AS PERMISSIVE FOR INSERT TO "openschool_guardian_contact_manager" WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND "contact_profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_contact_person_manage_scope_allows(
          "contact_profiles"."tenant_id", "contact_profiles"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "contact_profiles_contact_manager_update" ON "contact_profiles" AS PERMISSIVE FOR UPDATE TO "openschool_guardian_contact_manager" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND "contact_profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_contact_person_manage_scope_allows(
          "contact_profiles"."tenant_id", "contact_profiles"."person_id"
        )
      ) WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND "contact_profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_contact_person_manage_scope_allows(
          "contact_profiles"."tenant_id", "contact_profiles"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "contact_profiles_contact_manager_delete_deny" ON "contact_profiles" AS PERMISSIVE FOR DELETE TO "openschool_guardian_contact_manager" USING (false);--> statement-breakpoint
ALTER POLICY "schools_runtime_select" ON "schools" TO openschool_runtime USING (
        "schools"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND (
          "schools"."id" = nullif(current_setting('app.school_id', true), '')::uuid
          OR (
            nullif(current_setting('app.policy_capability', true), '')
              IN (
                'tenant.schools.read',
                'tenant.students.create', 'tenant.students.read',
                'tenant.students.update', 'tenant.students.delete',
                'support.schools.read', 'support.students.read',
                'tenant.accounts.invite', 'tenant.accounts.manage',
                'tenant.academic_structure.read', 'tenant.academic_structure.manage',
                'tenant.student_enrollments.read', 'tenant.student_enrollments.manage',
                'tenant.guardian_contacts.read', 'tenant.guardian_contacts.manage',
                'identity.context.resolve'
              )
            AND public.openschool_school_scope_allows(
              "schools"."tenant_id", "schools"."id"
            )
          )
        )
      );--> statement-breakpoint
ALTER POLICY "school_enrollments_runtime_select" ON "school_enrollments" TO openschool_runtime USING (
        "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') IN (
          'tenant.students.read', 'tenant.students.update',
          'tenant.students.delete', 'support.students.read',
          'tenant.student_enrollments.read', 'tenant.student_enrollments.manage',
          'tenant.guardian_contacts.read', 'tenant.guardian_contacts.manage',
          'identity.context.resolve'
        )
        AND public.openschool_canonical_student_scope_allows(
          "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
        )
      );
--> statement-breakpoint

CREATE FUNCTION "openschool_private"."create_guardian_contact"(
  p_relationship_id uuid,
  p_contact_person_id uuid,
  p_learner_person_id uuid,
  p_create_person boolean,
  p_display_name text,
  p_normalized_display_name text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_normalized_email text,
  p_phone text,
  p_normalized_phone text,
  p_preferred_contact_method text,
  p_relationship_type text,
  p_legal_authority boolean,
  p_decision_authority text,
  p_emergency_priority integer,
  p_pickup_authority boolean,
  p_portal_eligible boolean,
  p_valid_from timestamp with time zone,
  p_issuance_reason text
)
RETURNS TABLE (
  relationship_id uuid,
  contact_person_id uuid,
  version bigint,
  account_membership_invalidated boolean,
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
  v_invalidated_count integer := 0;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_guardian_contact_manager'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.guardian_contacts.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.request_id', true), '') IS NULL
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR p_relationship_id IS NULL
    OR p_contact_person_id IS NULL
    OR p_learner_person_id IS NULL
    OR p_contact_person_id = p_learner_person_id
    OR p_relationship_type NOT IN ('parent_of', 'guardian_of', 'emergency_contact_of')
    OR p_decision_authority NOT IN ('none', 'shared', 'sole', 'limited')
    OR (p_emergency_priority IS NOT NULL AND p_emergency_priority NOT BETWEEN 1 AND 99)
    OR (p_portal_eligible AND p_relationship_type = 'emergency_contact_of')
    OR p_valid_from IS NULL
    OR char_length(btrim(p_issuance_reason)) NOT BETWEEN 3 AND 512
    OR NOT public.openschool_guardian_contact_manage_scope_allows(
      v_tenant_id, p_learner_person_id
    )
  THEN
    RAISE EXCEPTION 'GUARDIAN_CONTACT_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_create_person THEN
    IF char_length(btrim(p_display_name)) NOT BETWEEN 1 AND 200
      OR char_length(btrim(p_normalized_display_name)) NOT BETWEEN 1 AND 200
      OR char_length(btrim(p_first_name)) NOT BETWEEN 1 AND 100
      OR char_length(btrim(p_last_name)) NOT BETWEEN 1 AND 100
      OR (p_email IS NOT NULL AND char_length(btrim(p_email)) > 320)
      OR (p_phone IS NOT NULL AND char_length(btrim(p_phone)) NOT BETWEEN 5 AND 32)
      OR p_preferred_contact_method NOT IN ('email', 'phone', 'sms', 'none')
      OR (p_preferred_contact_method = 'email' AND p_email IS NULL)
      OR (p_preferred_contact_method IN ('phone', 'sms') AND p_phone IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.people AS existing
        WHERE existing.tenant_id = v_tenant_id
          AND existing.id = p_contact_person_id
      )
    THEN
      RAISE EXCEPTION 'GUARDIAN_CONTACT_PERSON_INVALID' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.people (
      id, tenant_id, display_name, normalized_display_name,
      first_name, last_name, email, normalized_email,
      status, source, created_at, updated_at
    ) VALUES (
      p_contact_person_id, v_tenant_id, btrim(p_display_name),
      btrim(p_normalized_display_name), btrim(p_first_name), btrim(p_last_name),
      nullif(btrim(p_email), ''), nullif(btrim(p_normalized_email), ''),
      'active', 'native', v_occurred_at, v_occurred_at
    );
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.people AS existing
      WHERE existing.tenant_id = v_tenant_id
        AND existing.id = p_contact_person_id
        AND existing.status = 'active'
    ) OR NOT public.openschool_contact_person_manage_scope_allows(
      v_tenant_id, p_contact_person_id
    ) THEN
      RAISE EXCEPTION 'GUARDIAN_CONTACT_PERSON_UNAVAILABLE' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.person_relationships (
    id, tenant_id, subject_person_id, related_person_id, type,
    status, valid_from, issued_by_account_id, issuance_reason,
    legal_authority, decision_authority, emergency_priority,
    pickup_authority, portal_eligible, version, created_at, updated_at
  ) VALUES (
    p_relationship_id, v_tenant_id, p_contact_person_id, p_learner_person_id,
    p_relationship_type, 'active', p_valid_from, v_account_id,
    btrim(p_issuance_reason), p_legal_authority, p_decision_authority,
    p_emergency_priority, p_pickup_authority, p_portal_eligible, 1,
    v_occurred_at, v_occurred_at
  );

  IF p_create_person THEN
    INSERT INTO public.contact_profiles (
      tenant_id, person_id, phone, normalized_phone,
      preferred_contact_method, created_at, updated_at
    ) VALUES (
      v_tenant_id, p_contact_person_id, nullif(btrim(p_phone), ''),
      nullif(btrim(p_normalized_phone), ''), p_preferred_contact_method,
      v_occurred_at, v_occurred_at
    );
  END IF;

  IF p_portal_eligible THEN
    UPDATE public.accounts AS account
    SET membership_version = account.membership_version + 1,
        updated_at = v_occurred_at
    FROM public.account_links AS link
    WHERE link.tenant_id = v_tenant_id
      AND link.person_id = p_contact_person_id
      AND link.account_id = account.id
      AND link.status = 'active'
      AND link.valid_from <= v_occurred_at
      AND (link.valid_until IS NULL OR link.valid_until > v_occurred_at);
    GET DIAGNOSTICS v_invalidated_count = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT
    p_relationship_id, p_contact_person_id, 1::bigint,
    v_invalidated_count > 0, v_occurred_at;
END
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."update_guardian_contact"(
  p_relationship_id uuid,
  p_expected_version bigint,
  p_legal_authority boolean,
  p_decision_authority text,
  p_emergency_priority integer,
  p_pickup_authority boolean,
  p_portal_eligible boolean
)
RETURNS TABLE (
  relationship_id uuid,
  contact_person_id uuid,
  learner_person_id uuid,
  version bigint,
  account_membership_invalidated boolean,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_occurred_at timestamp with time zone := clock_timestamp();
  v_relationship public.person_relationships%ROWTYPE;
  v_invalidated_count integer := 0;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_guardian_contact_manager'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.guardian_contacts.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.request_id', true), '') IS NULL
    OR v_tenant_id IS NULL
    OR p_relationship_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_decision_authority NOT IN ('none', 'shared', 'sole', 'limited')
    OR (p_emergency_priority IS NOT NULL AND p_emergency_priority NOT BETWEEN 1 AND 99)
  THEN
    RAISE EXCEPTION 'GUARDIAN_CONTACT_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT relationship.*
  INTO v_relationship
  FROM public.person_relationships AS relationship
  WHERE relationship.tenant_id = v_tenant_id
    AND relationship.id = p_relationship_id
    AND relationship.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GUARDIAN_CONTACT_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  IF v_relationship.version <> p_expected_version THEN
    RAISE EXCEPTION 'GUARDIAN_CONTACT_STALE' USING ERRCODE = '40001';
  END IF;
  IF p_portal_eligible
    AND v_relationship.type NOT IN ('guardian_of', 'parent_of') THEN
    RAISE EXCEPTION 'GUARDIAN_CONTACT_PORTAL_INELIGIBLE' USING ERRCODE = '23514';
  END IF;

  UPDATE public.person_relationships AS relationship
  SET legal_authority = p_legal_authority,
      decision_authority = p_decision_authority,
      emergency_priority = p_emergency_priority,
      pickup_authority = p_pickup_authority,
      portal_eligible = p_portal_eligible,
      version = relationship.version + 1,
      updated_at = v_occurred_at
  WHERE relationship.tenant_id = v_tenant_id
    AND relationship.id = p_relationship_id;

  IF v_relationship.portal_eligible IS DISTINCT FROM p_portal_eligible THEN
    UPDATE public.accounts AS account
    SET membership_version = account.membership_version + 1,
        updated_at = v_occurred_at
    FROM public.account_links AS link
    WHERE link.tenant_id = v_tenant_id
      AND link.person_id = v_relationship.subject_person_id
      AND link.account_id = account.id
      AND link.status = 'active'
      AND link.valid_from <= v_occurred_at
      AND (link.valid_until IS NULL OR link.valid_until > v_occurred_at);
    GET DIAGNOSTICS v_invalidated_count = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT
    p_relationship_id, v_relationship.subject_person_id,
    v_relationship.related_person_id, p_expected_version + 1,
    v_invalidated_count > 0, v_occurred_at;
END
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."end_guardian_contact"(
  p_relationship_id uuid,
  p_expected_version bigint,
  p_revocation_reason text,
  p_ended_at timestamp with time zone
)
RETURNS TABLE (
  relationship_id uuid,
  contact_person_id uuid,
  learner_person_id uuid,
  version bigint,
  account_membership_invalidated boolean,
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
  v_relationship public.person_relationships%ROWTYPE;
  v_effective_end timestamp with time zone;
  v_invalidated_count integer := 0;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_guardian_contact_manager'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.guardian_contacts.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.request_id', true), '') IS NULL
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR p_relationship_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR char_length(btrim(p_revocation_reason)) NOT BETWEEN 3 AND 512
    OR p_ended_at IS NULL
  THEN
    RAISE EXCEPTION 'GUARDIAN_CONTACT_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT relationship.*
  INTO v_relationship
  FROM public.person_relationships AS relationship
  WHERE relationship.tenant_id = v_tenant_id
    AND relationship.id = p_relationship_id
    AND relationship.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GUARDIAN_CONTACT_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  IF v_relationship.version <> p_expected_version THEN
    RAISE EXCEPTION 'GUARDIAN_CONTACT_STALE' USING ERRCODE = '40001';
  END IF;
  v_effective_end := greatest(p_ended_at, v_relationship.valid_from + interval '1 microsecond');

  UPDATE public.person_relationships AS relationship
  SET status = 'revoked',
      valid_until = v_effective_end,
      revoked_at = v_occurred_at,
      revoked_by_account_id = v_account_id,
      revocation_reason = btrim(p_revocation_reason),
      version = relationship.version + 1,
      updated_at = v_occurred_at
  WHERE relationship.tenant_id = v_tenant_id
    AND relationship.id = p_relationship_id;

  IF v_relationship.portal_eligible THEN
    UPDATE public.accounts AS account
    SET membership_version = account.membership_version + 1,
        updated_at = v_occurred_at
    FROM public.account_links AS link
    WHERE link.tenant_id = v_tenant_id
      AND link.person_id = v_relationship.subject_person_id
      AND link.account_id = account.id
      AND link.status = 'active'
      AND link.valid_from <= v_occurred_at
      AND (link.valid_until IS NULL OR link.valid_until > v_occurred_at);
    GET DIAGNOSTICS v_invalidated_count = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT
    p_relationship_id, v_relationship.subject_person_id,
    v_relationship.related_person_id, p_expected_version + 1,
    v_invalidated_count > 0, v_occurred_at;
END
$$;--> statement-breakpoint

ALTER FUNCTION "openschool_private"."create_guardian_contact"(
  uuid, uuid, uuid, boolean, text, text, text, text, text, text, text, text,
  text, text, boolean, text, integer, boolean, boolean, timestamp with time zone, text
) OWNER TO "openschool_guardian_contact_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."update_guardian_contact"(
  uuid, bigint, boolean, text, integer, boolean, boolean
) OWNER TO "openschool_guardian_contact_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."end_guardian_contact"(
  uuid, bigint, text, timestamp with time zone
) OWNER TO "openschool_guardian_contact_manager";--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_private"."create_guardian_contact"(
  uuid, uuid, uuid, boolean, text, text, text, text, text, text, text, text,
  text, text, boolean, text, integer, boolean, boolean, timestamp with time zone, text
) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."update_guardian_contact"(
  uuid, bigint, boolean, text, integer, boolean, boolean
) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."end_guardian_contact"(
  uuid, bigint, text, timestamp with time zone
) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."create_guardian_contact"(
  uuid, uuid, uuid, boolean, text, text, text, text, text, text, text, text,
  text, text, boolean, text, integer, boolean, boolean, timestamp with time zone, text
) TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."update_guardian_contact"(
  uuid, bigint, boolean, text, integer, boolean, boolean
) TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."end_guardian_contact"(
  uuid, bigint, text, timestamp with time zone
) TO "openschool_runtime";--> statement-breakpoint

GRANT USAGE ON SCHEMA "public", "openschool_private"
  TO "openschool_guardian_contact_manager";--> statement-breakpoint
GRANT SELECT ON
  "people", "account_links", "school_enrollments", "person_relationships", "contact_profiles",
  "student_profiles", "affiliations", "enrollments", "school_governance_assignments",
  "organization_tree_versions", "organization_tree_closure"
  TO "openschool_guardian_contact_manager";--> statement-breakpoint
GRANT INSERT ON "people", "person_relationships", "contact_profiles"
  TO "openschool_guardian_contact_manager";--> statement-breakpoint
GRANT UPDATE ("phone", "normalized_phone", "preferred_contact_method", "updated_at")
  ON "contact_profiles" TO "openschool_guardian_contact_manager";--> statement-breakpoint
GRANT UPDATE (
  "legal_authority", "decision_authority", "emergency_priority", "pickup_authority",
  "portal_eligible", "status", "valid_until", "revoked_at", "revoked_by_account_id",
  "revocation_reason", "version", "updated_at"
) ON "person_relationships" TO "openschool_guardian_contact_manager";--> statement-breakpoint
GRANT UPDATE ("membership_version", "updated_at") ON "accounts"
  TO "openschool_guardian_contact_manager";--> statement-breakpoint
GRANT SELECT ("id", "membership_version") ON "accounts"
  TO "openschool_guardian_contact_manager";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_policy_constraints"()
  TO "openschool_guardian_contact_manager";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_school_scope_allows"(uuid, uuid)
  TO "openschool_guardian_contact_manager";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_canonical_student_scope_allows"(uuid, uuid, uuid)
  TO "openschool_guardian_contact_manager";--> statement-breakpoint
GRANT SELECT ON "person_relationships", "contact_profiles"
  TO "openschool_runtime";--> statement-breakpoint

DO $$
DECLARE
  unsafe_execution_membership boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'openschool_guardian_contact_manager'
      AND NOT rolcanlogin
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolinherit
      AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Guardian contact manager role attributes are unsafe'
      USING ERRCODE = '55000';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_roles AS execution_role
    WHERE execution_role.rolname IN (
      'openschool_runtime', 'openschool_worker', 'openschool_control_plane'
    )
      AND pg_has_role(
        execution_role.oid,
        'openschool_guardian_contact_manager'::regrole,
        'member'
      )
  ) INTO unsafe_execution_membership;

  IF unsafe_execution_membership THEN
    RAISE EXCEPTION 'Execution roles must not assume the Guardian contact manager'
      USING ERRCODE = '55000';
  END IF;
END
$$;
