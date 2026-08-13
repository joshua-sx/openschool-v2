-- Person merge preview is intentionally separate from execution. It inventories every direct
-- Person foreign key and blocks references whose disposition has not been reviewed.

GRANT USAGE ON SCHEMA "public", "openschool_private"
  TO "openschool_person_merge_manager";
--> statement-breakpoint
DO $policies$
DECLARE
  v_relation record;
  v_policy_name text;
BEGIN
  FOR v_relation IN
    SELECT DISTINCT child.oid, child.relname
    FROM pg_constraint AS constraint_row
    INNER JOIN pg_class AS child ON child.oid = constraint_row.conrelid
    INNER JOIN pg_namespace AS child_namespace ON child_namespace.oid = child.relnamespace
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.people'::regclass
      AND child_namespace.nspname = 'public'
      AND child.relname NOT IN (
        'person_merge_operations', 'person_merge_preview_items', 'person_merge_events'
      )
  LOOP
    v_policy_name := left(v_relation.relname || '_person_merge_manager_select', 63);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_relation.relname
        AND policyname = v_policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO openschool_person_merge_manager USING (session_user = ''openschool_runtime'' AND current_user = ''openschool_person_merge_manager'' AND tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid AND nullif(current_setting(''app.policy_capability'', true), '''') IN (''tenant.people_merges.preview'', ''tenant.people_merges.approve''))',
        v_policy_name,
        v_relation.relname
      );
    END IF;
    EXECUTE format(
      'GRANT SELECT ON TABLE public.%I TO openschool_person_merge_manager',
      v_relation.relname
    );
  END LOOP;
END
$policies$;
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
SET search_path = pg_catalog, extensions, public
SET timezone = 'UTC'
AS $function$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_reauthenticated_at timestamptz :=
    nullif(current_setting('app.reauthenticated_at', true), '')::timestamptz;
  v_case public.person_duplicate_cases%ROWTYPE;
  v_person_count integer;
  v_relation record;
  v_category text;
  v_disposition text;
  v_conflict_code text;
  v_direction text;
  v_operation_id uuid := gen_random_uuid();
  v_status text;
  v_dependency_count integer;
  v_conflict_count integer;
  v_preview_digest text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_person_merge_manager'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.people_merges.preview'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR v_tenant_id IS NULL OR v_account_id IS NULL OR v_reauthenticated_at IS NULL
    OR v_reauthenticated_at < statement_timestamp() - interval '15 minutes'
    OR v_reauthenticated_at > statement_timestamp() + interval '1 minute'
    OR p_case_id IS NULL OR p_expected_case_version IS NULL
    OR p_expected_case_version < 1
    OR p_source_person_id IS NULL OR p_target_person_id IS NULL
    OR p_source_person_id = p_target_person_id
    OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
  THEN
    RAISE EXCEPTION 'PERSON_MERGE_PREVIEW_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_tenant_id::text || ':' || least(p_source_person_id, p_target_person_id)::text || ':' ||
      greatest(p_source_person_id, p_target_person_id)::text,
      0
    )
  );

  SELECT duplicate_case.* INTO v_case
  FROM public.person_duplicate_cases AS duplicate_case
  WHERE duplicate_case.tenant_id = v_tenant_id AND duplicate_case.id = p_case_id
    AND public.openschool_school_scope_allows(
      duplicate_case.tenant_id, duplicate_case.review_school_id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERSON_MERGE_CASE_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF v_case.current_version <> p_expected_case_version
    OR v_case.status <> 'merge_approval_requested'
  THEN
    RAISE EXCEPTION 'PERSON_MERGE_CASE_CHANGED' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (v_case.first_person_id = p_source_person_id AND v_case.second_person_id = p_target_person_id)
    OR
    (v_case.first_person_id = p_target_person_id AND v_case.second_person_id = p_source_person_id)
  ) THEN
    RAISE EXCEPTION 'PERSON_MERGE_CASE_PAIR_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_person_count
  FROM (
    SELECT person.id
    FROM public.people AS person
    WHERE person.tenant_id = v_tenant_id
      AND person.id IN (p_source_person_id, p_target_person_id)
      AND person.status IN ('active', 'suspended')
    ORDER BY person.id
    FOR UPDATE
  ) AS locked_people;
  IF v_person_count <> 2 THEN
    RAISE EXCEPTION 'PERSON_MERGE_PERSON_INVALID' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.person_merge_operations (
    id, tenant_id, review_school_id, duplicate_case_id, duplicate_case_version,
    duplicate_evidence_hash, source_person_id, target_person_id, status, current_version,
    preview_digest, dependency_count, conflict_count, initiated_by_account_id,
    initiation_reason, created_at, updated_at
  ) VALUES (
    v_operation_id, v_tenant_id, v_case.review_school_id, v_case.id,
    v_case.current_version, v_case.current_evidence_hash, p_source_person_id,
    p_target_person_id, 'blocked', 1, repeat('0', 64), 0, 0, v_account_id,
    btrim(p_reason), v_now, v_now
  );

  FOR v_relation IN
    SELECT child.relname AS relation_name, source_column.attname AS column_name
    FROM pg_constraint AS constraint_row
    INNER JOIN pg_class AS child ON child.oid = constraint_row.conrelid
    INNER JOIN pg_namespace AS child_namespace ON child_namespace.oid = child.relnamespace
    INNER JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY
      AS source_key(attnum, position) ON true
    INNER JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY
      AS target_key(attnum, position) ON target_key.position = source_key.position
    INNER JOIN pg_attribute AS source_column
      ON source_column.attrelid = child.oid AND source_column.attnum = source_key.attnum
    INNER JOIN pg_attribute AS target_column
      ON target_column.attrelid = constraint_row.confrelid
      AND target_column.attnum = target_key.attnum
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.people'::regclass
      AND child_namespace.nspname = 'public'
      AND target_column.attname = 'id'
      AND child.relname NOT IN (
        'person_merge_operations', 'person_merge_preview_items', 'person_merge_events'
      )
    ORDER BY child.relname, source_column.attname
  LOOP
    v_category := CASE
      WHEN v_relation.relation_name = 'account_links' THEN 'account_link'
      WHEN v_relation.relation_name IN (
        'contact_profiles', 'student_profiles', 'guardian_profiles',
        'employee_profiles', 'teacher_profiles'
      ) THEN 'profile'
      WHEN v_relation.relation_name = 'affiliations' THEN 'affiliation'
      WHEN v_relation.relation_name = 'person_relationships' THEN 'relationship'
      WHEN v_relation.relation_name = 'household_memberships' THEN 'household_membership'
      WHEN v_relation.relation_name = 'school_enrollments' THEN 'school_enrollment'
      WHEN v_relation.relation_name = 'section_staff_assignments' THEN 'section_staff'
      WHEN v_relation.relation_name = 'section_roster_memberships' THEN 'section_roster'
      WHEN v_relation.relation_name = 'account_invitations' THEN 'invitation'
      WHEN v_relation.relation_name IN (
        'role_template_assignments', 'account_sessions', 'platform_access_grants',
        'support_access_grants'
      ) THEN 'authorization_history'
      WHEN v_relation.relation_name IN (
        'school_enrollment_transition_events', 'grades'
      ) THEN 'academic_history'
      WHEN v_relation.relation_name IN (
        'person_duplicate_cases', 'person_duplicate_case_events'
      ) THEN 'duplicate_case'
      WHEN v_relation.relation_name IN ('audit_events', 'identity_migration_events')
        THEN 'audit_history'
      WHEN v_relation.relation_name LIKE '%compatibility_evidence'
        OR v_relation.relation_name = 'person_merge_evidence'
        THEN 'compatibility_evidence'
      ELSE 'compatibility_evidence'
    END;
    v_disposition := CASE
      WHEN v_relation.relation_name IN (
        'account_links', 'contact_profiles', 'student_profiles', 'guardian_profiles',
        'employee_profiles', 'teacher_profiles', 'affiliations', 'person_relationships',
        'household_memberships', 'school_enrollments', 'section_staff_assignments',
        'section_roster_memberships', 'account_invitations'
      ) THEN 'end_and_recreate'
      WHEN v_relation.relation_name IN (
        'role_template_assignments', 'school_enrollment_transition_events', 'grades',
        'person_duplicate_cases', 'person_duplicate_case_events', 'audit_events',
        'identity_migration_events', 'student_compatibility_evidence',
        'academic_compatibility_evidence', 'section_compatibility_evidence',
        'person_merge_evidence'
      ) THEN 'preserve_history'
      ELSE 'block'
    END;
    v_conflict_code := CASE WHEN v_disposition = 'block'
      THEN 'UNREVIEWED_PERSON_REFERENCE' ELSE NULL END;
    v_direction := CASE v_relation.column_name
      WHEN 'source_person_id' THEN 'source'
      WHEN 'subject_person_id' THEN 'subject'
      WHEN 'related_person_id' THEN 'related'
      WHEN 'actor_person_id' THEN 'actor'
      ELSE 'none'
    END;

    EXECUTE format(
      'INSERT INTO public.person_merge_preview_items (tenant_id, review_school_id, operation_id, category, relation_name, record_key, direction, disposition, conflict_code, row_fingerprint, metadata, created_at) SELECT $1, $2, $3, $4, %L, encode(digest(convert_to(to_jsonb(source_row)::text, ''UTF8''), ''sha256''), ''hex''), $5, $6, $7, encode(digest(convert_to(to_jsonb(source_row)::text, ''UTF8''), ''sha256''), ''hex''), jsonb_build_object(''column'', %L), $8 FROM public.%I AS source_row WHERE source_row.tenant_id = $1 AND source_row.%I = $9',
      v_relation.relation_name,
      v_relation.column_name,
      v_relation.relation_name,
      v_relation.column_name
    ) USING v_tenant_id, v_case.review_school_id, v_operation_id, v_category,
      v_direction, v_disposition, v_conflict_code, v_now, p_source_person_id;
  END LOOP;

  -- Singleton profiles cannot be combined without an explicit field-level decision.
  INSERT INTO public.person_merge_preview_items (
    tenant_id, review_school_id, operation_id, category, relation_name, record_key,
    direction, disposition, conflict_code, row_fingerprint, metadata, created_at
  )
  SELECT v_tenant_id, v_case.review_school_id, v_operation_id, 'profile', profile_relation,
    encode(digest(convert_to('conflict:' || profile_relation, 'UTF8'), 'sha256'), 'hex'),
    'none', 'block', 'TARGET_PROFILE_EXISTS',
    encode(digest(convert_to('conflict:' || profile_relation, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object('kind', 'target_conflict'), v_now
  FROM unnest(ARRAY[
    'contact_profiles', 'student_profiles', 'guardian_profiles',
    'employee_profiles', 'teacher_profiles'
  ]) AS profile_relation
  WHERE CASE profile_relation
    WHEN 'contact_profiles' THEN
      EXISTS (SELECT 1 FROM public.contact_profiles WHERE tenant_id = v_tenant_id AND person_id = p_source_person_id)
      AND EXISTS (SELECT 1 FROM public.contact_profiles WHERE tenant_id = v_tenant_id AND person_id = p_target_person_id)
    WHEN 'student_profiles' THEN
      EXISTS (SELECT 1 FROM public.student_profiles WHERE tenant_id = v_tenant_id AND person_id = p_source_person_id)
      AND EXISTS (SELECT 1 FROM public.student_profiles WHERE tenant_id = v_tenant_id AND person_id = p_target_person_id)
    WHEN 'guardian_profiles' THEN
      EXISTS (SELECT 1 FROM public.guardian_profiles WHERE tenant_id = v_tenant_id AND person_id = p_source_person_id)
      AND EXISTS (SELECT 1 FROM public.guardian_profiles WHERE tenant_id = v_tenant_id AND person_id = p_target_person_id)
    WHEN 'employee_profiles' THEN
      EXISTS (SELECT 1 FROM public.employee_profiles WHERE tenant_id = v_tenant_id AND person_id = p_source_person_id)
      AND EXISTS (SELECT 1 FROM public.employee_profiles WHERE tenant_id = v_tenant_id AND person_id = p_target_person_id)
    WHEN 'teacher_profiles' THEN
      EXISTS (SELECT 1 FROM public.teacher_profiles WHERE tenant_id = v_tenant_id AND person_id = p_source_person_id)
      AND EXISTS (SELECT 1 FROM public.teacher_profiles WHERE tenant_id = v_tenant_id AND person_id = p_target_person_id)
    ELSE false
  END;

  -- A relationship between the two People would collapse into a self-relationship.
  INSERT INTO public.person_merge_preview_items (
    tenant_id, review_school_id, operation_id, category, relation_name, record_key,
    direction, disposition, conflict_code, row_fingerprint, metadata, created_at
  )
  SELECT v_tenant_id, v_case.review_school_id, v_operation_id, 'relationship',
    'person_relationships',
    encode(digest(convert_to('self:' || relationship.id::text, 'UTF8'), 'sha256'), 'hex'),
    'none', 'block', 'SELF_RELATIONSHIP',
    encode(digest(convert_to(to_jsonb(relationship)::text, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object('kind', 'target_conflict'), v_now
  FROM public.person_relationships AS relationship
  WHERE relationship.tenant_id = v_tenant_id
    AND relationship.subject_person_id IN (p_source_person_id, p_target_person_id)
    AND relationship.related_person_id IN (p_source_person_id, p_target_person_id);

  SELECT count(*)::integer,
    count(*) FILTER (WHERE item.disposition = 'block')::integer
  INTO v_dependency_count, v_conflict_count
  FROM public.person_merge_preview_items AS item
  WHERE item.tenant_id = v_tenant_id AND item.operation_id = v_operation_id;
  v_status := CASE WHEN v_conflict_count = 0 THEN 'pending_approval' ELSE 'blocked' END;

  SELECT encode(
    digest(
      convert_to(
        v_case.current_evidence_hash || ':' || p_source_person_id::text || ':' ||
        p_target_person_id::text || ':' || coalesce(string_agg(
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
  WHERE item.tenant_id = v_tenant_id AND item.operation_id = v_operation_id;

  UPDATE public.person_merge_operations AS operation
  SET status = v_status, dependency_count = v_dependency_count,
    conflict_count = v_conflict_count, preview_digest = v_preview_digest, updated_at = v_now
  WHERE operation.tenant_id = v_tenant_id AND operation.id = v_operation_id;

  INSERT INTO public.person_merge_events (
    tenant_id, review_school_id, operation_id, version, event_type, operation_status,
    preview_digest, reason, actor_account_id, created_at
  ) VALUES (
    v_tenant_id, v_case.review_school_id, v_operation_id, 1, 'preview_created',
    v_status, v_preview_digest, btrim(p_reason), v_account_id, v_now
  );

  RETURN QUERY SELECT v_operation_id, v_status, v_dependency_count,
    v_conflict_count, v_preview_digest, v_now;
END
$function$;
--> statement-breakpoint
ALTER FUNCTION "openschool_private"."create_person_merge_preview"(uuid, integer, uuid, uuid, text)
  OWNER TO "openschool_person_merge_manager";
--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."create_person_merge_preview"(uuid, integer, uuid, uuid, text)
  FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "openschool_private" TO "openschool_runtime";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."create_person_merge_preview"(uuid, integer, uuid, uuid, text)
  TO "openschool_runtime";
