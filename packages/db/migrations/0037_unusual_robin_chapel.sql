ALTER TABLE "courses" ADD CONSTRAINT "courses_status_check" CHECK ("courses"."status" IN ('active', 'archived'));--> statement-breakpoint
ALTER TABLE "section_roster_memberships" ADD CONSTRAINT "section_rosters_status_check" CHECK ("section_roster_memberships"."status" IN ('active', 'ended'));--> statement-breakpoint
ALTER TABLE "section_staff_assignments" ADD CONSTRAINT "section_staff_status_check" CHECK ("section_staff_assignments"."status" IN ('active', 'ended'));--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_status_check" CHECK ("sections"."status" IN ('draft', 'active', 'closed'));
--> statement-breakpoint
GRANT USAGE ON SCHEMA "public", "openschool_private" TO "openschool_section_manager";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.openschool_school_scope_allows(uuid, uuid)
  TO "openschool_section_manager";
--> statement-breakpoint
GRANT SELECT ON TABLE "academic_years", "academic_terms", "learner_levels",
  "courses", "sections", "section_staff_assignments", "section_roster_memberships",
  "school_enrollments", "people", "affiliations", "teacher_profiles"
  TO "openschool_section_manager";
--> statement-breakpoint
GRANT INSERT ON TABLE "courses", "sections", "section_staff_assignments",
  "section_roster_memberships" TO "openschool_section_manager";
--> statement-breakpoint
GRANT UPDATE (status, version, closed_at, closed_by_account_id, closure_reason, updated_at)
  ON TABLE "sections" TO "openschool_section_manager";
--> statement-breakpoint
GRANT UPDATE (status, valid_until, ended_by_account_id, end_reason, updated_at)
  ON TABLE "section_staff_assignments", "section_roster_memberships"
  TO "openschool_section_manager";
--> statement-breakpoint

CREATE FUNCTION "openschool_private"."create_course"(
  p_course_id uuid,
  p_school_id uuid,
  p_code text,
  p_name text,
  p_course_type text,
  p_subject_area text,
  p_description text,
  p_credit_value numeric,
  p_reason text
)
RETURNS TABLE (course_id uuid, status text, occurred_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_occurred_at timestamptz := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_section_manager'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.sections.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR v_tenant_id IS NULL OR v_account_id IS NULL OR p_course_id IS NULL OR p_school_id IS NULL
    OR char_length(btrim(p_code)) NOT BETWEEN 1 AND 64
    OR p_code !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
    OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 160
    OR p_course_type NOT IN ('general', 'subject', 'elective', 'support')
    OR p_credit_value < 0 OR p_credit_value > 100
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
    OR NOT public.openschool_school_scope_allows(v_tenant_id, p_school_id)
  THEN
    RAISE EXCEPTION 'COURSE_CREATE_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.courses (
    id, tenant_id, school_id, code, name, course_type, subject_area, description,
    credit_value, status, created_by_account_id, creation_reason, created_at, updated_at
  ) VALUES (
    p_course_id, v_tenant_id, p_school_id, btrim(p_code), btrim(p_name), p_course_type,
    nullif(btrim(p_subject_area), ''), nullif(btrim(p_description), ''), p_credit_value,
    'active', v_account_id, btrim(p_reason), v_occurred_at, v_occurred_at
  );

  RETURN QUERY SELECT p_course_id, 'active'::text, v_occurred_at;
END
$$;
--> statement-breakpoint

CREATE FUNCTION "openschool_private"."create_section"(
  p_section_id uuid,
  p_school_id uuid,
  p_academic_year_id uuid,
  p_academic_term_id uuid,
  p_learner_level_id uuid,
  p_course_id uuid,
  p_code text,
  p_name text,
  p_section_type text,
  p_start_date date,
  p_end_date date,
  p_capacity integer,
  p_reason text
)
RETURNS TABLE (section_id uuid, status text, occurred_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_occurred_at timestamptz := clock_timestamp();
  v_year public.academic_years%ROWTYPE;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_section_manager'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.sections.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR v_tenant_id IS NULL OR v_account_id IS NULL OR p_section_id IS NULL OR p_school_id IS NULL
    OR p_academic_year_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL
    OR p_end_date < p_start_date OR p_capacity <= 0
    OR p_section_type NOT IN ('homeroom', 'course')
    OR (p_section_type = 'course' AND p_course_id IS NULL)
    OR char_length(btrim(p_code)) NOT BETWEEN 1 AND 64
    OR p_code !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
    OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 160
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
    OR NOT public.openschool_school_scope_allows(v_tenant_id, p_school_id)
  THEN
    RAISE EXCEPTION 'SECTION_CREATE_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT year_record.* INTO v_year FROM public.academic_years AS year_record
  WHERE year_record.tenant_id = v_tenant_id AND year_record.school_id = p_school_id
    AND year_record.id = p_academic_year_id AND year_record.status = 'published';
  IF NOT FOUND OR p_start_date < v_year.start_date OR p_end_date > v_year.end_date THEN
    RAISE EXCEPTION 'SECTION_ACADEMIC_YEAR_INVALID' USING ERRCODE = '23514';
  END IF;

  IF p_academic_term_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.academic_terms AS term
    WHERE term.tenant_id = v_tenant_id AND term.school_id = p_school_id
      AND term.id = p_academic_term_id AND term.academic_year_id = p_academic_year_id
      AND p_start_date >= term.start_date AND p_end_date <= term.end_date
  ) THEN
    RAISE EXCEPTION 'SECTION_TERM_INVALID' USING ERRCODE = '23514';
  END IF;
  IF p_learner_level_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.learner_levels AS level
    WHERE level.tenant_id = v_tenant_id AND level.school_id = p_school_id
      AND level.id = p_learner_level_id AND level.academic_year_id = p_academic_year_id
  ) THEN
    RAISE EXCEPTION 'SECTION_LEVEL_INVALID' USING ERRCODE = '23514';
  END IF;
  IF p_course_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.courses AS course
    WHERE course.tenant_id = v_tenant_id AND course.school_id = p_school_id
      AND course.id = p_course_id AND course.status = 'active'
  ) THEN
    RAISE EXCEPTION 'SECTION_COURSE_INVALID' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.sections (
    id, tenant_id, school_id, academic_year_id, academic_term_id, learner_level_id,
    course_id, code, name, section_type, start_date, end_date, capacity, status,
    version, source, created_by_account_id, creation_reason, activated_at,
    activated_by_account_id, created_at, updated_at
  ) VALUES (
    p_section_id, v_tenant_id, p_school_id, p_academic_year_id, p_academic_term_id,
    p_learner_level_id, p_course_id, btrim(p_code), btrim(p_name), p_section_type,
    p_start_date, p_end_date, p_capacity, 'active', 1, 'native', v_account_id,
    btrim(p_reason), v_occurred_at, v_account_id, v_occurred_at, v_occurred_at
  );

  RETURN QUERY SELECT p_section_id, 'active'::text, v_occurred_at;
END
$$;
--> statement-breakpoint

CREATE FUNCTION "openschool_private"."assign_section_staff"(
  p_assignment_id uuid,
  p_assignment_key uuid,
  p_section_id uuid,
  p_person_id uuid,
  p_role text,
  p_is_primary boolean,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_reason text
)
RETURNS TABLE (assignment_id uuid, status text, occurred_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_section public.sections%ROWTYPE;
  v_occurred_at timestamptz := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime' OR current_user <> 'openschool_section_manager'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.sections.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR v_tenant_id IS NULL OR v_account_id IS NULL OR p_assignment_id IS NULL
    OR p_assignment_key IS NULL OR p_section_id IS NULL OR p_person_id IS NULL
    OR p_role NOT IN ('lead_teacher', 'teacher', 'assistant', 'counselor')
    OR p_valid_from IS NULL OR p_valid_until <= p_valid_from
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
  THEN
    RAISE EXCEPTION 'SECTION_STAFF_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT target.* INTO v_section FROM public.sections AS target
  WHERE target.tenant_id = v_tenant_id AND target.id = p_section_id AND target.status = 'active'
  FOR UPDATE;
  IF NOT FOUND OR NOT public.openschool_school_scope_allows(v_tenant_id, v_section.school_id)
    OR p_valid_from::date < v_section.start_date
    OR (p_valid_until IS NOT NULL AND p_valid_until::date > v_section.end_date + 1)
  THEN
    RAISE EXCEPTION 'SECTION_STAFF_PERIOD_INVALID' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.affiliations AS affiliation
    WHERE affiliation.tenant_id = v_tenant_id AND affiliation.person_id = p_person_id
      AND affiliation.kind IN ('teacher', 'employee', 'administrator')
      AND affiliation.scope_type = 'school' AND affiliation.school_id = v_section.school_id
      AND affiliation.status = 'active' AND affiliation.valid_from <= p_valid_from
      AND (affiliation.valid_until IS NULL OR affiliation.valid_until >= COALESCE(p_valid_until, p_valid_from))
  ) THEN
    RAISE EXCEPTION 'SECTION_STAFF_NOT_ELIGIBLE' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.section_staff_assignments (
    id, tenant_id, school_id, section_id, person_id, assignment_key, version, role,
    is_primary, status, valid_from, valid_until, issued_by_account_id, issuance_reason,
    created_at, updated_at
  ) VALUES (
    p_assignment_id, v_tenant_id, v_section.school_id, p_section_id, p_person_id,
    p_assignment_key, 1, p_role, p_is_primary, 'active', p_valid_from, p_valid_until,
    v_account_id, btrim(p_reason), v_occurred_at, v_occurred_at
  );
  RETURN QUERY SELECT p_assignment_id, 'active'::text, v_occurred_at;
END
$$;
--> statement-breakpoint

CREATE FUNCTION "openschool_private"."add_section_roster_member"(
  p_membership_id uuid,
  p_roster_key uuid,
  p_section_id uuid,
  p_school_enrollment_id uuid,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_reason text
)
RETURNS TABLE (
  membership_id uuid,
  status text,
  roster_count integer,
  capacity integer,
  capacity_exceeded boolean,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_section public.sections%ROWTYPE;
  v_enrollment public.school_enrollments%ROWTYPE;
  v_count integer;
  v_occurred_at timestamptz := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime' OR current_user <> 'openschool_section_manager'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.sections.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR v_tenant_id IS NULL OR v_account_id IS NULL OR p_membership_id IS NULL
    OR p_roster_key IS NULL OR p_section_id IS NULL OR p_school_enrollment_id IS NULL
    OR p_valid_from IS NULL OR p_valid_until <= p_valid_from
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
  THEN
    RAISE EXCEPTION 'SECTION_ROSTER_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT target.* INTO v_section FROM public.sections AS target
  WHERE target.tenant_id = v_tenant_id AND target.id = p_section_id AND target.status = 'active'
  FOR UPDATE;
  SELECT enrollment.* INTO v_enrollment FROM public.school_enrollments AS enrollment
  WHERE enrollment.tenant_id = v_tenant_id AND enrollment.id = p_school_enrollment_id
    AND enrollment.status = 'enrolled';
  IF v_section.id IS NULL OR v_enrollment.id IS NULL
    OR v_section.school_id <> v_enrollment.school_id
    OR NOT public.openschool_school_scope_allows(v_tenant_id, v_section.school_id)
    OR p_valid_from::date < v_section.start_date
    OR (p_valid_until IS NOT NULL AND p_valid_until::date > v_section.end_date + 1)
    OR p_valid_from < v_enrollment.valid_from
    OR (v_enrollment.valid_until IS NOT NULL AND COALESCE(p_valid_until, p_valid_from) > v_enrollment.valid_until)
  THEN
    RAISE EXCEPTION 'SECTION_ROSTER_PERIOD_INVALID' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.section_roster_memberships (
    id, tenant_id, school_id, section_id, person_id, school_enrollment_id, roster_key,
    version, status, valid_from, valid_until, issued_by_account_id, issuance_reason,
    created_at, updated_at
  ) VALUES (
    p_membership_id, v_tenant_id, v_section.school_id, p_section_id, v_enrollment.person_id,
    p_school_enrollment_id, p_roster_key, 1, 'active', p_valid_from, p_valid_until,
    v_account_id, btrim(p_reason), v_occurred_at, v_occurred_at
  );
  SELECT count(*)::integer INTO v_count FROM public.section_roster_memberships AS roster
  WHERE roster.tenant_id = v_tenant_id AND roster.section_id = p_section_id
    AND roster.status = 'active' AND roster.valid_from <= v_occurred_at
    AND (roster.valid_until IS NULL OR roster.valid_until > v_occurred_at);
  RETURN QUERY SELECT p_membership_id, 'active'::text, v_count, v_section.capacity,
    v_section.capacity IS NOT NULL AND v_count > v_section.capacity, v_occurred_at;
END
$$;
--> statement-breakpoint

CREATE FUNCTION "openschool_private"."end_section_staff_assignment"(
  p_assignment_id uuid, p_valid_until timestamptz, p_reason text
)
RETURNS TABLE (assignment_id uuid, status text, occurred_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_occurred_at timestamptz := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime' OR current_user <> 'openschool_section_manager'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.sections.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR v_tenant_id IS NULL OR v_account_id IS NULL OR p_assignment_id IS NULL
    OR p_valid_until IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
  THEN RAISE EXCEPTION 'SECTION_STAFF_END_CONTEXT_INVALID' USING ERRCODE = '22023'; END IF;
  UPDATE public.section_staff_assignments AS assignment
  SET status = 'ended', valid_until = p_valid_until, ended_by_account_id = v_account_id,
    end_reason = btrim(p_reason), updated_at = v_occurred_at
  WHERE assignment.tenant_id = v_tenant_id AND assignment.id = p_assignment_id
    AND assignment.status = 'active' AND p_valid_until > assignment.valid_from
    AND public.openschool_school_scope_allows(v_tenant_id, assignment.school_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'SECTION_STAFF_END_STATE_INVALID' USING ERRCODE = '55000'; END IF;
  RETURN QUERY SELECT p_assignment_id, 'ended'::text, v_occurred_at;
END $$;
--> statement-breakpoint

CREATE FUNCTION "openschool_private"."end_section_roster_membership"(
  p_membership_id uuid, p_valid_until timestamptz, p_reason text
)
RETURNS TABLE (membership_id uuid, status text, occurred_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_occurred_at timestamptz := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime' OR current_user <> 'openschool_section_manager'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.sections.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR v_tenant_id IS NULL OR v_account_id IS NULL OR p_membership_id IS NULL
    OR p_valid_until IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
  THEN RAISE EXCEPTION 'SECTION_ROSTER_END_CONTEXT_INVALID' USING ERRCODE = '22023'; END IF;
  UPDATE public.section_roster_memberships AS membership
  SET status = 'ended', valid_until = p_valid_until, ended_by_account_id = v_account_id,
    end_reason = btrim(p_reason), updated_at = v_occurred_at
  WHERE membership.tenant_id = v_tenant_id AND membership.id = p_membership_id
    AND membership.status = 'active' AND p_valid_until > membership.valid_from
    AND public.openschool_school_scope_allows(v_tenant_id, membership.school_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'SECTION_ROSTER_END_STATE_INVALID' USING ERRCODE = '55000'; END IF;
  RETURN QUERY SELECT p_membership_id, 'ended'::text, v_occurred_at;
END $$;
--> statement-breakpoint

CREATE FUNCTION "openschool_private"."close_section"(p_section_id uuid, p_reason text)
RETURNS TABLE (section_id uuid, status text, occurred_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_occurred_at timestamptz := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime' OR current_user <> 'openschool_section_manager'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.sections.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR v_tenant_id IS NULL OR v_account_id IS NULL OR p_section_id IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
  THEN RAISE EXCEPTION 'SECTION_CLOSE_CONTEXT_INVALID' USING ERRCODE = '22023'; END IF;
  UPDATE public.section_staff_assignments AS assignment
  SET status = 'ended',
    valid_until = greatest(v_occurred_at, assignment.valid_from + interval '1 microsecond'),
    ended_by_account_id = v_account_id, end_reason = btrim(p_reason),
    updated_at = v_occurred_at
  WHERE assignment.tenant_id = v_tenant_id AND assignment.section_id = p_section_id
    AND assignment.status = 'active';
  UPDATE public.section_roster_memberships AS membership
  SET status = 'ended',
    valid_until = greatest(v_occurred_at, membership.valid_from + interval '1 microsecond'),
    ended_by_account_id = v_account_id, end_reason = btrim(p_reason),
    updated_at = v_occurred_at
  WHERE membership.tenant_id = v_tenant_id AND membership.section_id = p_section_id
    AND membership.status = 'active';
  UPDATE public.sections AS section
  SET status = 'closed', version = section.version + 1, closed_at = v_occurred_at,
    closed_by_account_id = v_account_id, closure_reason = btrim(p_reason), updated_at = v_occurred_at
  WHERE section.tenant_id = v_tenant_id AND section.id = p_section_id
    AND section.status = 'active'
    AND public.openschool_school_scope_allows(v_tenant_id, section.school_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'SECTION_CLOSE_STATE_INVALID' USING ERRCODE = '55000'; END IF;
  RETURN QUERY SELECT p_section_id, 'closed'::text, v_occurred_at;
END $$;
--> statement-breakpoint

ALTER FUNCTION "openschool_private"."create_course"(uuid, uuid, text, text, text, text, text, numeric, text)
  OWNER TO "openschool_section_manager";
ALTER FUNCTION "openschool_private"."create_section"(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, date, date, integer, text)
  OWNER TO "openschool_section_manager";
ALTER FUNCTION "openschool_private"."assign_section_staff"(uuid, uuid, uuid, uuid, text, boolean, timestamptz, timestamptz, text)
  OWNER TO "openschool_section_manager";
ALTER FUNCTION "openschool_private"."add_section_roster_member"(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text)
  OWNER TO "openschool_section_manager";
ALTER FUNCTION "openschool_private"."end_section_staff_assignment"(uuid, timestamptz, text)
  OWNER TO "openschool_section_manager";
ALTER FUNCTION "openschool_private"."end_section_roster_membership"(uuid, timestamptz, text)
  OWNER TO "openschool_section_manager";
ALTER FUNCTION "openschool_private"."close_section"(uuid, text)
  OWNER TO "openschool_section_manager";
--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_private"."create_course"(uuid, uuid, text, text, text, text, text, numeric, text),
  "openschool_private"."create_section"(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, date, date, integer, text),
  "openschool_private"."assign_section_staff"(uuid, uuid, uuid, uuid, text, boolean, timestamptz, timestamptz, text),
  "openschool_private"."add_section_roster_member"(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text),
  "openschool_private"."end_section_staff_assignment"(uuid, timestamptz, text),
  "openschool_private"."end_section_roster_membership"(uuid, timestamptz, text),
  "openschool_private"."close_section"(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."create_course"(uuid, uuid, text, text, text, text, text, numeric, text),
  "openschool_private"."create_section"(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, date, date, integer, text),
  "openschool_private"."assign_section_staff"(uuid, uuid, uuid, uuid, text, boolean, timestamptz, timestamptz, text),
  "openschool_private"."add_section_roster_member"(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text),
  "openschool_private"."end_section_staff_assignment"(uuid, timestamptz, text),
  "openschool_private"."end_section_roster_membership"(uuid, timestamptz, text),
  "openschool_private"."close_section"(uuid, text) TO "openschool_runtime";
--> statement-breakpoint

REVOKE INSERT, UPDATE, DELETE ON TABLE "courses", "sections", "section_staff_assignments",
  "section_roster_memberships", "section_compatibility_evidence" FROM "openschool_runtime";
GRANT SELECT ON TABLE "courses", "sections", "section_staff_assignments",
  "section_roster_memberships", "section_compatibility_evidence" TO "openschool_runtime";
--> statement-breakpoint
DO $$
DECLARE unsafe_role boolean;
BEGIN
  SELECT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls
  INTO unsafe_role FROM pg_catalog.pg_roles WHERE rolname = 'openschool_section_manager';
  IF unsafe_role IS NULL OR unsafe_role THEN
    RAISE EXCEPTION 'Section manager role attributes are unsafe';
  END IF;
  IF pg_catalog.pg_has_role('openschool_runtime', 'openschool_section_manager', 'member')
    OR pg_catalog.pg_has_role('openschool_worker', 'openschool_section_manager', 'member')
    OR pg_catalog.pg_has_role('openschool_control_plane', 'openschool_section_manager', 'member')
  THEN RAISE EXCEPTION 'Execution roles must not assume the Section manager'; END IF;
END $$;
