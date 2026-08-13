ALTER TABLE "person_duplicate_cases" FORCE ROW LEVEL SECURITY;
ALTER TABLE "person_duplicate_case_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TRIGGER "person_duplicate_cases_identity_anchors_immutable"
  BEFORE UPDATE ON "person_duplicate_cases"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'tenant_id', 'review_school_id', 'first_person_id', 'second_person_id',
    'created_by_account_id', 'created_at'
  );
CREATE TRIGGER "person_duplicate_case_events_append_only"
  BEFORE UPDATE OR DELETE ON "person_duplicate_case_events"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_immutable_row_mutation"();
--> statement-breakpoint

CREATE FUNCTION "public"."openschool_validate_duplicate_case_event_school"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.person_duplicate_cases AS duplicate_case
    WHERE duplicate_case.tenant_id = NEW.tenant_id
      AND duplicate_case.id = NEW.case_id
      AND duplicate_case.review_school_id = NEW.review_school_id
  ) THEN
    RAISE EXCEPTION 'PERSON_DUPLICATE_EVENT_CASE_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "person_duplicate_case_events_validate_school"
  BEFORE INSERT ON "person_duplicate_case_events"
  FOR EACH ROW EXECUTE FUNCTION "public"."openschool_validate_duplicate_case_event_school"();
REVOKE ALL ON FUNCTION "public"."openschool_validate_duplicate_case_event_school"() FROM PUBLIC;
--> statement-breakpoint

CREATE POLICY "school_enrollments_duplicate_manager_select" ON "school_enrollments"
  AS PERMISSIVE FOR SELECT TO "openschool_duplicate_review_manager" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_duplicate_review_manager'
    AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND nullif(current_setting('app.policy_capability', true), '') IN (
      'tenant.students.create', 'tenant.students.update',
      'tenant.guardian_contacts.manage', 'tenant.people_duplicates.review'
    )
    AND public.openschool_school_scope_allows(
      "school_enrollments"."tenant_id", "school_enrollments"."school_id"
    )
  );
--> statement-breakpoint

CREATE POLICY "person_relationships_duplicate_manager_select" ON "person_relationships"
  AS PERMISSIVE FOR SELECT TO "openschool_duplicate_review_manager" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_duplicate_review_manager'
    AND "person_relationships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND "person_relationships"."status" = 'active'
    AND "person_relationships"."valid_from" <= now()
    AND (
      "person_relationships"."valid_until" IS NULL
      OR "person_relationships"."valid_until" > now()
    )
    AND EXISTS (
      SELECT 1
      FROM public.school_enrollments AS learner_enrollment
      WHERE learner_enrollment.tenant_id = "person_relationships"."tenant_id"
        AND learner_enrollment.person_id = "person_relationships"."related_person_id"
        AND learner_enrollment.status = 'enrolled'
        AND learner_enrollment.valid_from <= now()
        AND (
          learner_enrollment.valid_until IS NULL
          OR learner_enrollment.valid_until > now()
        )
        AND public.openschool_school_scope_allows(
          learner_enrollment.tenant_id, learner_enrollment.school_id
        )
    )
  );
--> statement-breakpoint

ALTER POLICY "schools_runtime_select" ON "schools" TO openschool_runtime USING (
  "schools"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND (
    "schools"."id" = nullif(current_setting('app.school_id', true), '')::uuid
    OR (
      nullif(current_setting('app.policy_capability', true), '') IN (
        'tenant.schools.read',
        'tenant.students.create', 'tenant.students.read',
        'tenant.students.update', 'tenant.students.delete',
        'support.schools.read', 'support.students.read',
        'tenant.accounts.invite', 'tenant.accounts.manage',
        'tenant.academic_structure.read', 'tenant.academic_structure.manage',
        'tenant.student_enrollments.read', 'tenant.student_enrollments.manage',
        'tenant.guardian_contacts.read', 'tenant.guardian_contacts.manage',
        'tenant.sections.read', 'tenant.sections.manage',
        'tenant.people_duplicates.read', 'tenant.people_duplicates.review',
        'identity.context.resolve'
      )
      AND public.openschool_school_scope_allows("schools"."tenant_id", "schools"."id")
    )
  )
);
--> statement-breakpoint

GRANT USAGE ON SCHEMA "public", "openschool_private" TO "openschool_duplicate_review_manager";
GRANT SELECT ON TABLE
  "people", "affiliations", "school_enrollments", "person_relationships",
  "person_duplicate_cases", "person_duplicate_case_events",
  "school_governance_assignments", "organization_tree_closure", "organization_tree_versions"
  TO "openschool_duplicate_review_manager";
GRANT INSERT ON TABLE "person_duplicate_cases", "person_duplicate_case_events"
  TO "openschool_duplicate_review_manager";
GRANT UPDATE (status, current_version, current_score, current_signals, current_evidence_hash, updated_at)
  ON TABLE "person_duplicate_cases" TO "openschool_duplicate_review_manager";
GRANT EXECUTE ON FUNCTION public.openschool_policy_constraints(),
  public.openschool_school_scope_allows(uuid, uuid)
  TO "openschool_duplicate_review_manager";
--> statement-breakpoint

CREATE FUNCTION "openschool_private"."refresh_person_duplicate_candidates"(
  p_person_id uuid,
  p_school_id uuid,
  p_reason text
)
RETURNS TABLE (
  case_id uuid,
  other_person_id uuid,
  score integer,
  signals jsonb,
  case_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
SET timezone = 'UTC'
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_capability text := nullif(current_setting('app.policy_capability', true), '');
  v_target public.people%ROWTYPE;
  v_candidate record;
  v_case public.person_duplicate_cases%ROWTYPE;
  v_first_person_id uuid;
  v_second_person_id uuid;
  v_next_version integer;
  v_next_status text;
  v_seen_case_ids uuid[] := ARRAY[]::uuid[];
  v_now timestamptz := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_duplicate_review_manager'
    OR v_capability NOT IN (
      'tenant.students.create', 'tenant.students.update', 'tenant.guardian_contacts.manage'
    )
    OR v_tenant_id IS NULL OR v_account_id IS NULL
    OR p_person_id IS NULL OR p_school_id IS NULL
    OR p_reason IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
    OR NOT public.openschool_school_scope_allows(v_tenant_id, p_school_id)
  THEN
    RAISE EXCEPTION 'PERSON_DUPLICATE_REFRESH_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT person.* INTO v_target
  FROM public.people AS person
  WHERE person.tenant_id = v_tenant_id AND person.id = p_person_id
    AND person.status IN ('active', 'suspended');

  IF NOT FOUND OR NOT (
    EXISTS (
      SELECT 1 FROM public.affiliations AS affiliation
      WHERE affiliation.tenant_id = v_tenant_id
        AND affiliation.person_id = p_person_id
        AND affiliation.scope_type = 'school'
        AND affiliation.school_id = p_school_id
        AND affiliation.status = 'active'
        AND affiliation.valid_from <= v_now
        AND (affiliation.valid_until IS NULL OR affiliation.valid_until > v_now)
    )
    OR EXISTS (
      SELECT 1 FROM public.school_enrollments AS enrollment
      WHERE enrollment.tenant_id = v_tenant_id
        AND enrollment.person_id = p_person_id
        AND enrollment.school_id = p_school_id
        AND enrollment.status = 'enrolled'
        AND enrollment.valid_from <= v_now
        AND (enrollment.valid_until IS NULL OR enrollment.valid_until > v_now)
    )
    OR EXISTS (
      SELECT 1
      FROM public.person_relationships AS relationship
      INNER JOIN public.school_enrollments AS learner_enrollment
        ON learner_enrollment.tenant_id = relationship.tenant_id
        AND learner_enrollment.person_id = relationship.related_person_id
      WHERE relationship.tenant_id = v_tenant_id
        AND relationship.subject_person_id = p_person_id
        AND relationship.type IN ('guardian_of', 'parent_of', 'emergency_contact_of')
        AND relationship.status = 'active'
        AND relationship.valid_from <= v_now
        AND (relationship.valid_until IS NULL OR relationship.valid_until > v_now)
        AND learner_enrollment.school_id = p_school_id
        AND learner_enrollment.status = 'enrolled'
        AND learner_enrollment.valid_from <= v_now
        AND (learner_enrollment.valid_until IS NULL OR learner_enrollment.valid_until > v_now)
    )
  ) THEN
    RAISE EXCEPTION 'PERSON_DUPLICATE_REFRESH_TARGET_INVALID' USING ERRCODE = '42501';
  END IF;

  FOR v_candidate IN
    WITH candidate_ids AS MATERIALIZED (
      SELECT candidate_id FROM (
        (
          SELECT person.id AS candidate_id
          FROM public.people AS person
          WHERE v_target.normalized_email IS NOT NULL
            AND person.tenant_id = v_tenant_id
            AND person.id <> p_person_id
            AND person.normalized_email = v_target.normalized_email
          ORDER BY person.id
          LIMIT 25
        )
        UNION
        (
          SELECT person.id AS candidate_id
          FROM public.people AS person
          WHERE person.tenant_id = v_tenant_id
            AND person.id <> p_person_id
            AND person.normalized_display_name = v_target.normalized_display_name
          ORDER BY person.id
          LIMIT 25
        )
      ) AS bounded_candidates
    ),
    scored AS (
      SELECT
        person.id,
        LEAST(100, (
          CASE WHEN v_target.normalized_email IS NOT NULL
            AND person.normalized_email = v_target.normalized_email THEN 60 ELSE 0 END
          + CASE WHEN person.normalized_display_name = v_target.normalized_display_name
            THEN 25 ELSE 0 END
          + CASE WHEN v_target.date_of_birth IS NOT NULL
            AND person.date_of_birth = v_target.date_of_birth THEN 25 ELSE 0 END
        ))::integer AS score,
        to_jsonb(array_remove(ARRAY[
          CASE WHEN v_target.normalized_email IS NOT NULL
            AND person.normalized_email = v_target.normalized_email
            THEN 'same_normalized_email' END,
          CASE WHEN person.normalized_display_name = v_target.normalized_display_name
            THEN 'same_normalized_name' END,
          CASE WHEN v_target.date_of_birth IS NOT NULL
            AND person.date_of_birth = v_target.date_of_birth
            THEN 'same_date_of_birth' END
        ]::text[], NULL)) AS signals,
        person.normalized_email,
        person.normalized_display_name,
        person.date_of_birth
      FROM candidate_ids
      INNER JOIN public.people AS person
        ON person.tenant_id = v_tenant_id AND person.id = candidate_ids.candidate_id
      WHERE person.status IN ('active', 'suspended')
        AND (
          EXISTS (
            SELECT 1 FROM public.affiliations AS affiliation
            WHERE affiliation.tenant_id = v_tenant_id
              AND affiliation.person_id = person.id
              AND affiliation.scope_type = 'school'
              AND affiliation.school_id = p_school_id
              AND affiliation.status = 'active'
              AND affiliation.valid_from <= v_now
              AND (affiliation.valid_until IS NULL OR affiliation.valid_until > v_now)
          )
          OR EXISTS (
            SELECT 1 FROM public.school_enrollments AS enrollment
            WHERE enrollment.tenant_id = v_tenant_id
              AND enrollment.person_id = person.id
              AND enrollment.school_id = p_school_id
              AND enrollment.status = 'enrolled'
              AND enrollment.valid_from <= v_now
              AND (enrollment.valid_until IS NULL OR enrollment.valid_until > v_now)
          )
          OR EXISTS (
            SELECT 1
            FROM public.person_relationships AS relationship
            INNER JOIN public.school_enrollments AS learner_enrollment
              ON learner_enrollment.tenant_id = relationship.tenant_id
              AND learner_enrollment.person_id = relationship.related_person_id
            WHERE relationship.tenant_id = v_tenant_id
              AND relationship.subject_person_id = person.id
              AND relationship.type IN ('guardian_of', 'parent_of', 'emergency_contact_of')
              AND relationship.status = 'active'
              AND relationship.valid_from <= v_now
              AND (relationship.valid_until IS NULL OR relationship.valid_until > v_now)
              AND learner_enrollment.school_id = p_school_id
              AND learner_enrollment.status = 'enrolled'
              AND learner_enrollment.valid_from <= v_now
              AND (learner_enrollment.valid_until IS NULL OR learner_enrollment.valid_until > v_now)
          )
        )
    )
    SELECT
      scored.id,
      scored.score,
      scored.signals,
      encode(digest(convert_to(jsonb_build_object(
        'schemaVersion', 1,
        'firstPersonId', LEAST(p_person_id::text, scored.id::text),
        'secondPersonId', GREATEST(p_person_id::text, scored.id::text),
        'signals', scored.signals,
        'matchedEmail', CASE WHEN scored.normalized_email = v_target.normalized_email
          THEN v_target.normalized_email END,
        'matchedName', CASE WHEN scored.normalized_display_name = v_target.normalized_display_name
          THEN v_target.normalized_display_name END,
        'matchedDateOfBirth', CASE WHEN scored.date_of_birth = v_target.date_of_birth
          THEN v_target.date_of_birth END
      )::text, 'UTF8'), 'sha256'), 'hex') AS evidence_hash
    FROM scored
    WHERE scored.score >= 50
      AND jsonb_array_length(scored.signals) >= 2
    ORDER BY scored.score DESC, scored.id
    LIMIT 20
  LOOP
    IF p_person_id::text < v_candidate.id::text THEN
      v_first_person_id := p_person_id;
      v_second_person_id := v_candidate.id;
    ELSE
      v_first_person_id := v_candidate.id;
      v_second_person_id := p_person_id;
    END IF;

    v_case := NULL;
    INSERT INTO public.person_duplicate_cases (
      tenant_id, review_school_id, first_person_id, second_person_id,
      status, current_version, current_score, current_signals, current_evidence_hash,
      created_by_account_id, created_at, updated_at
    ) VALUES (
      v_tenant_id, p_school_id, v_first_person_id, v_second_person_id,
      'open', 1, v_candidate.score, v_candidate.signals, v_candidate.evidence_hash,
      v_account_id, v_now, v_now
    )
    ON CONFLICT (tenant_id, review_school_id, first_person_id, second_person_id) DO NOTHING
    RETURNING * INTO v_case;

    IF v_case.id IS NOT NULL THEN
      INSERT INTO public.person_duplicate_case_events (
        tenant_id, review_school_id, case_id, version, event_type, score,
        signals, evidence_hash, reason, actor_account_id, created_at
      ) VALUES (
        v_tenant_id, p_school_id, v_case.id, 1, 'candidate_detected', v_candidate.score,
        v_candidate.signals, v_candidate.evidence_hash, btrim(p_reason), v_account_id, v_now
      );
    ELSE
      SELECT duplicate_case.* INTO v_case
      FROM public.person_duplicate_cases AS duplicate_case
      WHERE duplicate_case.tenant_id = v_tenant_id
        AND duplicate_case.review_school_id = p_school_id
        AND duplicate_case.first_person_id = v_first_person_id
        AND duplicate_case.second_person_id = v_second_person_id
      FOR UPDATE;

      IF v_case.current_evidence_hash IS DISTINCT FROM v_candidate.evidence_hash
        OR v_case.status = 'superseded'
      THEN
        v_next_version := v_case.current_version + 1;
        v_next_status := CASE
          WHEN v_case.status = 'merge_approval_requested' THEN v_case.status
          ELSE 'open'
        END;
        UPDATE public.person_duplicate_cases AS duplicate_case
        SET status = v_next_status,
          current_version = v_next_version,
          current_score = v_candidate.score,
          current_signals = v_candidate.signals,
          current_evidence_hash = v_candidate.evidence_hash,
          updated_at = v_now
        WHERE duplicate_case.tenant_id = v_tenant_id AND duplicate_case.id = v_case.id;
        INSERT INTO public.person_duplicate_case_events (
          tenant_id, review_school_id, case_id, version, event_type, score,
          signals, evidence_hash, reason, actor_account_id, created_at
        ) VALUES (
          v_tenant_id, p_school_id, v_case.id, v_next_version, 'evidence_refreshed',
          v_candidate.score, v_candidate.signals, v_candidate.evidence_hash,
          btrim(p_reason), v_account_id, v_now
        );
        v_case.status := v_next_status;
        v_case.current_version := v_next_version;
      END IF;
    END IF;

    IF v_case.status IN ('open', 'merge_approval_requested') THEN
      RETURN QUERY SELECT v_case.id, v_candidate.id, v_candidate.score,
        v_candidate.signals, v_case.status;
    END IF;
    v_seen_case_ids := array_append(v_seen_case_ids, v_case.id);
  END LOOP;

  IF cardinality(v_seen_case_ids) < 20 THEN
    FOR v_case IN
      SELECT duplicate_case.*
      FROM public.person_duplicate_cases AS duplicate_case
      WHERE duplicate_case.tenant_id = v_tenant_id
        AND duplicate_case.review_school_id = p_school_id
        AND duplicate_case.status = 'open'
        AND p_person_id IN (duplicate_case.first_person_id, duplicate_case.second_person_id)
        AND NOT (duplicate_case.id = ANY(v_seen_case_ids))
      ORDER BY duplicate_case.id
      FOR UPDATE
    LOOP
      v_next_version := v_case.current_version + 1;
      UPDATE public.person_duplicate_cases AS duplicate_case
      SET status = 'superseded', current_version = v_next_version, updated_at = v_now
      WHERE duplicate_case.tenant_id = v_tenant_id AND duplicate_case.id = v_case.id;
      INSERT INTO public.person_duplicate_case_events (
        tenant_id, review_school_id, case_id, version, event_type, score,
        signals, evidence_hash, reason, actor_account_id, created_at
      ) VALUES (
        v_tenant_id, p_school_id, v_case.id, v_next_version,
        'evidence_no_longer_matches', v_case.current_score, v_case.current_signals,
        v_case.current_evidence_hash, btrim(p_reason), v_account_id, v_now
      );
    END LOOP;
  END IF;
END
$$;
--> statement-breakpoint

CREATE FUNCTION "openschool_private"."review_person_duplicate_case"(
  p_case_id uuid,
  p_expected_version integer,
  p_action text,
  p_reason text
)
RETURNS TABLE (case_id uuid, status text, version integer, occurred_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_case public.person_duplicate_cases%ROWTYPE;
  v_status text;
  v_event_type text;
  v_next_version integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_duplicate_review_manager'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.people_duplicates.review'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR v_tenant_id IS NULL OR v_account_id IS NULL OR p_case_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_action NOT IN ('mark_distinct', 'request_merge_approval')
    OR p_reason IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
  THEN
    RAISE EXCEPTION 'PERSON_DUPLICATE_REVIEW_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT duplicate_case.* INTO v_case
  FROM public.person_duplicate_cases AS duplicate_case
  WHERE duplicate_case.tenant_id = v_tenant_id AND duplicate_case.id = p_case_id
    AND public.openschool_school_scope_allows(
      duplicate_case.tenant_id, duplicate_case.review_school_id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERSON_DUPLICATE_CASE_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF v_case.current_version <> p_expected_version THEN
    RAISE EXCEPTION 'PERSON_DUPLICATE_CASE_CHANGED' USING ERRCODE = '40001';
  END IF;
  IF v_case.status <> 'open' THEN
    RAISE EXCEPTION 'PERSON_DUPLICATE_CASE_NOT_REVIEWABLE' USING ERRCODE = '22023';
  END IF;

  v_status := CASE p_action
    WHEN 'mark_distinct' THEN 'distinct'
    ELSE 'merge_approval_requested'
  END;
  v_event_type := CASE p_action
    WHEN 'mark_distinct' THEN 'marked_distinct'
    ELSE 'merge_approval_requested'
  END;
  v_next_version := v_case.current_version + 1;

  UPDATE public.person_duplicate_cases AS duplicate_case
  SET status = v_status, current_version = v_next_version, updated_at = v_now
  WHERE duplicate_case.tenant_id = v_tenant_id AND duplicate_case.id = p_case_id
    AND duplicate_case.current_version = p_expected_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERSON_DUPLICATE_CASE_CHANGED' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.person_duplicate_case_events (
    tenant_id, review_school_id, case_id, version, event_type, score,
    signals, evidence_hash, reason, actor_account_id, created_at
  ) VALUES (
    v_tenant_id, v_case.review_school_id, p_case_id, v_next_version, v_event_type,
    v_case.current_score, v_case.current_signals, v_case.current_evidence_hash,
    btrim(p_reason), v_account_id, v_now
  );

  RETURN QUERY SELECT p_case_id, v_status, v_next_version, v_now;
END
$$;
--> statement-breakpoint

ALTER FUNCTION "openschool_private"."refresh_person_duplicate_candidates"(uuid, uuid, text)
  OWNER TO "openschool_duplicate_review_manager";
ALTER FUNCTION "openschool_private"."review_person_duplicate_case"(uuid, integer, text, text)
  OWNER TO "openschool_duplicate_review_manager";
REVOKE ALL ON FUNCTION "openschool_private"."refresh_person_duplicate_candidates"(uuid, uuid, text),
  "openschool_private"."review_person_duplicate_case"(uuid, integer, text, text)
  FROM PUBLIC;
GRANT USAGE ON SCHEMA "openschool_private" TO "openschool_runtime";
GRANT EXECUTE ON FUNCTION
  "openschool_private"."refresh_person_duplicate_candidates"(uuid, uuid, text),
  "openschool_private"."review_person_duplicate_case"(uuid, integer, text, text)
  TO "openschool_runtime";
--> statement-breakpoint

REVOKE INSERT, UPDATE, DELETE ON TABLE
  "person_duplicate_cases", "person_duplicate_case_events"
  FROM "openschool_runtime";
GRANT SELECT ON TABLE "person_duplicate_cases", "person_duplicate_case_events"
  TO "openschool_runtime";
--> statement-breakpoint

DO $$
DECLARE unsafe_role boolean;
BEGIN
  SELECT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls
  INTO unsafe_role FROM pg_catalog.pg_roles
  WHERE rolname = 'openschool_duplicate_review_manager';
  IF unsafe_role IS NULL OR unsafe_role THEN
    RAISE EXCEPTION 'Duplicate review manager role attributes are unsafe';
  END IF;
  IF pg_catalog.pg_has_role('openschool_runtime', 'openschool_duplicate_review_manager', 'member')
    OR pg_catalog.pg_has_role('openschool_worker', 'openschool_duplicate_review_manager', 'member')
    OR pg_catalog.pg_has_role('openschool_control_plane', 'openschool_duplicate_review_manager', 'member')
  THEN
    RAISE EXCEPTION 'Execution roles must not assume the duplicate review manager';
  END IF;
END $$;
