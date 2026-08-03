ALTER TABLE "account_sessions" ADD COLUMN "reauthenticated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_reauthentication_time_check" CHECK ("account_sessions"."reauthenticated_at" IS NULL OR "account_sessions"."reauthenticated_at" < "account_sessions"."expires_at") NOT VALID;--> statement-breakpoint
ALTER TABLE "account_sessions" VALIDATE CONSTRAINT "account_sessions_reauthentication_time_check";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "openschool_guard_account_session_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" IN ('revoked', 'expired') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'inactive Account Session records are immutable';
  END IF;

  IF OLD."status" = 'active' AND NEW."status" = 'revoked' AND (
    NEW."revoked_at" IS NULL OR
    NEW."revocation_reason" IS NULL OR
    btrim(NEW."revocation_reason") = ''
  ) THEN
    RAISE EXCEPTION 'revoked Account Sessions require timestamped, non-empty evidence';
  END IF;

  IF NEW."reauthenticated_at" IS DISTINCT FROM OLD."reauthenticated_at" AND (
    NEW."reauthenticated_at" IS NULL OR
    (OLD."reauthenticated_at" IS NOT NULL AND NEW."reauthenticated_at" < OLD."reauthenticated_at")
  ) THEN
    RAISE EXCEPTION 'Account Session reauthentication evidence cannot move backwards';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."apply_identity_revocation"(
  p_action text,
  p_target_id uuid,
  p_reason text
)
RETURNS TABLE (
  affected_account_id uuid,
  affected_session_id uuid,
  membership_version bigint,
  security_version bigint,
  affected_session_count bigint,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  actor_account_id uuid;
  actor_person_id uuid;
  context_tenant_id uuid;
  context_session_id text;
  context_security_version bigint;
  verified_reauthenticated_at timestamp with time zone;
  reauthenticated_at_text text;
  normalized_reason text := btrim(p_reason);
  target_account public.accounts%ROWTYPE;
  target_session public.account_sessions%ROWTYPE;
  target_affiliation public.affiliations%ROWTYPE;
  target_role public.role_template_assignments%ROWTYPE;
  target_person_id uuid;
  session_count bigint := 0;
  changed_at timestamp with time zone := statement_timestamp();
BEGIN
  BEGIN
    actor_account_id := nullif(current_setting('app.account_id', true), '')::uuid;
    actor_person_id := nullif(current_setting('app.person_id', true), '')::uuid;
    context_tenant_id := nullif(current_setting('app.tenant_id', true), '')::uuid;
    context_session_id := nullif(current_setting('app.session_id', true), '');
    context_security_version := nullif(current_setting('app.security_version', true), '')::bigint;
    reauthenticated_at_text := nullif(current_setting('app.reauthenticated_at', true), '');
    verified_reauthenticated_at := reauthenticated_at_text::timestamp with time zone;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'IDENTITY_REVOCATION_CONTEXT_INVALID' USING ERRCODE = '22023';
  END;

  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_identity_revoker'
    OR actor_account_id IS NULL
    OR actor_person_id IS NULL
    OR context_tenant_id IS NULL
    OR context_session_id IS NULL
    OR context_security_version IS NULL
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.accounts.manage'
    OR nullif(current_setting('app.policy_version', true), '') IS NULL
    OR jsonb_array_length(public.openschool_policy_constraints()) < 1
    OR verified_reauthenticated_at IS NULL
    OR verified_reauthenticated_at < changed_at - interval '15 minutes'
    OR verified_reauthenticated_at > changed_at + interval '1 minute'
    OR normalized_reason IS NULL
    OR char_length(normalized_reason) NOT BETWEEN 3 AND 512
    OR p_action NOT IN (
      'account_session_revoke',
      'account_sessions_revoke',
      'account_disable',
      'account_mfa_reset',
      'affiliation_revoke',
      'role_revoke'
    )
  THEN
    RAISE EXCEPTION 'IDENTITY_REVOCATION_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.accounts AS actor
    INNER JOIN public.account_sessions AS actor_session
      ON actor_session.account_id = actor.id
      AND actor_session.provider_session_id = context_session_id
      AND actor_session.status = 'active'
      AND actor_session.security_version = actor.security_version
      AND actor_session.assurance_level = 'aal2'
      AND actor_session.reauthenticated_at = verified_reauthenticated_at
      AND actor_session.expires_at > changed_at
    INNER JOIN public.account_links AS actor_link
      ON actor_link.account_id = actor.id
      AND actor_link.tenant_id = context_tenant_id
      AND actor_link.person_id = actor_person_id
      AND actor_link.status = 'active'
      AND actor_link.valid_from <= changed_at
      AND (actor_link.valid_until IS NULL OR actor_link.valid_until > changed_at)
    WHERE actor.id = actor_account_id
      AND actor.status = 'active'
      AND actor.security_version = context_security_version
  ) THEN
    RAISE EXCEPTION 'IDENTITY_REVOCATION_CONTEXT_STALE' USING ERRCODE = 'P0001';
  END IF;

  IF p_action IN (
    'account_session_revoke',
    'account_sessions_revoke',
    'account_disable',
    'account_mfa_reset'
  ) THEN
    IF p_action = 'account_session_revoke' THEN
      SELECT candidate.* INTO target_session
      FROM public.account_sessions AS candidate
      WHERE candidate.id = p_target_id
      FOR UPDATE;
      IF NOT FOUND OR target_session.status <> 'active' OR target_session.expires_at <= changed_at THEN
        RAISE EXCEPTION 'IDENTITY_REVOCATION_TARGET_UNAVAILABLE' USING ERRCODE = 'P0001';
      END IF;
      SELECT account.* INTO target_account
      FROM public.accounts AS account
      WHERE account.id = target_session.account_id
      FOR UPDATE;
    ELSE
      SELECT account.* INTO target_account
      FROM public.accounts AS account
      WHERE account.id = p_target_id
      FOR UPDATE;
    END IF;

    IF NOT FOUND OR target_account.status <> 'active' THEN
      RAISE EXCEPTION 'IDENTITY_REVOCATION_TARGET_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;

    SELECT link.person_id INTO target_person_id
    FROM public.account_links AS link
    WHERE link.account_id = target_account.id
      AND link.tenant_id = context_tenant_id
      AND link.status = 'active'
      AND link.valid_from <= changed_at
      AND (link.valid_until IS NULL OR link.valid_until > changed_at);

    IF NOT FOUND
      OR EXISTS (
        SELECT 1 FROM public.account_links AS other_link
        WHERE other_link.account_id = target_account.id
          AND other_link.tenant_id <> context_tenant_id
          AND other_link.status = 'active'
          AND other_link.valid_from <= changed_at
          AND (other_link.valid_until IS NULL OR other_link.valid_until > changed_at)
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.affiliations AS target_scope
        WHERE target_scope.tenant_id = context_tenant_id
          AND target_scope.person_id = target_person_id
          AND target_scope.status = 'active'
          AND target_scope.valid_from <= changed_at
          AND (target_scope.valid_until IS NULL OR target_scope.valid_until > changed_at)
      )
      OR EXISTS (
        SELECT 1 FROM public.affiliations AS target_scope
        WHERE target_scope.tenant_id = context_tenant_id
          AND target_scope.person_id = target_person_id
          AND target_scope.status = 'active'
          AND target_scope.valid_from <= changed_at
          AND (target_scope.valid_until IS NULL OR target_scope.valid_until > changed_at)
          AND NOT public.openschool_invitation_scope_allows(
            target_scope.tenant_id,
            target_scope.scope_type,
            target_scope.education_organization_id,
            target_scope.school_id,
            target_scope.class_id
          )
      )
    THEN
      RAISE EXCEPTION 'IDENTITY_REVOCATION_TARGET_OUT_OF_SCOPE' USING ERRCODE = '42501';
    END IF;

    IF p_action = 'account_disable' AND target_account.id = actor_account_id THEN
      RAISE EXCEPTION 'IDENTITY_REVOCATION_SELF_DISABLE_DENIED' USING ERRCODE = '42501';
    END IF;

    IF p_action = 'account_session_revoke' THEN
      UPDATE public.account_sessions
      SET status = 'revoked',
        revoked_at = changed_at,
        revoked_by_account_id = actor_account_id,
        revocation_reason = normalized_reason,
        updated_at = changed_at
      WHERE account_sessions.id = target_session.id
        AND account_sessions.status = 'active';
      GET DIAGNOSTICS session_count = ROW_COUNT;
      IF session_count <> 1 THEN
        RAISE EXCEPTION 'IDENTITY_REVOCATION_TARGET_UNAVAILABLE' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      UPDATE public.accounts
      SET status = CASE WHEN p_action = 'account_disable' THEN 'disabled' ELSE accounts.status END,
        disabled_at = CASE WHEN p_action = 'account_disable' THEN changed_at ELSE accounts.disabled_at END,
        disabled_reason = CASE WHEN p_action = 'account_disable' THEN normalized_reason ELSE accounts.disabled_reason END,
        security_version = accounts.security_version + 1,
        updated_at = changed_at
      WHERE accounts.id = target_account.id
      RETURNING * INTO target_account;

      UPDATE public.account_sessions
      SET status = 'revoked',
        revoked_at = changed_at,
        revoked_by_account_id = actor_account_id,
        revocation_reason = normalized_reason,
        updated_at = changed_at
      WHERE account_sessions.account_id = target_account.id
        AND account_sessions.status = 'active';
      GET DIAGNOSTICS session_count = ROW_COUNT;
    END IF;

    RETURN QUERY SELECT
      target_account.id,
      CASE WHEN p_action = 'account_session_revoke' THEN target_session.id ELSE NULL::uuid END,
      target_account.membership_version,
      target_account.security_version,
      session_count,
      changed_at;
    RETURN;
  END IF;

  IF p_action = 'affiliation_revoke' THEN
    SELECT affiliation.* INTO target_affiliation
    FROM public.affiliations AS affiliation
    WHERE affiliation.tenant_id = context_tenant_id
      AND affiliation.id = p_target_id
      AND affiliation.status = 'active'
      AND affiliation.valid_from <= changed_at
      AND (affiliation.valid_until IS NULL OR affiliation.valid_until > changed_at)
    FOR UPDATE;

    IF NOT FOUND OR NOT public.openschool_invitation_scope_allows(
      target_affiliation.tenant_id,
      target_affiliation.scope_type,
      target_affiliation.education_organization_id,
      target_affiliation.school_id,
      target_affiliation.class_id
    ) THEN
      RAISE EXCEPTION 'IDENTITY_REVOCATION_TARGET_OUT_OF_SCOPE' USING ERRCODE = '42501';
    END IF;

    UPDATE public.role_template_assignments
    SET status = 'revoked',
      valid_until = greatest(changed_at, role_template_assignments.valid_from + interval '1 microsecond'),
      revoked_at = changed_at,
      revoked_by_account_id = actor_account_id,
      revocation_reason = normalized_reason,
      updated_at = changed_at
    WHERE role_template_assignments.tenant_id = target_affiliation.tenant_id
      AND role_template_assignments.affiliation_id = target_affiliation.id
      AND role_template_assignments.status = 'active';

    UPDATE public.affiliations
    SET status = 'revoked',
      valid_until = greatest(changed_at, affiliations.valid_from + interval '1 microsecond'),
      revoked_at = changed_at,
      revoked_by_account_id = actor_account_id,
      revocation_reason = normalized_reason,
      updated_at = changed_at
    WHERE affiliations.tenant_id = target_affiliation.tenant_id
      AND affiliations.id = target_affiliation.id;

    RETURN QUERY
    WITH updated_accounts AS (
      UPDATE public.accounts AS account
      SET membership_version = account.membership_version + 1,
        updated_at = changed_at
      WHERE account.id IN (
        SELECT link.account_id
        FROM public.account_links AS link
        WHERE link.tenant_id = target_affiliation.tenant_id
          AND link.person_id = target_affiliation.person_id
          AND link.status = 'active'
          AND link.valid_from <= changed_at
          AND (link.valid_until IS NULL OR link.valid_until > changed_at)
      )
      RETURNING account.id, account.membership_version, account.security_version
    )
    SELECT updated.id, NULL::uuid, updated.membership_version, updated.security_version,
      0::bigint, changed_at
    FROM updated_accounts AS updated;
    RETURN;
  END IF;

  SELECT assignment.* INTO target_role
  FROM public.role_template_assignments AS assignment
  INNER JOIN public.affiliations AS affiliation
    ON affiliation.tenant_id = assignment.tenant_id
    AND affiliation.id = assignment.affiliation_id
  WHERE assignment.tenant_id = context_tenant_id
    AND assignment.id = p_target_id
    AND assignment.status = 'active'
    AND assignment.valid_from <= changed_at
    AND (assignment.valid_until IS NULL OR assignment.valid_until > changed_at)
    AND affiliation.status = 'active'
    AND affiliation.valid_from <= changed_at
    AND (affiliation.valid_until IS NULL OR affiliation.valid_until > changed_at)
    AND public.openschool_invitation_scope_allows(
      affiliation.tenant_id,
      affiliation.scope_type,
      affiliation.education_organization_id,
      affiliation.school_id,
      affiliation.class_id
    )
  FOR UPDATE OF assignment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDENTITY_REVOCATION_TARGET_OUT_OF_SCOPE' USING ERRCODE = '42501';
  END IF;

  UPDATE public.role_template_assignments
  SET status = 'revoked',
    valid_until = greatest(changed_at, role_template_assignments.valid_from + interval '1 microsecond'),
    revoked_at = changed_at,
    revoked_by_account_id = actor_account_id,
    revocation_reason = normalized_reason,
    updated_at = changed_at
  WHERE role_template_assignments.tenant_id = target_role.tenant_id
    AND role_template_assignments.id = target_role.id;

  RETURN QUERY
  WITH target_person AS (
    SELECT affiliation.person_id
    FROM public.affiliations AS affiliation
    WHERE affiliation.tenant_id = target_role.tenant_id
      AND affiliation.id = target_role.affiliation_id
  ), updated_accounts AS (
    UPDATE public.accounts AS account
    SET membership_version = account.membership_version + 1,
      updated_at = changed_at
    WHERE account.id IN (
      SELECT link.account_id
      FROM public.account_links AS link
      CROSS JOIN target_person
      WHERE link.tenant_id = target_role.tenant_id
        AND link.person_id = target_person.person_id
        AND link.status = 'active'
        AND link.valid_from <= changed_at
        AND (link.valid_until IS NULL OR link.valid_until > changed_at)
    )
    RETURNING account.id, account.membership_version, account.security_version
  )
  SELECT updated.id, NULL::uuid, updated.membership_version, updated.security_version,
    0::bigint, changed_at
  FROM updated_accounts AS updated;
END;
$$;--> statement-breakpoint

GRANT SELECT ON TABLE
  public.accounts,
  public.account_sessions,
  public.account_links,
  public.people,
  public.affiliations,
  public.role_template_assignments,
  public.organization_tree_versions,
  public.organization_tree_closure,
  public.school_governance_assignments,
  public.schools,
  public.classes
  TO "openschool_identity_revoker";--> statement-breakpoint
GRANT UPDATE (status, disabled_at, disabled_reason, membership_version, security_version, updated_at)
  ON TABLE public.accounts TO "openschool_identity_revoker";--> statement-breakpoint
GRANT UPDATE (status, revoked_at, revoked_by_account_id, revocation_reason, updated_at)
  ON TABLE public.account_sessions TO "openschool_identity_revoker";--> statement-breakpoint
GRANT UPDATE (status, valid_until, revoked_at, revoked_by_account_id, revocation_reason, updated_at)
  ON TABLE public.affiliations, public.role_template_assignments
  TO "openschool_identity_revoker";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.openschool_policy_constraints()
  TO "openschool_identity_revoker";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.openschool_school_scope_allows(uuid, uuid)
  TO "openschool_identity_revoker";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.openschool_invitation_scope_allows(uuid, text, uuid, uuid, uuid)
  TO "openschool_identity_revoker";--> statement-breakpoint
CREATE POLICY "schools_identity_revoker_select" ON "schools" AS PERMISSIVE FOR SELECT TO "openschool_identity_revoker" USING (
  "schools"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.accounts.manage'
  AND nullif(current_setting('app.assurance_level', true), '') = 'aal2'
);--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA "openschool_private"
  TO "openschool_identity_revoker";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."apply_identity_revocation"(text, uuid, text)
  OWNER TO "openschool_identity_revoker";--> statement-breakpoint
REVOKE CREATE ON SCHEMA "openschool_private"
  FROM "openschool_identity_revoker";--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."apply_identity_revocation"(text, uuid, text)
  FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA "openschool_private" TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."apply_identity_revocation"(text, uuid, text)
  TO "openschool_runtime";
