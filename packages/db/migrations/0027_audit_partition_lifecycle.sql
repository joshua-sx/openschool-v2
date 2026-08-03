-- Dedicated, least-privilege Audit Ledger partition maintenance authority.
-- The worker can invoke one guarded function but never receives DDL privileges.

GRANT USAGE, CREATE ON SCHEMA "public" TO "openschool_audit_partition_manager";--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA "openschool_private" TO "openschool_audit_partition_manager";--> statement-breakpoint

ALTER TABLE "audit_events" OWNER TO "openschool_audit_partition_manager";--> statement-breakpoint
ALTER TABLE "audit_events_2026_q3" OWNER TO "openschool_audit_partition_manager";--> statement-breakpoint
ALTER TABLE "audit_events_2026_q4" OWNER TO "openschool_audit_partition_manager";--> statement-breakpoint
ALTER TABLE "audit_events_2027_q1" OWNER TO "openschool_audit_partition_manager";--> statement-breakpoint
ALTER TABLE "audit_events_default" OWNER TO "openschool_audit_partition_manager";--> statement-breakpoint

ALTER TABLE "audit_events_2026_q3" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events_2026_q3" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events_2026_q4" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events_2026_q4" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events_2027_q1" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events_2027_q1" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events_default" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events_default" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "audit_events_partition_manager_select" ON "audit_events"
  AS PERMISSIVE FOR SELECT TO "openschool_audit_partition_manager"
  USING (
    current_user = 'openschool_audit_partition_manager'
    AND session_user = 'openschool_worker'
    AND nullif(current_setting('app.job_type', true), '') = 'audit_partition_maintenance'
    AND nullif(current_setting('app.job_id', true), '') IS NOT NULL
    AND nullif(current_setting('app.request_id', true), '') IS NOT NULL
  );--> statement-breakpoint

CREATE FUNCTION "openschool_private"."maintain_audit_partition_horizon"(
  p_min_horizon_days integer DEFAULT 45
)
RETURNS TABLE (
  status text,
  created_partitions jsonb,
  horizon_until timestamp with time zone,
  default_row_count bigint,
  postgres_version text,
  manager_role text,
  checked_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET timezone = 'UTC'
AS $$
DECLARE
  reference_at timestamp with time zone := statement_timestamp();
  target_horizon timestamp with time zone;
  partition_start timestamp with time zone;
  partition_end timestamp with time zone;
  partition_name text;
  partition_oid oid;
  default_oid oid;
  partition_bound text;
  partition_owner text;
  partition_rls boolean;
  partition_force_rls boolean;
  expected_index_count integer;
  partition_index_count integer;
  partition_trigger_count integer;
  overlapping_default_rows bigint;
  created jsonb := '[]'::jsonb;
  current_horizon timestamp with time zone;
BEGIN
  IF session_user <> 'openschool_worker'
    OR current_user <> 'openschool_audit_partition_manager'
    OR nullif(current_setting('app.job_type', true), '') <> 'audit_partition_maintenance'
    OR nullif(current_setting('app.job_id', true), '') IS NULL
    OR nullif(current_setting('app.request_id', true), '') IS NULL
    OR p_min_horizon_days NOT BETWEEN 45 AND 366
  THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('openschool.audit.partition.lifecycle', 0));
  target_horizon := reference_at + make_interval(days => p_min_horizon_days);
  partition_start := date_trunc('quarter', reference_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  current_horizon := partition_start;
  default_oid := to_regclass('public.audit_events_default');
  IF default_oid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_inherits
    WHERE inhparent = 'public.audit_events'::regclass AND inhrelid = default_oid
  ) THEN
    RAISE EXCEPTION 'AUDIT_DEFAULT_PARTITION_MISSING' USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO expected_index_count
  FROM pg_index
  WHERE indrelid = 'public.audit_events'::regclass AND indisvalid;
  IF expected_index_count < 3 THEN
    RAISE EXCEPTION 'AUDIT_PARTITION_PARENT_INDEXES_INVALID' USING ERRCODE = '55000';
  END IF;

  WHILE current_horizon < target_horizon LOOP
    partition_end := partition_start + interval '3 months';
    partition_name := format(
      'audit_events_%s_q%s',
      extract(year FROM partition_start AT TIME ZONE 'UTC')::integer,
      extract(quarter FROM partition_start AT TIME ZONE 'UTC')::integer
    );
    partition_oid := to_regclass(format('public.%I', partition_name));

    IF partition_oid IS NULL THEN
      SELECT count(*) INTO overlapping_default_rows
      FROM public.audit_events
      WHERE tableoid = default_oid
        AND occurred_at >= partition_start
        AND occurred_at < partition_end;
      IF overlapping_default_rows > 0 THEN
        SELECT count(*) INTO default_row_count
        FROM public.audit_events
        WHERE tableoid = default_oid;
        RETURN QUERY SELECT
          'default_occupied'::text,
          created,
          current_horizon,
          default_row_count,
          current_setting('server_version'),
          current_user::text,
          reference_at;
        RETURN;
      END IF;

      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.audit_events FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        partition_start,
        partition_end
      );
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', partition_name);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', partition_name);
      partition_oid := to_regclass(format('public.%I', partition_name));
      created := created || jsonb_build_array(partition_name);
    END IF;

    SELECT
      pg_get_expr(relation.relpartbound, relation.oid),
      pg_get_userbyid(relation.relowner),
      relation.relrowsecurity,
      relation.relforcerowsecurity
    INTO partition_bound, partition_owner, partition_rls, partition_force_rls
    FROM pg_class AS relation
    INNER JOIN pg_inherits AS inheritance
      ON inheritance.inhrelid = relation.oid
      AND inheritance.inhparent = 'public.audit_events'::regclass
    WHERE relation.oid = partition_oid;

    IF partition_bound IS NULL
      OR position(
        to_char(partition_start AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
        IN partition_bound
      ) = 0
      OR position(
        to_char(partition_end AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
        IN partition_bound
      ) = 0
      OR partition_owner <> 'openschool_audit_partition_manager'
      OR NOT partition_rls
      OR NOT partition_force_rls
    THEN
      RAISE EXCEPTION 'AUDIT_PARTITION_METADATA_INVALID:%', partition_name
        USING ERRCODE = '55000';
    END IF;

    SELECT count(*) INTO partition_index_count
    FROM pg_index AS child_index
    INNER JOIN pg_inherits AS index_inheritance
      ON index_inheritance.inhrelid = child_index.indexrelid
    INNER JOIN pg_index AS parent_index
      ON parent_index.indexrelid = index_inheritance.inhparent
      AND parent_index.indrelid = 'public.audit_events'::regclass
    WHERE child_index.indrelid = partition_oid
      AND child_index.indisvalid
      AND parent_index.indisvalid;

    SELECT count(*) INTO partition_trigger_count
    FROM pg_trigger
    WHERE tgrelid = partition_oid
      AND NOT tgisinternal
      AND tgenabled <> 'D'
      AND tgname IN (
        'audit_events_hash_on_insert',
        'audit_events_insert_guard',
        'audit_events_update_rejected',
        'audit_events_delete_rejected'
      );

    IF partition_index_count <> expected_index_count OR partition_trigger_count <> 4 THEN
      RAISE EXCEPTION 'AUDIT_PARTITION_PROTECTIONS_INVALID:%', partition_name
        USING ERRCODE = '55000';
    END IF;

    current_horizon := partition_end;
    partition_start := partition_end;
  END LOOP;

  SELECT count(*) INTO default_row_count
  FROM public.audit_events
  WHERE tableoid = default_oid;

  RETURN QUERY SELECT
    CASE WHEN default_row_count > 0 THEN 'default_occupied' ELSE 'ok' END,
    created,
    current_horizon,
    default_row_count,
    current_setting('server_version'),
    current_user::text,
    reference_at;
END;
$$;--> statement-breakpoint

ALTER FUNCTION "openschool_private"."maintain_audit_partition_horizon"(integer)
  OWNER TO "openschool_audit_partition_manager";--> statement-breakpoint
REVOKE CREATE ON SCHEMA "openschool_private" FROM "openschool_audit_partition_manager";--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."maintain_audit_partition_horizon"(integer)
  FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA "openschool_private" TO "openschool_worker";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."maintain_audit_partition_horizon"(integer)
  TO "openschool_worker";--> statement-breakpoint

DO $$
DECLARE
  unsafe_execution_membership boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'openschool_audit_partition_manager'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
      AND NOT rolcreaterole AND NOT rolinherit AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Audit partition manager role attributes are unsafe'
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
        'openschool_audit_partition_manager'::regrole,
        'member'
      )
  ) INTO unsafe_execution_membership;
  IF unsafe_execution_membership THEN
    RAISE EXCEPTION 'Execution roles must not assume the Audit partition manager'
      USING ERRCODE = '55000';
  END IF;

  IF (
    SELECT pg_get_userbyid(relowner)
    FROM pg_class
    WHERE oid = 'public.audit_events'::regclass
  ) <> 'openschool_audit_partition_manager' THEN
    RAISE EXCEPTION 'Audit partition manager must own the Audit Events parent'
      USING ERRCODE = '55000';
  END IF;

  IF has_schema_privilege('openschool_worker', 'public', 'CREATE')
    OR has_schema_privilege('openschool_worker', 'openschool_private', 'CREATE')
    OR NOT has_function_privilege(
      'openschool_worker',
      'openschool_private.maintain_audit_partition_horizon(integer)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'public',
      'openschool_private.maintain_audit_partition_horizon(integer)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'Audit partition function privileges are unsafe'
      USING ERRCODE = '55000';
  END IF;
END;
$$;
