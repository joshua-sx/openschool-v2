CREATE TABLE "platform_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"role_template_key" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"issuance_source" text NOT NULL,
	"issued_by_account_id" uuid,
	"issuance_reason" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_account_id" uuid,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_access_grants_role_check" CHECK ("platform_access_grants"."role_template_key" IN ('super_admin', 'support_agent')),
	CONSTRAINT "platform_access_grants_status_check" CHECK ("platform_access_grants"."status" IN ('active', 'revoked')),
	CONSTRAINT "platform_access_grants_issuance_source_check" CHECK ("platform_access_grants"."issuance_source" IN ('bootstrap', 'platform')),
	CONSTRAINT "platform_access_grants_period_check" CHECK ("platform_access_grants"."valid_until" > "platform_access_grants"."valid_from" AND "platform_access_grants"."valid_until" <= "platform_access_grants"."valid_from" + interval '90 days'),
	CONSTRAINT "platform_access_grants_reason_check" CHECK (char_length(btrim("platform_access_grants"."issuance_reason")) BETWEEN 3 AND 512 AND ("platform_access_grants"."revocation_reason" IS NULL OR char_length(btrim("platform_access_grants"."revocation_reason")) BETWEEN 3 AND 512)),
	CONSTRAINT "platform_access_grants_issuer_check" CHECK (("platform_access_grants"."issuance_source" = 'bootstrap' AND "platform_access_grants"."issued_by_account_id" IS NULL) OR ("platform_access_grants"."issuance_source" = 'platform' AND "platform_access_grants"."issued_by_account_id" IS NOT NULL)),
	CONSTRAINT "platform_access_grants_revocation_check" CHECK (("platform_access_grants"."status" = 'active' AND "platform_access_grants"."revoked_at" IS NULL AND "platform_access_grants"."revoked_by_account_id" IS NULL AND "platform_access_grants"."revocation_reason" IS NULL) OR ("platform_access_grants"."status" = 'revoked' AND "platform_access_grants"."revoked_at" IS NOT NULL AND "platform_access_grants"."revoked_by_account_id" IS NOT NULL AND "platform_access_grants"."revocation_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_actor_type_check";--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_source_check";--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_account_actor_check";--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_support_context_check";--> statement-breakpoint
ALTER TABLE "platform_access_grants" ADD CONSTRAINT "platform_access_grants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "platform_access_grants" ADD CONSTRAINT "platform_access_grants_issued_by_account_id_accounts_id_fk" FOREIGN KEY ("issued_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "platform_access_grants" ADD CONSTRAINT "platform_access_grants_revoked_by_account_id_accounts_id_fk" FOREIGN KEY ("revoked_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "platform_access_grants_account_status_idx" ON "platform_access_grants" USING btree ("account_id","status","valid_until","id");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_type_check" CHECK ("actor_type" IN ('account', 'worker', 'system', 'support', 'platform'));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_source_check" CHECK ("source" IN ('web', 'worker', 'migration', 'support', 'system', 'platform'));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_account_actor_check" CHECK (("actor_type" NOT IN ('account', 'support', 'platform')) OR ("actor_account_id" IS NOT NULL AND ("actor_type" = 'platform' OR "actor_person_id" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_support_context_check" CHECK (("actor_type" = 'support' AND "support_grant_id" IS NOT NULL AND "purpose" IS NOT NULL AND "source" = 'support') OR ("actor_type" <> 'support' AND "support_grant_id" IS NULL AND ("actor_type" <> 'platform' OR ("actor_person_id" IS NULL AND "source" = 'platform'))));--> statement-breakpoint

ALTER TABLE "platform_access_grants"
  ADD CONSTRAINT "platform_access_grants_no_active_overlap"
  EXCLUDE USING gist (
    "account_id" WITH =,
    tstzrange("valid_from", "valid_until", '[)') WITH &&
  ) WHERE ("status" = 'active');--> statement-breakpoint

CREATE FUNCTION "openschool_guard_platform_access_grant_transition"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD."account_id" IS DISTINCT FROM NEW."account_id"
    OR OLD."role_template_key" IS DISTINCT FROM NEW."role_template_key"
    OR OLD."valid_from" IS DISTINCT FROM NEW."valid_from"
    OR OLD."valid_until" IS DISTINCT FROM NEW."valid_until"
    OR OLD."issuance_source" IS DISTINCT FROM NEW."issuance_source"
    OR OLD."issued_by_account_id" IS DISTINCT FROM NEW."issued_by_account_id"
    OR OLD."issuance_reason" IS DISTINCT FROM NEW."issuance_reason"
    OR OLD."created_at" IS DISTINCT FROM NEW."created_at"
  THEN
    RAISE EXCEPTION 'Platform Access Grant anchors are immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD."status" = 'revoked' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Revoked Platform Access Grants are immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD."status" = 'active' AND NEW."status" <> 'revoked' THEN
    RAISE EXCEPTION 'Platform Access Grants may only transition from active to revoked'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."updated_at" < OLD."updated_at" THEN
    RAISE EXCEPTION 'Platform Access Grant update time cannot move backwards'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "platform_access_grants_transition_guard"
  BEFORE UPDATE ON "platform_access_grants"
  FOR EACH ROW EXECUTE FUNCTION "openschool_guard_platform_access_grant_transition"();--> statement-breakpoint

CREATE POLICY "audit_events_platform_lifecycle_insert"
  ON "audit_events" AS PERMISSIVE FOR INSERT TO "openschool_tenant_lifecycle_manager"
  WITH CHECK (
    session_user = 'openschool_control_plane'
    AND current_user = 'openschool_tenant_lifecycle_manager'
    AND "audit_events"."tenant_id" = nullif(current_setting('app.target_tenant_id', true), '')::uuid
    AND "audit_events"."actor_type" = 'platform'
    AND "audit_events"."actor_account_id" = nullif(current_setting('app.account_id', true), '')::uuid
    AND "audit_events"."actor_person_id" IS NULL
    AND "audit_events"."request_id" = nullif(current_setting('app.request_id', true), '')
    AND "audit_events"."correlation_id" = nullif(current_setting('app.correlation_id', true), '')
    AND "audit_events"."capability" = 'platform.tenants.manage'
    AND "audit_events"."source" = 'platform'
    AND "audit_events"."target_type" = 'tenant'
  );--> statement-breakpoint

CREATE POLICY "audit_outbox_platform_lifecycle_insert"
  ON "audit_outbox" AS PERMISSIVE FOR INSERT TO "openschool_tenant_lifecycle_manager"
  WITH CHECK (
    session_user = 'openschool_control_plane'
    AND current_user = 'openschool_tenant_lifecycle_manager'
    AND "audit_outbox"."tenant_id" = nullif(current_setting('app.target_tenant_id', true), '')::uuid
    AND "audit_outbox"."context" ->> 'actorAccountId' = nullif(current_setting('app.account_id', true), '')
    AND "audit_outbox"."context" ->> 'actorPersonId' IS NULL
    AND "audit_outbox"."context" ->> 'requestId' = nullif(current_setting('app.request_id', true), '')
    AND "audit_outbox"."correlation_id" = nullif(current_setting('app.correlation_id', true), '')
    AND "audit_outbox"."payload" ->> 'eventType' IN ('platform.tenant.suspend', 'platform.tenant.reactivate')
  );--> statement-breakpoint

CREATE FUNCTION "openschool_private"."resolve_platform_access"()
RETURNS TABLE (
  account_id uuid,
  account_session_id uuid,
  security_version bigint,
  platform_access_grant_id uuid,
  role_template_key text,
  assurance_level text,
  reauthenticated_at timestamp with time zone,
  expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  context_identity_provider text := nullif(current_setting('app.identity_provider', true), '');
  context_provider_subject text := nullif(current_setting('app.provider_subject', true), '');
  context_provider_session_id text := nullif(current_setting('app.provider_session_id', true), '');
  context_request_id text := nullif(current_setting('app.request_id', true), '');
  context_assurance_level text := nullif(current_setting('app.assurance_level', true), '');
  context_reauthenticated_at timestamp with time zone;
  context_reauthenticated_at_text text := nullif(current_setting('app.reauthenticated_at', true), '');
  resolved_at timestamp with time zone := statement_timestamp();
BEGIN
  BEGIN
    context_reauthenticated_at := context_reauthenticated_at_text::timestamp with time zone;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'PLATFORM_ACCESS_CONTEXT_INVALID' USING ERRCODE = '22023';
  END;

  IF session_user <> 'openschool_control_plane'
    OR current_user <> 'openschool_platform_access_resolver'
    OR context_identity_provider IS NULL
    OR context_provider_subject IS NULL
    OR context_provider_session_id IS NULL
    OR context_request_id IS NULL
    OR context_assurance_level NOT IN ('aal1', 'aal2')
    OR char_length(context_request_id) > 512
  THEN
    RAISE EXCEPTION 'PLATFORM_ACCESS_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    account.id,
    account_session.id,
    account.security_version,
    platform_grant.id,
    platform_grant.role_template_key,
    account_session.assurance_level,
    context_reauthenticated_at,
    least(account_session.expires_at, platform_grant.valid_until)
  FROM public.accounts AS account
  INNER JOIN public.account_sessions AS account_session
    ON account_session.account_id = account.id
    AND account_session.provider_session_id = context_provider_session_id
    AND account_session.status = 'active'
    AND account_session.security_version = account.security_version
    AND account_session.assurance_level = context_assurance_level
    AND account_session.expires_at > resolved_at
    AND account_session.reauthenticated_at IS NOT DISTINCT FROM context_reauthenticated_at
  INNER JOIN public.platform_access_grants AS platform_grant
    ON platform_grant.account_id = account.id
    AND platform_grant.status = 'active'
    AND platform_grant.valid_from <= resolved_at
    AND platform_grant.valid_until > resolved_at
  WHERE account.identity_provider = context_identity_provider
    AND account.provider_subject = context_provider_subject
    AND account.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLATFORM_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."apply_tenant_lifecycle"(
  p_action text,
  p_target_tenant_id uuid,
  p_reason text
)
RETURNS TABLE (
  tenant_id uuid,
  tenant_status text,
  audit_event_id uuid,
  outbox_id uuid,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  actor_account_id uuid;
  actor_session_id text;
  actor_security_version bigint;
  actor_platform_grant_id uuid;
  verified_reauthenticated_at timestamp with time zone;
  reauthenticated_at_text text;
  context_request_id text := nullif(current_setting('app.request_id', true), '');
  context_correlation_id text := nullif(current_setting('app.correlation_id', true), '');
  normalized_reason text := btrim(p_reason);
  changed_at timestamp with time zone := statement_timestamp();
  target_tenant public.tenants%ROWTYPE;
  event_id uuid := gen_random_uuid();
  pending_outbox_id uuid := gen_random_uuid();
  next_status text;
  event_type text;
BEGIN
  BEGIN
    actor_account_id := nullif(current_setting('app.account_id', true), '')::uuid;
    actor_session_id := nullif(current_setting('app.session_id', true), '');
    actor_security_version := nullif(current_setting('app.security_version', true), '')::bigint;
    actor_platform_grant_id := nullif(current_setting('app.platform_access_grant_id', true), '')::uuid;
    reauthenticated_at_text := nullif(current_setting('app.reauthenticated_at', true), '');
    verified_reauthenticated_at := reauthenticated_at_text::timestamp with time zone;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'TENANT_LIFECYCLE_CONTEXT_INVALID' USING ERRCODE = '22023';
  END;

  IF session_user <> 'openschool_control_plane'
    OR current_user <> 'openschool_tenant_lifecycle_manager'
    OR actor_account_id IS NULL
    OR actor_session_id IS NULL
    OR actor_security_version IS NULL
    OR actor_platform_grant_id IS NULL
    OR context_request_id IS NULL
    OR context_correlation_id IS NULL
    OR char_length(context_request_id) > 512
    OR char_length(context_correlation_id) > 512
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.platform_role_template_key', true), '') <> 'super_admin'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'platform.tenants.manage'
    OR nullif(current_setting('app.policy_version', true), '') IS NULL
    OR nullif(current_setting('app.policy_constraints', true), '') IS NULL
    OR nullif(current_setting('app.policy_constraints', true), '')::jsonb <> '[{"kind":"platform"}]'::jsonb
    OR verified_reauthenticated_at IS NULL
    OR verified_reauthenticated_at < changed_at - interval '15 minutes'
    OR verified_reauthenticated_at > changed_at + interval '1 minute'
    OR normalized_reason IS NULL
    OR char_length(normalized_reason) NOT BETWEEN 3 AND 512
    OR p_action NOT IN ('suspend', 'reactivate')
  THEN
    RAISE EXCEPTION 'TENANT_LIFECYCLE_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.accounts AS account
  WHERE account.id = actor_account_id
    AND account.status = 'active'
    AND account.security_version = actor_security_version
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_LIFECYCLE_CONTEXT_STALE' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1
  FROM public.account_sessions AS account_session
  WHERE account_session.account_id = actor_account_id
    AND account_session.provider_session_id = actor_session_id
    AND account_session.status = 'active'
    AND account_session.security_version = actor_security_version
    AND account_session.assurance_level = 'aal2'
    AND account_session.reauthenticated_at = verified_reauthenticated_at
    AND account_session.expires_at > changed_at
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_LIFECYCLE_CONTEXT_STALE' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1
  FROM public.platform_access_grants AS platform_grant
  WHERE platform_grant.id = actor_platform_grant_id
    AND platform_grant.account_id = actor_account_id
    AND platform_grant.role_template_key = 'super_admin'
    AND platform_grant.status = 'active'
    AND platform_grant.valid_from <= changed_at
    AND platform_grant.valid_until > changed_at
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_LIFECYCLE_CONTEXT_STALE' USING ERRCODE = 'P0001';
  END IF;

  SELECT candidate.* INTO target_tenant
  FROM public.tenants AS candidate
  WHERE candidate.id = p_target_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR target_tenant.status = 'archived' THEN
    RAISE EXCEPTION 'TENANT_LIFECYCLE_TARGET_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  IF (p_action = 'suspend' AND target_tenant.status <> 'active')
    OR (p_action = 'reactivate' AND target_tenant.status <> 'suspended')
  THEN
    RAISE EXCEPTION 'TENANT_LIFECYCLE_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  next_status := CASE WHEN p_action = 'suspend' THEN 'suspended' ELSE 'active' END;
  event_type := CASE
    WHEN p_action = 'suspend' THEN 'platform.tenant.suspend'
    ELSE 'platform.tenant.reactivate'
  END;

  PERFORM set_config('app.target_tenant_id', p_target_tenant_id::text, true);

  UPDATE public.tenants
  SET status = next_status, updated_at = changed_at
  WHERE tenants.id = p_target_tenant_id;

  INSERT INTO public.audit_events (
    id, occurred_at, event_version, event_type, outcome, tenant_id,
    actor_type, actor_account_id, actor_person_id, capability, policy_version,
    policy_decision, request_id, correlation_id, target_type, target_id,
    data_classes, change_summary, purpose, source, retention_class,
    content_hash, created_at
  ) VALUES (
    event_id, changed_at, 1, event_type, 'succeeded', p_target_tenant_id,
    'platform', actor_account_id, NULL, 'platform.tenants.manage',
    nullif(current_setting('app.policy_version', true), ''),
    jsonb_build_object('effect', 'allow', 'queryConstraints', '[{"kind":"platform"}]'::jsonb),
    context_request_id, context_correlation_id, 'tenant', p_target_tenant_id::text,
    '["internal"]'::jsonb,
    jsonb_build_object('changedFields', jsonb_build_array('status')),
    'platform_tenant_lifecycle', 'platform', 'security', 'pending', changed_at
  );

  INSERT INTO public.audit_outbox (
    id, tenant_id, audit_event_id, audit_event_occurred_at, topic,
    deduplication_key, correlation_id, context, payload, payload_hash,
    status, attempt_count, available_at, created_at, updated_at
  ) VALUES (
    pending_outbox_id, p_target_tenant_id, event_id, changed_at,
    'security.context.invalidate',
    event_type || ':' || p_target_tenant_id::text || ':' || context_request_id,
    context_correlation_id,
    jsonb_build_object(
      'tenantId', p_target_tenant_id,
      'requestId', context_request_id,
      'correlationId', context_correlation_id,
      'actorAccountId', actor_account_id
    ),
    jsonb_build_object(
      'auditEventId', event_id,
      'eventVersion', 1,
      'eventType', event_type,
      'outcome', 'succeeded',
      'targetType', 'tenant',
      'targetId', p_target_tenant_id,
      'tenantStatus', next_status
    ),
    'pending', 'pending', 0, changed_at, changed_at, changed_at
  );

  RETURN QUERY SELECT p_target_tenant_id, next_status, event_id, pending_outbox_id, changed_at;
END;
$$;--> statement-breakpoint

GRANT SELECT ON TABLE public.accounts, public.account_sessions, public.platform_access_grants
  TO "openschool_platform_access_resolver";--> statement-breakpoint

GRANT SELECT ON TABLE
  public.accounts, public.account_sessions, public.platform_access_grants, public.tenants
  TO "openschool_tenant_lifecycle_manager";--> statement-breakpoint
GRANT UPDATE (updated_at) ON TABLE
  public.accounts, public.account_sessions, public.platform_access_grants
  TO "openschool_tenant_lifecycle_manager";--> statement-breakpoint
GRANT UPDATE (status, updated_at) ON TABLE public.tenants
  TO "openschool_tenant_lifecycle_manager";--> statement-breakpoint
GRANT INSERT ON TABLE public.audit_events, public.audit_outbox
  TO "openschool_tenant_lifecycle_manager";--> statement-breakpoint

GRANT USAGE, CREATE ON SCHEMA "openschool_private"
  TO "openschool_platform_access_resolver", "openschool_tenant_lifecycle_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."resolve_platform_access"()
  OWNER TO "openschool_platform_access_resolver";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."apply_tenant_lifecycle"(text, uuid, text)
  OWNER TO "openschool_tenant_lifecycle_manager";--> statement-breakpoint
REVOKE CREATE ON SCHEMA "openschool_private"
  FROM "openschool_platform_access_resolver", "openschool_tenant_lifecycle_manager";--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_private"."resolve_platform_access"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."apply_tenant_lifecycle"(text, uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA "openschool_private" TO "openschool_control_plane";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."resolve_platform_access"()
  TO "openschool_control_plane";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."apply_tenant_lifecycle"(text, uuid, text)
  TO "openschool_control_plane";--> statement-breakpoint

REVOKE ALL ON TABLE public.platform_access_grants
  FROM PUBLIC, "openschool_runtime", "openschool_worker", "openschool_control_plane";--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_guard_platform_access_grant_transition"() FROM PUBLIC;
