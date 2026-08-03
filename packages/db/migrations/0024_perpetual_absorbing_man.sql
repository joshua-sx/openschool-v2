CREATE TABLE "provider_security_reconciliation_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"action" text NOT NULL,
	"expected_security_version" bigint NOT NULL,
	"request_id" text NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"actor_person_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"deleted_factor_count" integer,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_security_reconciliation_effect_unique" UNIQUE("tenant_id","account_id","action","expected_security_version"),
	CONSTRAINT "provider_security_reconciliation_action_check" CHECK ("provider_security_reconciliation_outbox"."action" = 'reset_mfa'),
	CONSTRAINT "provider_security_reconciliation_version_check" CHECK ("provider_security_reconciliation_outbox"."expected_security_version" > 0),
	CONSTRAINT "provider_security_reconciliation_request_check" CHECK (char_length("provider_security_reconciliation_outbox"."request_id") BETWEEN 1 AND 512),
	CONSTRAINT "provider_security_reconciliation_attempt_check" CHECK ("provider_security_reconciliation_outbox"."attempt_count" >= 0),
	CONSTRAINT "provider_security_reconciliation_status_check" CHECK ("provider_security_reconciliation_outbox"."status" IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
	CONSTRAINT "provider_security_reconciliation_status_evidence_check" CHECK (("provider_security_reconciliation_outbox"."status" = 'pending' AND "provider_security_reconciliation_outbox"."attempt_count" = 0 AND "provider_security_reconciliation_outbox"."locked_at" IS NULL AND "provider_security_reconciliation_outbox"."completed_at" IS NULL AND "provider_security_reconciliation_outbox"."deleted_factor_count" IS NULL AND "provider_security_reconciliation_outbox"."last_error_code" IS NULL)
          OR ("provider_security_reconciliation_outbox"."status" = 'processing' AND "provider_security_reconciliation_outbox"."attempt_count" > 0 AND "provider_security_reconciliation_outbox"."locked_at" IS NOT NULL AND "provider_security_reconciliation_outbox"."completed_at" IS NULL AND "provider_security_reconciliation_outbox"."deleted_factor_count" IS NULL AND "provider_security_reconciliation_outbox"."last_error_code" IS NULL)
          OR ("provider_security_reconciliation_outbox"."status" = 'completed' AND "provider_security_reconciliation_outbox"."attempt_count" > 0 AND "provider_security_reconciliation_outbox"."locked_at" IS NULL AND "provider_security_reconciliation_outbox"."completed_at" IS NOT NULL AND "provider_security_reconciliation_outbox"."deleted_factor_count" >= 0 AND "provider_security_reconciliation_outbox"."last_error_code" IS NULL)
          OR ("provider_security_reconciliation_outbox"."status" = 'failed' AND "provider_security_reconciliation_outbox"."attempt_count" > 0 AND "provider_security_reconciliation_outbox"."locked_at" IS NULL AND "provider_security_reconciliation_outbox"."completed_at" IS NULL AND "provider_security_reconciliation_outbox"."deleted_factor_count" IS NULL AND "provider_security_reconciliation_outbox"."last_error_code" ~ '^[A-Z][A-Z0-9_]{2,63}$')
          OR ("provider_security_reconciliation_outbox"."status" = 'dead_letter' AND "provider_security_reconciliation_outbox"."attempt_count" > 0 AND "provider_security_reconciliation_outbox"."locked_at" IS NULL AND "provider_security_reconciliation_outbox"."completed_at" IS NULL AND "provider_security_reconciliation_outbox"."deleted_factor_count" IS NULL AND "provider_security_reconciliation_outbox"."last_error_code" ~ '^[A-Z][A-Z0-9_]{2,63}$'))
);
--> statement-breakpoint
ALTER TABLE "provider_security_reconciliation_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provider_security_reconciliation_outbox" ADD CONSTRAINT "provider_security_reconciliation_outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "provider_security_reconciliation_outbox" ADD CONSTRAINT "provider_security_reconciliation_outbox_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "provider_security_reconciliation_outbox" ADD CONSTRAINT "provider_security_reconciliation_outbox_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "provider_security_reconciliation_outbox" ADD CONSTRAINT "provider_security_reconciliation_actor_person_fk" FOREIGN KEY ("tenant_id","actor_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "provider_security_reconciliation_claim_idx" ON "provider_security_reconciliation_outbox" USING btree ("tenant_id","status","available_at","id");--> statement-breakpoint
CREATE POLICY "provider_security_reconciliation_revoker_insert" ON "provider_security_reconciliation_outbox" AS PERMISSIVE FOR INSERT TO "openschool_identity_revoker" WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_identity_revoker'
        AND "provider_security_reconciliation_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND "provider_security_reconciliation_outbox"."actor_account_id" = nullif(current_setting('app.account_id', true), '')::uuid
        AND "provider_security_reconciliation_outbox"."actor_person_id" = nullif(current_setting('app.person_id', true), '')::uuid
        AND "provider_security_reconciliation_outbox"."request_id" = nullif(current_setting('app.request_id', true), '')
      );--> statement-breakpoint
CREATE POLICY "provider_security_reconciliation_worker_select" ON "provider_security_reconciliation_outbox" AS PERMISSIVE FOR SELECT TO "openschool_worker" USING (
        "provider_security_reconciliation_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'provider_mfa_reconciliation'
        AND nullif(current_setting('app.job_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.request_id', true), '') IS NOT NULL
      );--> statement-breakpoint
CREATE POLICY "provider_security_reconciliation_worker_update" ON "provider_security_reconciliation_outbox" AS PERMISSIVE FOR UPDATE TO "openschool_worker" USING (
        "provider_security_reconciliation_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'provider_mfa_reconciliation'
        AND nullif(current_setting('app.job_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.request_id', true), '') IS NOT NULL
      ) WITH CHECK (
        "provider_security_reconciliation_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'provider_mfa_reconciliation'
        AND nullif(current_setting('app.job_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.request_id', true), '') IS NOT NULL
      );--> statement-breakpoint
CREATE POLICY "provider_security_reconciliation_resolver_select" ON "provider_security_reconciliation_outbox" AS PERMISSIVE FOR SELECT TO "openschool_provider_security_resolver" USING (
        session_user = 'openschool_worker'
        AND current_user = 'openschool_provider_security_resolver'
        AND "provider_security_reconciliation_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'provider_mfa_reconciliation'
        AND nullif(current_setting('app.job_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.request_id', true), '') IS NOT NULL
      );--> statement-breakpoint

ALTER TABLE "provider_security_reconciliation_outbox" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE FUNCTION "openschool_guard_provider_security_reconciliation_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.account_id IS DISTINCT FROM OLD.account_id
    OR NEW.action IS DISTINCT FROM OLD.action
    OR NEW.expected_security_version IS DISTINCT FROM OLD.expected_security_version
    OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.actor_account_id IS DISTINCT FROM OLD.actor_account_id
    OR NEW.actor_person_id IS DISTINCT FROM OLD.actor_person_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Provider security reconciliation anchors are immutable';
  END IF;

  IF OLD.status IN ('completed', 'dead_letter') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Terminal provider security reconciliation records are immutable';
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Provider security reconciliation time cannot move backwards';
  END IF;

  IF NEW.status = 'processing' AND OLD.status IN ('pending', 'failed', 'processing') THEN
    IF NEW.attempt_count <> OLD.attempt_count + 1
      OR NEW.available_at IS DISTINCT FROM OLD.available_at
    THEN
      RAISE EXCEPTION 'Invalid provider security reconciliation claim';
    END IF;
  ELSIF OLD.status = 'processing' AND NEW.status = 'completed' THEN
    IF NEW.attempt_count <> OLD.attempt_count
      OR NEW.available_at IS DISTINCT FROM OLD.available_at
    THEN
      RAISE EXCEPTION 'Invalid provider security reconciliation completion';
    END IF;
  ELSIF OLD.status = 'processing' AND NEW.status = 'failed' THEN
    IF NEW.attempt_count <> OLD.attempt_count OR NEW.available_at <= NEW.updated_at THEN
      RAISE EXCEPTION 'Invalid provider security reconciliation retry';
    END IF;
  ELSIF OLD.status = 'processing' AND NEW.status = 'dead_letter' THEN
    IF NEW.attempt_count <> OLD.attempt_count
      OR NEW.available_at IS DISTINCT FROM OLD.available_at
    THEN
      RAISE EXCEPTION 'Invalid provider security reconciliation dead letter';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid provider security reconciliation transition';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "provider_security_reconciliation_change_guard"
BEFORE UPDATE ON "provider_security_reconciliation_outbox"
FOR EACH ROW EXECUTE FUNCTION "openschool_guard_provider_security_reconciliation_change"();--> statement-breakpoint

CREATE FUNCTION "openschool_private"."apply_identity_revocation_with_reconciliation"(
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
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_identity_revoker'
  THEN
    RAISE EXCEPTION 'IDENTITY_REVOCATION_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH effects AS MATERIALIZED (
    SELECT *
    FROM openschool_private.apply_identity_revocation(p_action, p_target_id, p_reason)
  ), queued AS (
    INSERT INTO public.provider_security_reconciliation_outbox (
      tenant_id,
      account_id,
      action,
      expected_security_version,
      request_id,
      actor_account_id,
      actor_person_id
    )
    SELECT
      nullif(current_setting('app.tenant_id', true), '')::uuid,
      effect.affected_account_id,
      'reset_mfa',
      effect.security_version,
      nullif(current_setting('app.request_id', true), ''),
      nullif(current_setting('app.account_id', true), '')::uuid,
      nullif(current_setting('app.person_id', true), '')::uuid
    FROM effects AS effect
    WHERE p_action = 'account_mfa_reset'
  )
  SELECT
    effect.affected_account_id,
    effect.affected_session_id,
    effect.membership_version,
    effect.security_version,
    effect.affected_session_count,
    effect.occurred_at
  FROM effects AS effect;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."resolve_provider_mfa_reconciliation"(p_outbox_id uuid)
RETURNS TABLE (
  account_id uuid,
  identity_provider text,
  provider_subject text,
  expected_security_version bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  context_tenant_id uuid;
BEGIN
  BEGIN
    context_tenant_id := nullif(current_setting('app.tenant_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'PROVIDER_SECURITY_RECONCILIATION_CONTEXT_INVALID' USING ERRCODE = '22023';
  END;

  IF session_user <> 'openschool_worker'
    OR current_user <> 'openschool_provider_security_resolver'
    OR context_tenant_id IS NULL
    OR nullif(current_setting('app.job_type', true), '') <> 'provider_mfa_reconciliation'
    OR nullif(current_setting('app.job_id', true), '') IS NULL
    OR nullif(current_setting('app.request_id', true), '') IS NULL
  THEN
    RAISE EXCEPTION 'PROVIDER_SECURITY_RECONCILIATION_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    account.id,
    account.identity_provider,
    account.provider_subject,
    reconciliation.expected_security_version
  FROM public.provider_security_reconciliation_outbox AS reconciliation
  INNER JOIN public.accounts AS account ON account.id = reconciliation.account_id
  WHERE reconciliation.tenant_id = context_tenant_id
    AND reconciliation.id = p_outbox_id
    AND reconciliation.action = 'reset_mfa'
    AND reconciliation.status = 'processing'
    AND account.security_version >= reconciliation.expected_security_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROVIDER_SECURITY_RECONCILIATION_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;
END;
$$;--> statement-breakpoint

GRANT INSERT ON TABLE public.provider_security_reconciliation_outbox
  TO "openschool_identity_revoker";--> statement-breakpoint
GRANT SELECT ON TABLE public.accounts, public.provider_security_reconciliation_outbox
  TO "openschool_provider_security_resolver";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."apply_identity_revocation_with_reconciliation"(text, uuid, text)
  OWNER TO "openschool_identity_revoker";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."resolve_provider_mfa_reconciliation"(uuid)
  OWNER TO "openschool_provider_security_resolver";--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."apply_identity_revocation_with_reconciliation"(text, uuid, text)
  FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."resolve_provider_mfa_reconciliation"(uuid)
  FROM PUBLIC;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION "openschool_private"."apply_identity_revocation"(text, uuid, text)
  FROM "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."apply_identity_revocation_with_reconciliation"(text, uuid, text)
  TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."resolve_provider_mfa_reconciliation"(uuid)
  TO "openschool_worker";--> statement-breakpoint
REVOKE ALL ON TABLE public.provider_security_reconciliation_outbox
  FROM PUBLIC, "openschool_runtime", "openschool_control_plane";--> statement-breakpoint
GRANT SELECT, UPDATE ON TABLE public.provider_security_reconciliation_outbox
  TO "openschool_worker";
