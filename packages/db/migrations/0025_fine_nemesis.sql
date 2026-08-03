CREATE POLICY "provider_security_reconciliation_identity_resolver_select" ON "provider_security_reconciliation_outbox" AS PERMISSIVE FOR SELECT TO "openschool_provider_security_resolver" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_provider_security_resolver'
        AND EXISTS (
          SELECT 1 FROM public.accounts AS verified_account
          WHERE verified_account.id = "provider_security_reconciliation_outbox"."account_id"
            AND verified_account.identity_provider = nullif(current_setting('app.identity_provider', true), '')
            AND verified_account.provider_subject = nullif(current_setting('app.provider_subject', true), '')
        )
      );--> statement-breakpoint

CREATE FUNCTION "openschool_private"."is_provider_security_ready"(p_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  provider_security_ready boolean;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_provider_security_resolver'
    OR nullif(current_setting('app.identity_provider', true), '') IS NULL
    OR nullif(current_setting('app.provider_subject', true), '') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.accounts AS verified_account
      WHERE verified_account.id = p_account_id
        AND verified_account.identity_provider = nullif(current_setting('app.identity_provider', true), '')
        AND verified_account.provider_subject = nullif(current_setting('app.provider_subject', true), '')
    )
  THEN
    RAISE EXCEPTION 'PROVIDER_SECURITY_READINESS_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce((
    SELECT reconciliation.status = 'completed'
    FROM public.provider_security_reconciliation_outbox AS reconciliation
    WHERE reconciliation.account_id = p_account_id
      AND reconciliation.action = 'reset_mfa'
    ORDER BY reconciliation.expected_security_version DESC,
      reconciliation.created_at DESC,
      reconciliation.id DESC
    LIMIT 1
  ), true)
  INTO provider_security_ready;

  RETURN provider_security_ready;
END;
$$;--> statement-breakpoint

ALTER FUNCTION "openschool_private"."is_provider_security_ready"(uuid)
  OWNER TO "openschool_provider_security_resolver";--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."is_provider_security_ready"(uuid)
  FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."is_provider_security_ready"(uuid)
  TO "openschool_runtime";
