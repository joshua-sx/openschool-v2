-- Plan v2 extends the direct-Person inventory with transitive authorization and academic
-- dependencies. The v1 functions remain private implementation details so callers cannot skip
-- finalization or approve an incomplete plan.

GRANT SELECT ON TABLE "role_template_assignments", "enrollments", "grades"
  TO "openschool_person_merge_manager";
--> statement-breakpoint
GRANT SELECT ("id", "status", "membership_version", "security_version", "updated_at")
  ON TABLE "accounts" TO "openschool_person_merge_manager";
--> statement-breakpoint
GRANT SELECT ("id", "account_id", "status", "security_version", "expires_at", "updated_at")
  ON TABLE "account_sessions" TO "openschool_person_merge_manager";
--> statement-breakpoint
CREATE POLICY "role_template_assignments_person_merge_manager_select"
  ON "role_template_assignments"
  AS PERMISSIVE FOR SELECT TO "openschool_person_merge_manager" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_person_merge_manager'
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND nullif(current_setting('app.policy_capability', true), '') IN (
      'tenant.people_merges.preview', 'tenant.people_merges.approve',
      'tenant.people_merges.execute'
    )
  );
--> statement-breakpoint
CREATE POLICY "enrollments_person_merge_manager_select" ON "enrollments"
  AS PERMISSIVE FOR SELECT TO "openschool_person_merge_manager" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_person_merge_manager'
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND nullif(current_setting('app.policy_capability', true), '') IN (
      'tenant.people_merges.preview', 'tenant.people_merges.approve',
      'tenant.people_merges.execute'
    )
  );
--> statement-breakpoint
CREATE POLICY "grades_person_merge_manager_select" ON "grades"
  AS PERMISSIVE FOR SELECT TO "openschool_person_merge_manager" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_person_merge_manager'
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND nullif(current_setting('app.policy_capability', true), '') IN (
      'tenant.people_merges.preview', 'tenant.people_merges.approve',
      'tenant.people_merges.execute'
    )
  );
--> statement-breakpoint
CREATE POLICY "accounts_person_merge_manager_select" ON "accounts"
  AS PERMISSIVE FOR SELECT TO "openschool_person_merge_manager" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_person_merge_manager'
    AND nullif(current_setting('app.policy_capability', true), '') IN (
      'tenant.people_merges.preview', 'tenant.people_merges.approve',
      'tenant.people_merges.execute'
    )
    AND EXISTS (
      SELECT 1 FROM public.account_links AS link
      WHERE link.account_id = accounts.id
        AND link.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND link.person_id = nullif(
          current_setting('app.merge_source_person_id', true), ''
        )::uuid
    )
  );
--> statement-breakpoint
CREATE POLICY "account_sessions_person_merge_manager_select" ON "account_sessions"
  AS PERMISSIVE FOR SELECT TO "openschool_person_merge_manager" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_person_merge_manager'
    AND nullif(current_setting('app.policy_capability', true), '') IN (
      'tenant.people_merges.preview', 'tenant.people_merges.approve',
      'tenant.people_merges.execute'
    )
    AND EXISTS (
      SELECT 1 FROM public.account_links AS link
      WHERE link.account_id = account_sessions.account_id
        AND link.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND link.person_id = nullif(
          current_setting('app.merge_source_person_id', true), ''
        )::uuid
    )
  );
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
    OR (
      OLD.plan_version IS DISTINCT FROM NEW.plan_version
      AND NOT (
        OLD.plan_version = 1 AND NEW.plan_version = 2
        AND OLD.current_version = 1 AND NEW.current_version = 2
        AND OLD.status IN ('blocked', 'pending_approval')
        AND NEW.status IN ('blocked', 'pending_approval')
      )
    )
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
ALTER FUNCTION "openschool_private"."create_person_merge_preview"(
  uuid, integer, uuid, uuid, text
) RENAME TO "create_person_merge_preview_v1";
--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."create_person_merge_preview_v1"(
  uuid, integer, uuid, uuid, text
) FROM PUBLIC, "openschool_runtime";
--> statement-breakpoint
CREATE FUNCTION "openschool_private"."finalize_person_merge_preview_v2"(
  p_operation_id uuid,
  p_expected_preview_digest text
)
RETURNS TABLE (
  operation_id uuid,
  status text,
  dependency_count integer,
  conflict_count integer,
  preview_digest text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
SET timezone = 'UTC'
AS $function$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_operation public.person_merge_operations%ROWTYPE;
  v_dependency_count integer;
  v_conflict_count integer;
  v_status text;
  v_preview_digest text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_person_merge_manager'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.people_merges.preview'
    OR v_tenant_id IS NULL OR v_account_id IS NULL
    OR p_operation_id IS NULL
    OR p_expected_preview_digest IS NULL
    OR p_expected_preview_digest !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'PERSON_MERGE_PLAN_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT operation.* INTO v_operation
  FROM public.person_merge_operations AS operation
  WHERE operation.tenant_id = v_tenant_id AND operation.id = p_operation_id
    AND operation.initiated_by_account_id = v_account_id
    AND public.openschool_school_scope_allows(
      operation.tenant_id, operation.review_school_id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERSON_MERGE_OPERATION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF v_operation.current_version <> 1 OR v_operation.plan_version <> 1
    OR v_operation.preview_digest <> p_expected_preview_digest
    OR v_operation.status NOT IN ('blocked', 'pending_approval')
  THEN
    RAISE EXCEPTION 'PERSON_MERGE_PLAN_CHANGED' USING ERRCODE = '40001';
  END IF;

  PERFORM set_config('app.merge_source_person_id', v_operation.source_person_id::text, true);

  INSERT INTO public.person_merge_preview_items (
    tenant_id, review_school_id, operation_id, category, relation_name, record_key,
    direction, disposition, row_fingerprint, metadata, created_at
  )
  SELECT v_tenant_id, v_operation.review_school_id, p_operation_id,
    'authorization_history', 'role_template_assignments',
    encode(digest(convert_to('role:' || assignment.id::text, 'UTF8'), 'sha256'), 'hex'),
    'source',
    CASE WHEN assignment.status IN ('active', 'suspended')
      THEN 'end_and_recreate' ELSE 'preserve_history' END,
    encode(digest(convert_to(to_jsonb(assignment)::text, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object('kind', 'derived_dependency', 'path', 'affiliation_role'), v_now
  FROM public.role_template_assignments AS assignment
  INNER JOIN public.affiliations AS affiliation
    ON affiliation.tenant_id = assignment.tenant_id
    AND affiliation.id = assignment.affiliation_id
  WHERE affiliation.tenant_id = v_tenant_id
    AND affiliation.person_id = v_operation.source_person_id;

  INSERT INTO public.person_merge_preview_items (
    tenant_id, review_school_id, operation_id, category, relation_name, record_key,
    direction, disposition, row_fingerprint, metadata, created_at
  )
  SELECT v_tenant_id, v_operation.review_school_id, p_operation_id,
    'authorization_history', 'accounts',
    encode(digest(convert_to('account:' || account_row.id::text, 'UTF8'), 'sha256'), 'hex'),
    'source', 'preserve_history',
    encode(digest(convert_to(to_jsonb(account_row)::text, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object('kind', 'derived_dependency', 'path', 'account_invalidation'), v_now
  FROM (
    SELECT DISTINCT account.id, account.status, account.membership_version,
      account.security_version, account.updated_at
    FROM public.accounts AS account
    INNER JOIN public.account_links AS link ON link.account_id = account.id
    WHERE link.tenant_id = v_tenant_id
      AND link.person_id = v_operation.source_person_id
  ) AS account_row;

  INSERT INTO public.person_merge_preview_items (
    tenant_id, review_school_id, operation_id, category, relation_name, record_key,
    direction, disposition, row_fingerprint, metadata, created_at
  )
  SELECT v_tenant_id, v_operation.review_school_id, p_operation_id,
    'authorization_history', 'account_sessions',
    encode(digest(convert_to('session:' || session_row.id::text, 'UTF8'), 'sha256'), 'hex'),
    'source', 'preserve_history',
    encode(digest(convert_to(to_jsonb(session_row)::text, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object('kind', 'derived_dependency', 'path', 'account_session'), v_now
  FROM (
    SELECT DISTINCT session.id, session.account_id, session.status,
      session.security_version, session.expires_at, session.updated_at
    FROM public.account_sessions AS session
    INNER JOIN public.account_links AS link ON link.account_id = session.account_id
    WHERE link.tenant_id = v_tenant_id
      AND link.person_id = v_operation.source_person_id
  ) AS session_row;

  INSERT INTO public.person_merge_preview_items (
    tenant_id, review_school_id, operation_id, category, relation_name, record_key,
    direction, disposition, row_fingerprint, metadata, created_at
  )
  SELECT v_tenant_id, v_operation.review_school_id, p_operation_id,
    'academic_history', 'grades',
    encode(digest(convert_to('grade:' || grade_row.id::text, 'UTF8'), 'sha256'), 'hex'),
    'source', 'preserve_history',
    encode(digest(convert_to(to_jsonb(grade_row)::text, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object('kind', 'derived_dependency', 'path', 'legacy_enrollment_grade'), v_now
  FROM public.people AS person
  INNER JOIN public.enrollments AS enrollment
    ON enrollment.tenant_id = person.tenant_id
    AND enrollment.student_id = person.legacy_student_id
  INNER JOIN public.grades AS grade_row
    ON grade_row.tenant_id = enrollment.tenant_id
    AND grade_row.enrollment_id = enrollment.id
  WHERE person.tenant_id = v_tenant_id
    AND person.id = v_operation.source_person_id;

  -- A current target fact with the same business key requires an explicit field-level decision.
  INSERT INTO public.person_merge_preview_items (
    tenant_id, review_school_id, operation_id, category, relation_name, record_key,
    direction, disposition, conflict_code, row_fingerprint, metadata, created_at
  )
  SELECT DISTINCT v_tenant_id, v_operation.review_school_id, p_operation_id,
    conflict.category, conflict.relation_name,
    encode(digest(convert_to(conflict.conflict_key, 'UTF8'), 'sha256'), 'hex'),
    'none', 'block', conflict.conflict_code,
    encode(digest(convert_to(conflict.conflict_key, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object('kind', 'target_conflict', 'path', conflict.path), v_now
  FROM (
    SELECT 'account_link'::text AS category, 'account_links'::text AS relation_name,
      'TARGET_ACCOUNT_LINK_EXISTS'::text AS conflict_code,
      'account_link'::text AS path,
      'account:' || source.account_id::text AS conflict_key
    FROM public.account_links AS source
    INNER JOIN public.account_links AS target
      ON target.tenant_id = source.tenant_id AND target.account_id = source.account_id
      AND target.person_id = v_operation.target_person_id
      AND target.status IN ('pending', 'active', 'suspended')
    WHERE source.tenant_id = v_tenant_id
      AND source.person_id = v_operation.source_person_id
      AND source.status IN ('pending', 'active', 'suspended')
    UNION ALL
    SELECT 'affiliation', 'affiliations', 'TARGET_AFFILIATION_EXISTS', 'affiliation',
      'affiliation:' || source.id::text
    FROM public.affiliations AS source
    INNER JOIN public.affiliations AS target
      ON target.tenant_id = source.tenant_id AND target.person_id = v_operation.target_person_id
      AND target.kind = source.kind AND target.scope_type = source.scope_type
      AND target.education_organization_id IS NOT DISTINCT FROM source.education_organization_id
      AND target.school_id IS NOT DISTINCT FROM source.school_id
      AND target.class_id IS NOT DISTINCT FROM source.class_id
      AND target.status IN ('active', 'suspended')
    WHERE source.tenant_id = v_tenant_id
      AND source.person_id = v_operation.source_person_id
      AND source.status IN ('active', 'suspended')
    UNION ALL
    SELECT 'household_membership', 'household_memberships',
      'TARGET_HOUSEHOLD_MEMBERSHIP_EXISTS', 'household',
      'household:' || source.household_id::text
    FROM public.household_memberships AS source
    INNER JOIN public.household_memberships AS target
      ON target.tenant_id = source.tenant_id AND target.household_id = source.household_id
      AND target.person_id = v_operation.target_person_id AND target.status = 'active'
    WHERE source.tenant_id = v_tenant_id
      AND source.person_id = v_operation.source_person_id AND source.status = 'active'
    UNION ALL
    SELECT 'relationship', 'person_relationships',
      'TARGET_RELATIONSHIP_EXISTS', 'relationship',
      'relationship:' || source.id::text
    FROM public.person_relationships AS source
    INNER JOIN public.person_relationships AS target
      ON target.tenant_id = source.tenant_id AND target.type = source.type
      AND target.status IN ('active', 'suspended')
      AND (
        (
          source.subject_person_id = v_operation.source_person_id
          AND target.subject_person_id = v_operation.target_person_id
          AND target.related_person_id = source.related_person_id
        )
        OR (
          source.related_person_id = v_operation.source_person_id
          AND target.related_person_id = v_operation.target_person_id
          AND target.subject_person_id = source.subject_person_id
        )
      )
    WHERE source.tenant_id = v_tenant_id
      AND source.status IN ('active', 'suspended')
      AND v_operation.source_person_id IN (
        source.subject_person_id, source.related_person_id
      )
      AND v_operation.target_person_id NOT IN (
        source.subject_person_id, source.related_person_id
      )
    UNION ALL
    SELECT 'school_enrollment', 'school_enrollments',
      'TARGET_SCHOOL_ENROLLMENT_EXISTS', 'school_enrollment',
      'enrollment:' || source.school_id::text || ':' || source.enrollment_type
    FROM public.school_enrollments AS source
    INNER JOIN public.school_enrollments AS target
      ON target.tenant_id = source.tenant_id AND target.school_id = source.school_id
      AND target.person_id = v_operation.target_person_id
      AND target.enrollment_type = source.enrollment_type AND target.status = 'enrolled'
    WHERE source.tenant_id = v_tenant_id
      AND source.person_id = v_operation.source_person_id AND source.status = 'enrolled'
    UNION ALL
    SELECT 'section_staff', 'section_staff_assignments',
      'TARGET_SECTION_STAFF_EXISTS', 'section_staff',
      'staff:' || source.section_id::text || ':' || source.role
    FROM public.section_staff_assignments AS source
    INNER JOIN public.section_staff_assignments AS target
      ON target.tenant_id = source.tenant_id AND target.section_id = source.section_id
      AND target.person_id = v_operation.target_person_id
      AND target.role = source.role AND target.status = 'active'
    WHERE source.tenant_id = v_tenant_id
      AND source.person_id = v_operation.source_person_id AND source.status = 'active'
    UNION ALL
    SELECT 'section_roster', 'section_roster_memberships',
      'TARGET_SECTION_ROSTER_EXISTS', 'section_roster',
      'roster:' || source.section_id::text
    FROM public.section_roster_memberships AS source
    INNER JOIN public.section_roster_memberships AS target
      ON target.tenant_id = source.tenant_id AND target.section_id = source.section_id
      AND target.person_id = v_operation.target_person_id AND target.status = 'active'
    WHERE source.tenant_id = v_tenant_id
      AND source.person_id = v_operation.source_person_id AND source.status = 'active'
  ) AS conflict;

  SELECT count(*)::integer,
    count(*) FILTER (WHERE item.disposition = 'block')::integer
  INTO v_dependency_count, v_conflict_count
  FROM public.person_merge_preview_items AS item
  WHERE item.tenant_id = v_tenant_id AND item.operation_id = p_operation_id;
  v_status := CASE WHEN v_conflict_count = 0 THEN 'pending_approval' ELSE 'blocked' END;

  SELECT encode(
    digest(
      convert_to(
        'plan:2:' || v_operation.duplicate_evidence_hash || ':' ||
        v_operation.source_person_id::text || ':' || v_operation.target_person_id::text || ':' ||
        coalesce(string_agg(
          item.relation_name || ':' || item.record_key || ':' || item.direction || ':' ||
          item.disposition || ':' || coalesce(item.conflict_code, '') || ':' ||
          item.row_fingerprint,
          '|' ORDER BY item.relation_name, item.record_key, item.direction
        ), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) INTO v_preview_digest
  FROM public.person_merge_preview_items AS item
  WHERE item.tenant_id = v_tenant_id AND item.operation_id = p_operation_id;

  UPDATE public.person_merge_operations AS operation
  SET plan_version = 2, current_version = 2, status = v_status,
    dependency_count = v_dependency_count, conflict_count = v_conflict_count,
    preview_digest = v_preview_digest, updated_at = v_now
  WHERE operation.tenant_id = v_tenant_id AND operation.id = p_operation_id
    AND operation.current_version = 1 AND operation.plan_version = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERSON_MERGE_PLAN_CHANGED' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.person_merge_events (
    tenant_id, review_school_id, operation_id, version, event_type, operation_status,
    preview_digest, reason, actor_account_id, created_at
  ) VALUES (
    v_tenant_id, v_operation.review_school_id, p_operation_id, 2,
    'preview_created', v_status, v_preview_digest,
    'Finalized dependency-complete merge plan version 2', v_account_id, v_now
  );

  RETURN QUERY SELECT p_operation_id, v_status, v_dependency_count,
    v_conflict_count, v_preview_digest, v_now;
END
$function$;
--> statement-breakpoint
ALTER FUNCTION "openschool_private"."finalize_person_merge_preview_v2"(uuid, text)
  OWNER TO "openschool_person_merge_manager";
--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."finalize_person_merge_preview_v2"(uuid, text)
  FROM PUBLIC, "openschool_runtime";
--> statement-breakpoint
CREATE FUNCTION "openschool_private"."create_person_merge_preview"(
  p_case_id uuid,
  p_expected_case_version integer,
  p_source_person_id uuid,
  p_target_person_id uuid,
  p_reason text
)
RETURNS TABLE (
  operation_id uuid,
  status text,
  dependency_count integer,
  conflict_count integer,
  preview_digest text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, openschool_private
SET timezone = 'UTC'
AS $function$
DECLARE
  v_preview record;
BEGIN
  SELECT * INTO v_preview
  FROM openschool_private.create_person_merge_preview_v1(
    p_case_id, p_expected_case_version, p_source_person_id, p_target_person_id, p_reason
  );
  RETURN QUERY
  SELECT * FROM openschool_private.finalize_person_merge_preview_v2(
    v_preview.operation_id, v_preview.preview_digest
  );
END
$function$;
--> statement-breakpoint
ALTER FUNCTION "openschool_private"."create_person_merge_preview"(
  uuid, integer, uuid, uuid, text
) OWNER TO "openschool_person_merge_manager";
--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."create_person_merge_preview"(
  uuid, integer, uuid, uuid, text
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."create_person_merge_preview"(
  uuid, integer, uuid, uuid, text
) TO "openschool_runtime";
--> statement-breakpoint
CREATE FUNCTION "openschool_private"."assert_person_merge_plan_v2_current"(
  p_operation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
SET timezone = 'UTC'
AS $function$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_operation public.person_merge_operations%ROWTYPE;
  v_item record;
  v_item_current boolean;
  v_preview_count integer;
  v_current_count integer;
  v_target_conflict boolean;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_person_merge_manager'
    OR nullif(current_setting('app.policy_capability', true), '') NOT IN (
      'tenant.people_merges.approve', 'tenant.people_merges.execute'
    )
    OR v_tenant_id IS NULL OR p_operation_id IS NULL
  THEN
    RAISE EXCEPTION 'PERSON_MERGE_PLAN_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT operation.* INTO v_operation
  FROM public.person_merge_operations AS operation
  WHERE operation.tenant_id = v_tenant_id AND operation.id = p_operation_id
    AND operation.plan_version = 2
    AND public.openschool_school_scope_allows(
      operation.tenant_id, operation.review_school_id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERSON_MERGE_PLAN_VERSION_UNSUPPORTED' USING ERRCODE = '40001';
  END IF;
  PERFORM set_config('app.merge_source_person_id', v_operation.source_person_id::text, true);

  FOR v_item IN
    SELECT item.relation_name, item.row_fingerprint
    FROM public.person_merge_preview_items AS item
    WHERE item.tenant_id = v_tenant_id AND item.operation_id = p_operation_id
      AND item.metadata->>'kind' = 'derived_dependency'
    ORDER BY item.relation_name, item.record_key
  LOOP
    v_item_current := false;
    CASE v_item.relation_name
      WHEN 'role_template_assignments' THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.role_template_assignments AS assignment
          INNER JOIN public.affiliations AS affiliation
            ON affiliation.tenant_id = assignment.tenant_id
            AND affiliation.id = assignment.affiliation_id
          WHERE affiliation.tenant_id = v_tenant_id
            AND affiliation.person_id = v_operation.source_person_id
            AND encode(
              digest(convert_to(to_jsonb(assignment)::text, 'UTF8'), 'sha256'), 'hex'
            ) = v_item.row_fingerprint
        ) INTO v_item_current;
      WHEN 'accounts' THEN
        SELECT EXISTS (
          SELECT 1
          FROM (
            SELECT DISTINCT account.id, account.status, account.membership_version,
              account.security_version, account.updated_at
            FROM public.accounts AS account
            INNER JOIN public.account_links AS link ON link.account_id = account.id
            WHERE link.tenant_id = v_tenant_id
              AND link.person_id = v_operation.source_person_id
          ) AS account_row
          WHERE encode(
            digest(convert_to(to_jsonb(account_row)::text, 'UTF8'), 'sha256'), 'hex'
          ) = v_item.row_fingerprint
        ) INTO v_item_current;
      WHEN 'account_sessions' THEN
        SELECT EXISTS (
          SELECT 1
          FROM (
            SELECT DISTINCT session.id, session.account_id, session.status,
              session.security_version, session.expires_at, session.updated_at
            FROM public.account_sessions AS session
            INNER JOIN public.account_links AS link ON link.account_id = session.account_id
            WHERE link.tenant_id = v_tenant_id
              AND link.person_id = v_operation.source_person_id
          ) AS session_row
          WHERE encode(
            digest(convert_to(to_jsonb(session_row)::text, 'UTF8'), 'sha256'), 'hex'
          ) = v_item.row_fingerprint
        ) INTO v_item_current;
      WHEN 'grades' THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.people AS person
          INNER JOIN public.enrollments AS enrollment
            ON enrollment.tenant_id = person.tenant_id
            AND enrollment.student_id = person.legacy_student_id
          INNER JOIN public.grades AS grade_row
            ON grade_row.tenant_id = enrollment.tenant_id
            AND grade_row.enrollment_id = enrollment.id
          WHERE person.tenant_id = v_tenant_id
            AND person.id = v_operation.source_person_id
            AND encode(
              digest(convert_to(to_jsonb(grade_row)::text, 'UTF8'), 'sha256'), 'hex'
            ) = v_item.row_fingerprint
        ) INTO v_item_current;
      ELSE
        RAISE EXCEPTION 'PERSON_MERGE_DERIVED_DEPENDENCY_UNREVIEWED'
          USING ERRCODE = '22023';
    END CASE;
    IF NOT v_item_current THEN
      RAISE EXCEPTION 'PERSON_MERGE_DERIVED_DEPENDENCY_CHANGED'
        USING ERRCODE = '40001';
    END IF;
  END LOOP;

  SELECT count(*)::integer INTO v_preview_count
  FROM public.person_merge_preview_items AS item
  WHERE item.tenant_id = v_tenant_id AND item.operation_id = p_operation_id
    AND item.metadata->>'kind' = 'derived_dependency';
  SELECT
    (SELECT count(*) FROM public.role_template_assignments AS assignment
      INNER JOIN public.affiliations AS affiliation
        ON affiliation.tenant_id = assignment.tenant_id
        AND affiliation.id = assignment.affiliation_id
      WHERE affiliation.tenant_id = v_tenant_id
        AND affiliation.person_id = v_operation.source_person_id)
    + (SELECT count(DISTINCT account.id) FROM public.accounts AS account
      INNER JOIN public.account_links AS link ON link.account_id = account.id
      WHERE link.tenant_id = v_tenant_id
        AND link.person_id = v_operation.source_person_id)
    + (SELECT count(DISTINCT session.id) FROM public.account_sessions AS session
      INNER JOIN public.account_links AS link ON link.account_id = session.account_id
      WHERE link.tenant_id = v_tenant_id
        AND link.person_id = v_operation.source_person_id)
    + (SELECT count(*) FROM public.people AS person
      INNER JOIN public.enrollments AS enrollment
        ON enrollment.tenant_id = person.tenant_id
        AND enrollment.student_id = person.legacy_student_id
      INNER JOIN public.grades AS grade_row
        ON grade_row.tenant_id = enrollment.tenant_id
        AND grade_row.enrollment_id = enrollment.id
      WHERE person.tenant_id = v_tenant_id
        AND person.id = v_operation.source_person_id)
  INTO v_current_count;
  IF v_current_count <> v_preview_count THEN
    RAISE EXCEPTION 'PERSON_MERGE_DERIVED_DEPENDENCY_SET_CHANGED'
      USING ERRCODE = '40001';
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM public.account_links AS source
      INNER JOIN public.account_links AS target
        ON target.tenant_id = source.tenant_id AND target.account_id = source.account_id
        AND target.person_id = v_operation.target_person_id
        AND target.status IN ('pending', 'active', 'suspended')
      WHERE source.tenant_id = v_tenant_id
        AND source.person_id = v_operation.source_person_id
        AND source.status IN ('pending', 'active', 'suspended')
    ) OR EXISTS (
      SELECT 1 FROM public.affiliations AS source
      INNER JOIN public.affiliations AS target
        ON target.tenant_id = source.tenant_id AND target.person_id = v_operation.target_person_id
        AND target.kind = source.kind AND target.scope_type = source.scope_type
        AND target.education_organization_id IS NOT DISTINCT FROM source.education_organization_id
        AND target.school_id IS NOT DISTINCT FROM source.school_id
        AND target.class_id IS NOT DISTINCT FROM source.class_id
        AND target.status IN ('active', 'suspended')
      WHERE source.tenant_id = v_tenant_id
        AND source.person_id = v_operation.source_person_id
        AND source.status IN ('active', 'suspended')
    ) OR EXISTS (
      SELECT 1 FROM public.household_memberships AS source
      INNER JOIN public.household_memberships AS target
        ON target.tenant_id = source.tenant_id AND target.household_id = source.household_id
        AND target.person_id = v_operation.target_person_id AND target.status = 'active'
      WHERE source.tenant_id = v_tenant_id
        AND source.person_id = v_operation.source_person_id AND source.status = 'active'
    ) OR EXISTS (
      SELECT 1 FROM public.school_enrollments AS source
      INNER JOIN public.school_enrollments AS target
        ON target.tenant_id = source.tenant_id AND target.school_id = source.school_id
        AND target.person_id = v_operation.target_person_id
        AND target.enrollment_type = source.enrollment_type AND target.status = 'enrolled'
      WHERE source.tenant_id = v_tenant_id
        AND source.person_id = v_operation.source_person_id AND source.status = 'enrolled'
    ) OR EXISTS (
      SELECT 1 FROM public.section_staff_assignments AS source
      INNER JOIN public.section_staff_assignments AS target
        ON target.tenant_id = source.tenant_id AND target.section_id = source.section_id
        AND target.person_id = v_operation.target_person_id
        AND target.role = source.role AND target.status = 'active'
      WHERE source.tenant_id = v_tenant_id
        AND source.person_id = v_operation.source_person_id AND source.status = 'active'
    ) OR EXISTS (
      SELECT 1 FROM public.section_roster_memberships AS source
      INNER JOIN public.section_roster_memberships AS target
        ON target.tenant_id = source.tenant_id AND target.section_id = source.section_id
        AND target.person_id = v_operation.target_person_id AND target.status = 'active'
      WHERE source.tenant_id = v_tenant_id
        AND source.person_id = v_operation.source_person_id AND source.status = 'active'
    )
  INTO v_target_conflict;
  IF v_target_conflict THEN
    RAISE EXCEPTION 'PERSON_MERGE_TARGET_CONFLICT_CHANGED' USING ERRCODE = '40001';
  END IF;
END
$function$;
--> statement-breakpoint
ALTER FUNCTION "openschool_private"."assert_person_merge_plan_v2_current"(uuid)
  OWNER TO "openschool_person_merge_manager";
--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."assert_person_merge_plan_v2_current"(uuid)
  FROM PUBLIC, "openschool_runtime";
--> statement-breakpoint
ALTER FUNCTION "openschool_private"."approve_person_merge_preview"(
  uuid, integer, text, text
) RENAME TO "approve_person_merge_preview_v1";
--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."approve_person_merge_preview_v1"(
  uuid, integer, text, text
) FROM PUBLIC, "openschool_runtime";
--> statement-breakpoint
CREATE FUNCTION "openschool_private"."approve_person_merge_preview"(
  p_operation_id uuid,
  p_expected_operation_version integer,
  p_expected_preview_digest text,
  p_reason text
)
RETURNS TABLE (
  operation_id uuid,
  status text,
  version integer,
  preview_digest text,
  approved_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, openschool_private
SET timezone = 'UTC'
AS $function$
DECLARE
  v_approval record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.person_merge_operations AS operation
    WHERE operation.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
      AND operation.id = p_operation_id
      AND operation.plan_version = 2
  ) THEN
    RAISE EXCEPTION 'PERSON_MERGE_PLAN_VERSION_UNSUPPORTED' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_approval
  FROM openschool_private.approve_person_merge_preview_v1(
    p_operation_id, p_expected_operation_version, p_expected_preview_digest, p_reason
  );
  PERFORM openschool_private.assert_person_merge_plan_v2_current(p_operation_id);
  RETURN QUERY SELECT v_approval.operation_id, v_approval.status, v_approval.version,
    v_approval.preview_digest, v_approval.approved_at;
END
$function$;
--> statement-breakpoint
ALTER FUNCTION "openschool_private"."approve_person_merge_preview"(
  uuid, integer, text, text
) OWNER TO "openschool_person_merge_manager";
--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."approve_person_merge_preview"(
  uuid, integer, text, text
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."approve_person_merge_preview"(
  uuid, integer, text, text
) TO "openschool_runtime";
--> statement-breakpoint
DO $verification$
BEGIN
  IF has_function_privilege(
    'openschool_runtime',
    'openschool_private.create_person_merge_preview_v1(uuid,integer,uuid,uuid,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'openschool_runtime',
    'openschool_private.finalize_person_merge_preview_v2(uuid,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'openschool_runtime',
    'openschool_private.approve_person_merge_preview_v1(uuid,integer,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'openschool_runtime',
    'openschool_private.assert_person_merge_plan_v2_current(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Person merge plan v2 implementation helpers are exposed';
  END IF;
END
$verification$;
