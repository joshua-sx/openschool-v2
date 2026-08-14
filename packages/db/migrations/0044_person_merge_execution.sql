ALTER TABLE "person_duplicate_case_events" DROP CONSTRAINT "person_duplicate_case_events_type_check";--> statement-breakpoint
ALTER TABLE "person_duplicate_case_events" ADD CONSTRAINT "person_duplicate_case_events_type_check" CHECK ("person_duplicate_case_events"."event_type" IN ('candidate_detected', 'evidence_refreshed', 'evidence_no_longer_matches', 'marked_distinct', 'merge_approval_requested', 'merge_executed'));
--> statement-breakpoint
-- Execution is deliberately owned by the existing NOLOGIN merge manager. The runtime may call
-- only the reviewed entry point; it never inherits the manager or receives table write grants.
GRANT UPDATE ON TABLE "accounts", "account_sessions"
  TO "openschool_person_merge_manager";
--> statement-breakpoint
GRANT INSERT ON TABLE "person_duplicate_case_events", "audit_events", "audit_outbox"
  TO "openschool_person_merge_manager";
--> statement-breakpoint
ALTER POLICY "people_person_merge_manager_select" ON "people" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.preview', 'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )
);
--> statement-breakpoint
ALTER POLICY "people_person_merge_manager_lock" ON "people" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.preview', 'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    = 'tenant.people_merges.execute'
);
--> statement-breakpoint
ALTER POLICY "person_duplicate_cases_person_merge_manager_lock"
  ON "person_duplicate_cases" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_person_merge_manager'
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND nullif(current_setting('app.policy_capability', true), '') IN (
      'tenant.people_merges.preview', 'tenant.people_merges.approve',
      'tenant.people_merges.execute'
    )
    AND public.openschool_school_scope_allows(tenant_id, review_school_id)
  ) WITH CHECK (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_person_merge_manager'
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND nullif(current_setting('app.policy_capability', true), '')
      = 'tenant.people_merges.execute'
    AND public.openschool_school_scope_allows(tenant_id, review_school_id)
  );
--> statement-breakpoint
CREATE POLICY "person_duplicate_case_events_person_merge_manager_insert"
  ON "person_duplicate_case_events" AS PERMISSIVE FOR INSERT
  TO "openschool_person_merge_manager" WITH CHECK (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_person_merge_manager'
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND event_type = 'merge_executed'
    AND actor_account_id = nullif(current_setting('app.account_id', true), '')::uuid
    AND public.openschool_school_scope_allows(tenant_id, review_school_id)
  );
--> statement-breakpoint
CREATE POLICY "accounts_person_merge_manager_update" ON "accounts"
  AS PERMISSIVE FOR UPDATE TO "openschool_person_merge_manager" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_person_merge_manager'
    AND nullif(current_setting('app.policy_capability', true), '')
      = 'tenant.people_merges.execute'
    AND EXISTS (
      SELECT 1 FROM public.account_links AS link
      WHERE link.account_id = accounts.id
        AND link.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND link.person_id = nullif(
          current_setting('app.merge_source_person_id', true), ''
        )::uuid
    )
  ) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "account_sessions_person_merge_manager_update" ON "account_sessions"
  AS PERMISSIVE FOR UPDATE TO "openschool_person_merge_manager" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_person_merge_manager'
    AND nullif(current_setting('app.policy_capability', true), '')
      = 'tenant.people_merges.execute'
    AND EXISTS (
      SELECT 1 FROM public.account_links AS link
      WHERE link.account_id = account_sessions.account_id
        AND link.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND link.person_id = nullif(
          current_setting('app.merge_source_person_id', true), ''
        )::uuid
    )
  ) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "audit_events_person_merge_manager_insert" ON "audit_events"
  AS PERMISSIVE FOR INSERT TO "openschool_person_merge_manager" WITH CHECK (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_person_merge_manager'
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND actor_type = 'account'
    AND actor_account_id = nullif(current_setting('app.account_id', true), '')::uuid
    AND actor_person_id = nullif(current_setting('app.person_id', true), '')::uuid
    AND request_id = nullif(current_setting('app.request_id', true), '')
    AND correlation_id = nullif(current_setting('app.correlation_id', true), '')
    AND capability = 'tenant.people_merges.execute'
    AND event_type = 'person.merge.execute'
    AND target_type = 'person_merge_operation'
    AND source = 'web'
  );
--> statement-breakpoint
CREATE POLICY "audit_outbox_person_merge_manager_insert" ON "audit_outbox"
  AS PERMISSIVE FOR INSERT TO "openschool_person_merge_manager" WITH CHECK (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_person_merge_manager'
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND context ->> 'actorAccountId' = nullif(current_setting('app.account_id', true), '')
    AND context ->> 'actorPersonId' = nullif(current_setting('app.person_id', true), '')
    AND context ->> 'requestId' = nullif(current_setting('app.request_id', true), '')
    AND correlation_id = nullif(current_setting('app.correlation_id', true), '')
    AND topic = 'audit.event.committed'
    AND payload ->> 'eventType' = 'person.merge.execute'
  );
--> statement-breakpoint
DO $policies$
DECLARE
  v_relation record;
  v_select_policy text;
  v_update_policy text;
BEGIN
  FOR v_relation IN
    SELECT DISTINCT child.oid, child.relname
    FROM pg_constraint AS constraint_row
    INNER JOIN pg_class AS child ON child.oid = constraint_row.conrelid
    INNER JOIN pg_namespace AS child_namespace ON child_namespace.oid = child.relnamespace
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.people'::regclass
      AND child_namespace.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_inherits AS inheritance
        WHERE inheritance.inhrelid = child.oid
      )
      AND child.relname NOT IN (
        'person_merge_operations', 'person_merge_preview_items', 'person_merge_events',
        'person_merge_aliases', 'person_merge_moves'
      )
    ORDER BY child.relname
  LOOP
    v_select_policy := left(v_relation.relname || '_person_merge_manager_select', 63);
    v_update_policy := left(v_relation.relname || '_person_merge_manager_update', 63);
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_relation.relname
        AND policyname = v_select_policy
    ) THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I USING (session_user = ''openschool_runtime'' AND current_user = ''openschool_person_merge_manager'' AND tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid AND nullif(current_setting(''app.policy_capability'', true), '''') IN (''tenant.people_merges.preview'', ''tenant.people_merges.approve'', ''tenant.people_merges.execute''))',
        v_select_policy, v_relation.relname
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_relation.relname
        AND policyname = v_update_policy
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR UPDATE TO openschool_person_merge_manager USING (session_user = ''openschool_runtime'' AND current_user = ''openschool_person_merge_manager'' AND tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid AND nullif(current_setting(''app.policy_capability'', true), '''') = ''tenant.people_merges.execute'') WITH CHECK (session_user = ''openschool_runtime'' AND current_user = ''openschool_person_merge_manager'' AND tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid AND nullif(current_setting(''app.policy_capability'', true), '''') = ''tenant.people_merges.execute'')',
        v_update_policy, v_relation.relname
      );
    END IF;
    EXECUTE format(
      'GRANT UPDATE ON TABLE public.%I TO openschool_person_merge_manager',
      v_relation.relname
    );
  END LOOP;
END
$policies$;
--> statement-breakpoint
-- Every new operational Person reference locks the Person row. A merge holds the source row
-- until commit, so a concurrent writer wakes against the archived version and fails closed.
CREATE FUNCTION "openschool_private"."guard_operational_person_reference"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_person_id uuid;
  v_status text;
BEGIN
  IF TG_NARGS <> 1 OR TG_ARGV[0] !~ '^[a-z][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION 'PERSON_REFERENCE_GUARD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_person_id := nullif(to_jsonb(NEW) ->> TG_ARGV[0], '')::uuid;
  IF v_person_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT person.status INTO v_status
  FROM public.people AS person
  WHERE person.tenant_id = NEW.tenant_id AND person.id = v_person_id
  FOR SHARE;
  IF NOT FOUND OR v_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'PERSON_REFERENCE_NOT_OPERATIONAL' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."guard_operational_person_reference"()
  FROM PUBLIC;
--> statement-breakpoint
DO $triggers$
DECLARE
  v_guard record;
  v_trigger_name text;
BEGIN
  FOR v_guard IN
    SELECT * FROM (VALUES
      ('account_links', 'person_id'),
      ('contact_profiles', 'person_id'),
      ('student_profiles', 'person_id'),
      ('guardian_profiles', 'person_id'),
      ('employee_profiles', 'person_id'),
      ('teacher_profiles', 'person_id'),
      ('affiliations', 'person_id'),
      ('person_relationships', 'subject_person_id'),
      ('person_relationships', 'related_person_id'),
      ('household_memberships', 'person_id'),
      ('school_enrollments', 'person_id'),
      ('section_staff_assignments', 'person_id'),
      ('section_roster_memberships', 'person_id'),
      ('account_invitations', 'person_id')
    ) AS guard(relation_name, column_name)
  LOOP
    v_trigger_name := left(
      v_guard.relation_name || '_' || v_guard.column_name || '_operational_guard', 63
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON public.%I FOR EACH ROW EXECUTE FUNCTION openschool_private.guard_operational_person_reference(%L)',
      v_trigger_name, v_guard.column_name, v_guard.relation_name, v_guard.column_name
    );
  END LOOP;
END
$triggers$;
--> statement-breakpoint
CREATE FUNCTION "openschool_private"."execute_person_merge"(
  p_operation_id uuid,
  p_expected_operation_version integer,
  p_expected_preview_digest text,
  p_reason text
)
RETURNS TABLE (
  operation_id uuid,
  status text,
  version integer,
  execution_digest text,
  invalidation_count integer,
  executed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
SET timezone = 'UTC'
AS $function$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_person_id uuid := nullif(current_setting('app.person_id', true), '')::uuid;
  v_request_id text := nullif(current_setting('app.request_id', true), '');
  v_correlation_id text := nullif(current_setting('app.correlation_id', true), '');
  v_policy_version text := nullif(current_setting('app.policy_version', true), '');
  v_reauthenticated_at timestamptz :=
    nullif(current_setting('app.reauthenticated_at', true), '')::timestamptz;
  v_operation public.person_merge_operations%ROWTYPE;
  v_case public.person_duplicate_cases%ROWTYPE;
  v_item record;
  v_account_record record;
  v_session_record record;
  v_changed_count integer;
  v_sequence integer := 0;
  v_invalidation_count integer := 0;
  v_next_version integer;
  v_case_next_version integer;
  v_before_fingerprint text;
  v_after_fingerprint text;
  v_execution_digest text;
  v_audit_event_id uuid := gen_random_uuid();
  v_audit_outbox_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_person_merge_manager'
    OR nullif(current_setting('app.policy_capability', true), '')
      <> 'tenant.people_merges.execute'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR v_tenant_id IS NULL OR v_account_id IS NULL OR v_person_id IS NULL
    OR v_request_id IS NULL OR v_correlation_id IS NULL OR v_policy_version IS NULL
    OR v_reauthenticated_at IS NULL
    OR v_reauthenticated_at < statement_timestamp() - interval '15 minutes'
    OR v_reauthenticated_at > statement_timestamp() + interval '1 minute'
    OR p_operation_id IS NULL OR p_expected_operation_version IS NULL
    OR p_expected_operation_version < 1
    OR p_expected_preview_digest IS NULL
    OR p_expected_preview_digest !~ '^[0-9a-f]{64}$'
    OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
  THEN
    RAISE EXCEPTION 'PERSON_MERGE_EXECUTION_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT operation.* INTO v_operation
  FROM public.person_merge_operations AS operation
  WHERE operation.tenant_id = v_tenant_id AND operation.id = p_operation_id
    AND public.openschool_school_scope_allows(
      operation.tenant_id, operation.review_school_id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERSON_MERGE_OPERATION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_tenant_id::text || ':' || least(
        v_operation.source_person_id, v_operation.target_person_id
      )::text || ':' || greatest(
        v_operation.source_person_id, v_operation.target_person_id
      )::text,
      0
    )
  );

  -- Merges are rare and identity-sensitive. A brief fixed-order table lock prevents phantom
  -- target conflicts and makes the approved fingerprint set stable through commit.
  LOCK TABLE public.accounts, public.account_sessions, public.account_links,
    public.contact_profiles, public.student_profiles, public.guardian_profiles,
    public.employee_profiles, public.teacher_profiles, public.affiliations,
    public.person_relationships, public.household_memberships, public.school_enrollments,
    public.section_staff_assignments, public.section_roster_memberships,
    public.account_invitations IN SHARE ROW EXCLUSIVE MODE;

  SELECT operation.* INTO v_operation
  FROM public.person_merge_operations AS operation
  WHERE operation.tenant_id = v_tenant_id AND operation.id = p_operation_id
    AND public.openschool_school_scope_allows(
      operation.tenant_id, operation.review_school_id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERSON_MERGE_OPERATION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF v_operation.status <> 'approved'
    OR v_operation.plan_version <> 2
    OR v_operation.current_version <> p_expected_operation_version
    OR v_operation.preview_digest <> p_expected_preview_digest
    OR v_operation.conflict_count <> 0
    OR v_operation.executed_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'PERSON_MERGE_APPROVAL_CHANGED' USING ERRCODE = '40001';
  END IF;

  SELECT duplicate_case.* INTO v_case
  FROM public.person_duplicate_cases AS duplicate_case
  WHERE duplicate_case.tenant_id = v_tenant_id
    AND duplicate_case.id = v_operation.duplicate_case_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_case.status <> 'merge_approval_requested'
    OR v_case.current_version <> v_operation.duplicate_case_version
    OR v_case.current_evidence_hash <> v_operation.duplicate_evidence_hash
  THEN
    RAISE EXCEPTION 'PERSON_MERGE_CASE_CHANGED' USING ERRCODE = '40001';
  END IF;

  PERFORM 1
  FROM public.people AS person
  WHERE person.tenant_id = v_tenant_id
    AND person.id IN (v_operation.source_person_id, v_operation.target_person_id)
    AND person.status IN ('active', 'suspended')
  ORDER BY person.id
  FOR UPDATE;
  IF NOT FOUND OR (
    SELECT count(*) FROM public.people AS person
    WHERE person.tenant_id = v_tenant_id
      AND person.id IN (v_operation.source_person_id, v_operation.target_person_id)
      AND person.status IN ('active', 'suspended')
  ) <> 2 THEN
    RAISE EXCEPTION 'PERSON_MERGE_PERSON_CHANGED' USING ERRCODE = '40001';
  END IF;

  PERFORM set_config(
    'app.merge_source_person_id', v_operation.source_person_id::text, true
  );
  PERFORM openschool_private.assert_person_merge_plan_v2_current(p_operation_id);

  -- Invalidate identity caches and active sessions before moving Account links.
  FOR v_item IN
    SELECT item.*
    FROM public.person_merge_preview_items AS item
    WHERE item.tenant_id = v_tenant_id AND item.operation_id = p_operation_id
      AND item.relation_name = 'accounts'
      AND item.metadata->>'kind' = 'derived_dependency'
    ORDER BY item.record_key
  LOOP
    SELECT account_row.* INTO v_account_record
    FROM (
      SELECT account.id, account.status, account.membership_version,
        account.security_version, account.updated_at
      FROM public.accounts AS account
      WHERE EXISTS (
        SELECT 1 FROM public.account_links AS link
        WHERE link.account_id = account.id AND link.tenant_id = v_tenant_id
          AND link.person_id = v_operation.source_person_id
      )
    ) AS account_row
    WHERE encode(
      digest(convert_to(to_jsonb(account_row)::text, 'UTF8'), 'sha256'), 'hex'
    ) = v_item.row_fingerprint;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PERSON_MERGE_ACCOUNT_CHANGED' USING ERRCODE = '40001';
    END IF;
    PERFORM 1 FROM public.accounts WHERE id = v_account_record.id FOR UPDATE;
    UPDATE public.accounts AS account
    SET membership_version = account.membership_version + 1,
      security_version = account.security_version + 1, updated_at = v_now
    WHERE account.id = v_account_record.id;
    SELECT encode(
      digest(convert_to(to_jsonb(account_row)::text, 'UTF8'), 'sha256'), 'hex'
    ) INTO v_after_fingerprint
    FROM (
      SELECT account.id, account.status, account.membership_version,
        account.security_version, account.updated_at
      FROM public.accounts AS account WHERE account.id = v_account_record.id
    ) AS account_row;
    v_sequence := v_sequence + 1;
    INSERT INTO public.person_merge_moves (
      tenant_id, review_school_id, operation_id, sequence, relation_name,
      source_record_key, replacement_record_key, action, before_fingerprint,
      after_fingerprint, created_at
    ) VALUES (
      v_tenant_id, v_operation.review_school_id, p_operation_id, v_sequence,
      'accounts', v_item.record_key, NULL, 'invalidate', v_item.row_fingerprint,
      v_after_fingerprint, v_now
    );
  END LOOP;

  FOR v_item IN
    SELECT item.*
    FROM public.person_merge_preview_items AS item
    WHERE item.tenant_id = v_tenant_id AND item.operation_id = p_operation_id
      AND item.relation_name = 'account_sessions'
      AND item.metadata->>'kind' = 'derived_dependency'
    ORDER BY item.record_key
  LOOP
    SELECT session_row.* INTO v_session_record
    FROM (
      SELECT session.id, session.account_id, session.status,
        session.security_version, session.expires_at, session.updated_at
      FROM public.account_sessions AS session
      WHERE EXISTS (
        SELECT 1 FROM public.account_links AS link
        WHERE link.account_id = session.account_id AND link.tenant_id = v_tenant_id
          AND link.person_id = v_operation.source_person_id
      )
    ) AS session_row
    WHERE encode(
      digest(convert_to(to_jsonb(session_row)::text, 'UTF8'), 'sha256'), 'hex'
    ) = v_item.row_fingerprint;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PERSON_MERGE_SESSION_CHANGED' USING ERRCODE = '40001';
    END IF;
    PERFORM 1 FROM public.account_sessions
    WHERE id = v_session_record.id FOR UPDATE;
    IF v_session_record.status = 'active' THEN
      UPDATE public.account_sessions AS session
      SET status = 'revoked', revoked_at = v_now,
        revoked_by_account_id = v_account_id,
        revocation_reason = 'Person merge execution', updated_at = v_now
      WHERE session.id = v_session_record.id;
      v_invalidation_count := v_invalidation_count + 1;
    END IF;
    SELECT encode(
      digest(convert_to(to_jsonb(session_row)::text, 'UTF8'), 'sha256'), 'hex'
    ) INTO v_after_fingerprint
    FROM (
      SELECT session.id, session.account_id, session.status,
        session.security_version, session.expires_at, session.updated_at
      FROM public.account_sessions AS session WHERE session.id = v_session_record.id
    ) AS session_row;
    v_sequence := v_sequence + 1;
    INSERT INTO public.person_merge_moves (
      tenant_id, review_school_id, operation_id, sequence, relation_name,
      source_record_key, replacement_record_key, action, before_fingerprint,
      after_fingerprint, created_at
    ) VALUES (
      v_tenant_id, v_operation.review_school_id, p_operation_id, v_sequence,
      'account_sessions', v_item.record_key, NULL,
      CASE WHEN v_session_record.status = 'active' THEN 'invalidate' ELSE 'preserve_history' END,
      v_item.row_fingerprint, v_after_fingerprint, v_now
    );
  END LOOP;

  -- Repoint only reviewed operational dependencies. Dynamic identifiers come exclusively from
  -- immutable preview metadata that was generated from PostgreSQL's FK catalog and revalidated.
  FOR v_item IN
    SELECT item.*
    FROM public.person_merge_preview_items AS item
    WHERE item.tenant_id = v_tenant_id AND item.operation_id = p_operation_id
      AND item.metadata ? 'column' AND item.disposition = 'end_and_recreate'
    ORDER BY item.relation_name, item.record_key, item.direction
  LOOP
    IF v_item.relation_name !~ '^[a-z][a-z0-9_]{0,62}$'
      OR v_item.metadata->>'column' !~ '^[a-z][a-z0-9_]{0,62}$'
    THEN
      RAISE EXCEPTION 'PERSON_MERGE_PREVIEW_METADATA_INVALID' USING ERRCODE = '22023';
    END IF;
    EXECUTE format(
      'WITH before_row AS (SELECT source_row.ctid AS row_pointer, to_jsonb(source_row) AS before_json FROM public.%I AS source_row WHERE source_row.tenant_id = $1 AND source_row.%I = $2 AND encode(digest(convert_to(to_jsonb(source_row)::text, ''UTF8''), ''sha256''), ''hex'') = $3 FOR UPDATE), changed AS (UPDATE public.%I AS target_row SET %I = $4 FROM before_row WHERE target_row.ctid = before_row.row_pointer RETURNING before_row.before_json, to_jsonb(target_row) AS after_json) SELECT count(*)::integer, min(encode(digest(convert_to(before_json::text, ''UTF8''), ''sha256''), ''hex'')), min(encode(digest(convert_to(after_json::text, ''UTF8''), ''sha256''), ''hex'')) FROM changed',
      v_item.relation_name, v_item.metadata->>'column',
      v_item.relation_name, v_item.metadata->>'column'
    ) INTO v_changed_count, v_before_fingerprint, v_after_fingerprint
      USING v_tenant_id, v_operation.source_person_id,
        v_item.row_fingerprint, v_operation.target_person_id;
    IF v_changed_count <> 1 OR v_before_fingerprint <> v_item.row_fingerprint THEN
      RAISE EXCEPTION 'PERSON_MERGE_DEPENDENCY_CHANGED' USING ERRCODE = '40001';
    END IF;
    v_sequence := v_sequence + 1;
    INSERT INTO public.person_merge_moves (
      tenant_id, review_school_id, operation_id, sequence, relation_name,
      source_record_key, replacement_record_key, action, before_fingerprint,
      after_fingerprint, created_at
    ) VALUES (
      v_tenant_id, v_operation.review_school_id, p_operation_id, v_sequence,
      v_item.relation_name, v_item.record_key, v_after_fingerprint, 'repoint',
      v_before_fingerprint, v_after_fingerprint, v_now
    );
  END LOOP;

  -- Historical dependencies and the target anchor remain where they were; ledger entries prove
  -- that preservation was an explicit reviewed action, not an omitted mutation.
  FOR v_item IN
    SELECT item.*
    FROM public.person_merge_preview_items AS item
    WHERE item.tenant_id = v_tenant_id AND item.operation_id = p_operation_id
      AND item.disposition <> 'block'
      AND NOT (item.metadata ? 'column' AND item.disposition = 'end_and_recreate')
      AND item.relation_name NOT IN (
        'accounts', 'account_sessions', 'person_duplicate_cases'
      )
      AND NOT (
        item.metadata->>'kind' = 'person_anchor'
        AND item.metadata->>'personRole' = 'source'
      )
    ORDER BY item.relation_name, item.record_key, item.direction
  LOOP
    v_sequence := v_sequence + 1;
    INSERT INTO public.person_merge_moves (
      tenant_id, review_school_id, operation_id, sequence, relation_name,
      source_record_key, replacement_record_key, action, before_fingerprint,
      after_fingerprint, created_at
    ) VALUES (
      v_tenant_id, v_operation.review_school_id, p_operation_id, v_sequence,
      v_item.relation_name, v_item.record_key, NULL, 'preserve_history',
      v_item.row_fingerprint, v_item.row_fingerprint, v_now
    );
  END LOOP;

  -- No reviewed operational reference may remain on the source. Table locks keep this assertion
  -- stable through commit and the installed guards reject future references to the archived alias.
  IF EXISTS (SELECT 1 FROM public.account_links WHERE tenant_id = v_tenant_id AND person_id = v_operation.source_person_id)
    OR EXISTS (SELECT 1 FROM public.contact_profiles WHERE tenant_id = v_tenant_id AND person_id = v_operation.source_person_id)
    OR EXISTS (SELECT 1 FROM public.student_profiles WHERE tenant_id = v_tenant_id AND person_id = v_operation.source_person_id)
    OR EXISTS (SELECT 1 FROM public.guardian_profiles WHERE tenant_id = v_tenant_id AND person_id = v_operation.source_person_id)
    OR EXISTS (SELECT 1 FROM public.employee_profiles WHERE tenant_id = v_tenant_id AND person_id = v_operation.source_person_id)
    OR EXISTS (SELECT 1 FROM public.teacher_profiles WHERE tenant_id = v_tenant_id AND person_id = v_operation.source_person_id)
    OR EXISTS (SELECT 1 FROM public.affiliations WHERE tenant_id = v_tenant_id AND person_id = v_operation.source_person_id)
    OR EXISTS (SELECT 1 FROM public.person_relationships WHERE tenant_id = v_tenant_id AND (subject_person_id = v_operation.source_person_id OR related_person_id = v_operation.source_person_id))
    OR EXISTS (SELECT 1 FROM public.household_memberships WHERE tenant_id = v_tenant_id AND person_id = v_operation.source_person_id)
    OR EXISTS (SELECT 1 FROM public.school_enrollments WHERE tenant_id = v_tenant_id AND person_id = v_operation.source_person_id)
    OR EXISTS (SELECT 1 FROM public.section_staff_assignments WHERE tenant_id = v_tenant_id AND person_id = v_operation.source_person_id)
    OR EXISTS (SELECT 1 FROM public.section_roster_memberships WHERE tenant_id = v_tenant_id AND person_id = v_operation.source_person_id)
    OR EXISTS (SELECT 1 FROM public.account_invitations WHERE tenant_id = v_tenant_id AND person_id = v_operation.source_person_id)
  THEN
    RAISE EXCEPTION 'PERSON_MERGE_OPERATIONAL_REFERENCE_REMAINS' USING ERRCODE = '40001';
  END IF;

  SELECT item.row_fingerprint INTO v_before_fingerprint
  FROM public.person_merge_preview_items AS item
  WHERE item.tenant_id = v_tenant_id AND item.operation_id = p_operation_id
    AND item.metadata->>'kind' = 'person_anchor'
    AND item.metadata->>'personRole' = 'source';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERSON_MERGE_SOURCE_ANCHOR_MISSING' USING ERRCODE = '40001';
  END IF;
  UPDATE public.people AS person
  SET status = 'archived', updated_at = v_now
  WHERE person.tenant_id = v_tenant_id AND person.id = v_operation.source_person_id;
  SELECT encode(
    digest(convert_to(to_jsonb(person)::text, 'UTF8'), 'sha256'), 'hex'
  ) INTO v_after_fingerprint
  FROM public.people AS person
  WHERE person.tenant_id = v_tenant_id AND person.id = v_operation.source_person_id;
  v_sequence := v_sequence + 1;
  INSERT INTO public.person_merge_moves (
    tenant_id, review_school_id, operation_id, sequence, relation_name,
    source_record_key, replacement_record_key, action, before_fingerprint,
    after_fingerprint, created_at
  )
  SELECT v_tenant_id, v_operation.review_school_id, p_operation_id, v_sequence,
    'people', item.record_key, NULL, 'archive_source', v_before_fingerprint,
    v_after_fingerprint, v_now
  FROM public.person_merge_preview_items AS item
  WHERE item.tenant_id = v_tenant_id AND item.operation_id = p_operation_id
    AND item.metadata->>'kind' = 'person_anchor'
    AND item.metadata->>'personRole' = 'source';

  INSERT INTO public.person_merge_aliases (
    tenant_id, review_school_id, operation_id, source_person_id, target_person_id,
    status, version, merged_at, created_at
  ) VALUES (
    v_tenant_id, v_operation.review_school_id, p_operation_id,
    v_operation.source_person_id, v_operation.target_person_id,
    'active', 1, v_now, v_now
  );

  v_case_next_version := v_case.current_version + 1;
  UPDATE public.person_duplicate_cases AS duplicate_case
  SET status = 'superseded', current_version = v_case_next_version, updated_at = v_now
  WHERE duplicate_case.tenant_id = v_tenant_id AND duplicate_case.id = v_case.id
    AND duplicate_case.current_version = v_case.current_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERSON_MERGE_CASE_CHANGED' USING ERRCODE = '40001';
  END IF;
  SELECT encode(
    digest(convert_to(to_jsonb(duplicate_case)::text, 'UTF8'), 'sha256'), 'hex'
  ) INTO v_after_fingerprint
  FROM public.person_duplicate_cases AS duplicate_case
  WHERE duplicate_case.tenant_id = v_tenant_id AND duplicate_case.id = v_case.id;
  FOR v_item IN
    SELECT item.*
    FROM public.person_merge_preview_items AS item
    WHERE item.tenant_id = v_tenant_id AND item.operation_id = p_operation_id
      AND item.relation_name = 'person_duplicate_cases'
      AND item.metadata ? 'column'
    ORDER BY item.record_key, item.direction
  LOOP
    v_sequence := v_sequence + 1;
    INSERT INTO public.person_merge_moves (
      tenant_id, review_school_id, operation_id, sequence, relation_name,
      source_record_key, replacement_record_key, action, before_fingerprint,
      after_fingerprint, created_at
    ) VALUES (
      v_tenant_id, v_operation.review_school_id, p_operation_id, v_sequence,
      'person_duplicate_cases', v_item.record_key, NULL, 'preserve_history',
      v_item.row_fingerprint, v_after_fingerprint, v_now
    );
  END LOOP;
  INSERT INTO public.person_duplicate_case_events (
    tenant_id, review_school_id, case_id, version, event_type, score, signals,
    evidence_hash, reason, actor_account_id, created_at
  ) VALUES (
    v_tenant_id, v_case.review_school_id, v_case.id, v_case_next_version,
    'merge_executed', v_case.current_score, v_case.current_signals,
    v_case.current_evidence_hash, btrim(p_reason), v_account_id, v_now
  );

  SELECT encode(
    digest(
      convert_to(
        v_operation.preview_digest || ':' || coalesce(string_agg(
          move.sequence::text || ':' || move.relation_name || ':' ||
          move.source_record_key || ':' || move.action || ':' ||
          move.before_fingerprint || ':' || move.after_fingerprint,
          '|' ORDER BY move.sequence
        ), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) INTO v_execution_digest
  FROM public.person_merge_moves AS move
  WHERE move.tenant_id = v_tenant_id AND move.operation_id = p_operation_id;

  v_next_version := v_operation.current_version + 1;
  UPDATE public.person_merge_operations AS operation
  SET status = 'executed', current_version = v_next_version,
    execution_digest = v_execution_digest,
    invalidation_count = v_invalidation_count,
    executed_by_account_id = v_account_id, executed_at = v_now, updated_at = v_now
  WHERE operation.tenant_id = v_tenant_id AND operation.id = p_operation_id
    AND operation.current_version = p_expected_operation_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERSON_MERGE_APPROVAL_CHANGED' USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.person_merge_events (
    tenant_id, review_school_id, operation_id, version, event_type, operation_status,
    preview_digest, reason, actor_account_id, created_at
  ) VALUES (
    v_tenant_id, v_operation.review_school_id, p_operation_id, v_next_version,
    'executed', 'executed', v_operation.preview_digest, btrim(p_reason),
    v_account_id, v_now
  );

  INSERT INTO public.audit_events (
    id, occurred_at, event_version, event_type, outcome, tenant_id, school_id,
    actor_type, actor_account_id, actor_person_id, capability, policy_version,
    policy_decision, request_id, correlation_id, target_type, target_id,
    data_classes, change_summary, purpose, source, retention_class,
    content_hash, created_at
  ) VALUES (
    v_audit_event_id, v_now, 1, 'person.merge.execute', 'succeeded', v_tenant_id,
    v_operation.review_school_id, 'account', v_account_id, v_person_id,
    'tenant.people_merges.execute', v_policy_version,
    jsonb_build_object(
      'effect', 'allow', 'queryConstraints', coalesce(
        nullif(current_setting('app.policy_constraints', true), '')::jsonb,
        '[]'::jsonb
      )
    ),
    v_request_id, v_correlation_id, 'person_merge_operation', p_operation_id::text,
    '["internal", "student_personal", "credential"]'::jsonb,
    jsonb_build_object('changedFields', jsonb_build_array(
      'status', 'sourcePersonId', 'targetPersonId', 'membershipVersion',
      'securityVersion'
    )),
    'person_identity_reconciliation', 'web', 'security', 'pending', v_now
  );
  INSERT INTO public.audit_outbox (
    id, tenant_id, audit_event_id, audit_event_occurred_at, topic,
    deduplication_key, correlation_id, context, payload, payload_hash,
    status, attempt_count, available_at, created_at, updated_at
  ) VALUES (
    v_audit_outbox_id, v_tenant_id, v_audit_event_id, v_now,
    'audit.event.committed', 'person.merge.execute:' || p_operation_id::text,
    v_correlation_id,
    jsonb_build_object(
      'tenantId', v_tenant_id, 'requestId', v_request_id,
      'correlationId', v_correlation_id, 'actorAccountId', v_account_id,
      'actorPersonId', v_person_id
    ),
    jsonb_build_object(
      'auditEventId', v_audit_event_id, 'eventVersion', 1,
      'eventType', 'person.merge.execute', 'outcome', 'succeeded',
      'targetType', 'person_merge_operation', 'targetId', p_operation_id
    ),
    'pending', 'pending', 0, v_now, v_now, v_now
  );

  RETURN QUERY SELECT p_operation_id, 'executed'::text, v_next_version,
    v_execution_digest, v_invalidation_count, v_now;
END
$function$;
--> statement-breakpoint
ALTER FUNCTION "openschool_private"."execute_person_merge"(uuid, integer, text, text)
  OWNER TO "openschool_person_merge_manager";
--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."execute_person_merge"(
  uuid, integer, text, text
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."execute_person_merge"(
  uuid, integer, text, text
) TO "openschool_runtime";
--> statement-breakpoint
DO $verification$
BEGIN
  IF NOT has_function_privilege(
    'openschool_runtime',
    'openschool_private.execute_person_merge(uuid,integer,text,text)', 'EXECUTE'
  ) OR has_table_privilege(
    'openschool_runtime', 'public.person_merge_aliases', 'INSERT'
  ) OR has_table_privilege(
    'openschool_runtime', 'public.person_merge_moves', 'INSERT'
  ) OR pg_has_role(
    'openschool_runtime', 'openschool_person_merge_manager', 'member'
  ) THEN
    RAISE EXCEPTION 'Person merge execution authority is misconfigured';
  END IF;
END
$verification$;
