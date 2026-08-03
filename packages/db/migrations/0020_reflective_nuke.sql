CREATE TABLE "invitation_acceptance_rate_limits" (
	"key_hash" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_acceptance_rate_limits_pkey" PRIMARY KEY("key_hash"),
	CONSTRAINT "invitation_acceptance_rate_limits_key_check" CHECK ("invitation_acceptance_rate_limits"."key_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "invitation_acceptance_rate_limits_count_check" CHECK ("invitation_acceptance_rate_limits"."attempt_count" BETWEEN 1 AND 1000000),
	CONSTRAINT "invitation_acceptance_rate_limits_time_check" CHECK ("invitation_acceptance_rate_limits"."updated_at" >= "invitation_acceptance_rate_limits"."window_started_at")
);
--> statement-breakpoint
ALTER TABLE "invitation_acceptance_rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitation_acceptance_rate_limits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account_invitations" DROP CONSTRAINT "account_invitations_roles_check";--> statement-breakpoint
ALTER TABLE "invitation_delivery_outbox" DROP CONSTRAINT "invitation_delivery_encryption_check";--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_affiliation_kind_check" CHECK ("account_invitations"."affiliation_kind" IN ('student', 'guardian', 'employee', 'teacher', 'administrator', 'member'));--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_roles_check" CHECK (jsonb_typeof("account_invitations"."role_template_keys") = 'array'
          AND jsonb_array_length("account_invitations"."role_template_keys") = 1
          AND NOT jsonb_path_exists("account_invitations"."role_template_keys", '$[*] ? (@.type() != "string")')
          AND (
            ("account_invitations"."scope_type" = 'education_organization' AND "account_invitations"."affiliation_kind" = 'administrator' AND "account_invitations"."role_template_keys" = '["org_admin"]'::jsonb)
            OR ("account_invitations"."scope_type" = 'education_organization' AND "account_invitations"."affiliation_kind" = 'member' AND "account_invitations"."role_template_keys" = '["org_viewer"]'::jsonb)
            OR ("account_invitations"."scope_type" = 'school' AND "account_invitations"."affiliation_kind" = 'administrator' AND "account_invitations"."role_template_keys" = '["school_admin"]'::jsonb)
            OR ("account_invitations"."scope_type" = 'school' AND "account_invitations"."affiliation_kind" = 'employee' AND "account_invitations"."role_template_keys" = '["staff"]'::jsonb)
            OR ("account_invitations"."scope_type" = 'school' AND "account_invitations"."affiliation_kind" = 'guardian' AND "account_invitations"."role_template_keys" = '["parent"]'::jsonb)
            OR ("account_invitations"."scope_type" = 'school' AND "account_invitations"."affiliation_kind" = 'student' AND "account_invitations"."role_template_keys" = '["student"]'::jsonb)
            OR ("account_invitations"."scope_type" = 'class' AND "account_invitations"."affiliation_kind" = 'teacher' AND "account_invitations"."role_template_keys" = '["teacher"]'::jsonb)
          ));--> statement-breakpoint
ALTER TABLE "invitation_delivery_outbox" ADD CONSTRAINT "invitation_delivery_status_evidence_check" CHECK (("invitation_delivery_outbox"."status" = 'pending' AND "invitation_delivery_outbox"."attempt_count" = 0 AND "invitation_delivery_outbox"."locked_at" IS NULL AND "invitation_delivery_outbox"."delivered_at" IS NULL AND "invitation_delivery_outbox"."last_error_code" IS NULL)
          OR ("invitation_delivery_outbox"."status" = 'processing' AND "invitation_delivery_outbox"."attempt_count" > 0 AND "invitation_delivery_outbox"."locked_at" IS NOT NULL AND "invitation_delivery_outbox"."delivered_at" IS NULL AND "invitation_delivery_outbox"."last_error_code" IS NULL)
          OR ("invitation_delivery_outbox"."status" = 'delivered' AND "invitation_delivery_outbox"."attempt_count" > 0 AND "invitation_delivery_outbox"."locked_at" IS NULL AND "invitation_delivery_outbox"."delivered_at" IS NOT NULL AND "invitation_delivery_outbox"."last_error_code" IS NULL)
          OR ("invitation_delivery_outbox"."status" = 'failed' AND "invitation_delivery_outbox"."attempt_count" > 0 AND "invitation_delivery_outbox"."locked_at" IS NULL AND "invitation_delivery_outbox"."delivered_at" IS NULL AND "invitation_delivery_outbox"."last_error_code" ~ '^[A-Z][A-Z0-9_]{2,63}$')
          OR ("invitation_delivery_outbox"."status" = 'dead_letter' AND "invitation_delivery_outbox"."attempt_count" > 0 AND "invitation_delivery_outbox"."locked_at" IS NULL AND "invitation_delivery_outbox"."delivered_at" IS NULL AND "invitation_delivery_outbox"."last_error_code" ~ '^[A-Z][A-Z0-9_]{2,63}$'));--> statement-breakpoint
ALTER TABLE "invitation_delivery_outbox" ADD CONSTRAINT "invitation_delivery_encryption_check" CHECK ((
            "invitation_delivery_outbox"."status" IN ('pending', 'processing', 'failed')
            AND "invitation_delivery_outbox"."encryption_key_id" IS NOT NULL
            AND "invitation_delivery_outbox"."encryption_key_id" ~ '^[A-Za-z0-9_.-]{1,64}$'
            AND "invitation_delivery_outbox"."token_ciphertext" IS NOT NULL
            AND "invitation_delivery_outbox"."token_ciphertext" ~ '^[A-Za-z0-9_-]+$'
            AND char_length("invitation_delivery_outbox"."token_ciphertext") BETWEEN 16 AND 1024
            AND "invitation_delivery_outbox"."token_iv" IS NOT NULL
            AND "invitation_delivery_outbox"."token_iv" ~ '^[A-Za-z0-9_-]{16}$'
            AND "invitation_delivery_outbox"."token_auth_tag" IS NOT NULL
            AND "invitation_delivery_outbox"."token_auth_tag" ~ '^[A-Za-z0-9_-]{22}$'
          ) OR (
            "invitation_delivery_outbox"."status" IN ('delivered', 'dead_letter')
            AND "invitation_delivery_outbox"."encryption_key_id" IS NULL
            AND "invitation_delivery_outbox"."token_ciphertext" IS NULL
            AND "invitation_delivery_outbox"."token_iv" IS NULL
            AND "invitation_delivery_outbox"."token_auth_tag" IS NULL
          ));--> statement-breakpoint
CREATE POLICY "invitation_acceptance_rate_limits_acceptor_select" ON "invitation_acceptance_rate_limits" AS PERMISSIVE FOR SELECT TO public USING (session_user = 'openschool_runtime' AND current_user = 'openschool_invitation_acceptor');--> statement-breakpoint
CREATE POLICY "invitation_acceptance_rate_limits_acceptor_insert" ON "invitation_acceptance_rate_limits" AS PERMISSIVE FOR INSERT TO public WITH CHECK (session_user = 'openschool_runtime' AND current_user = 'openschool_invitation_acceptor');--> statement-breakpoint
CREATE POLICY "invitation_acceptance_rate_limits_acceptor_update" ON "invitation_acceptance_rate_limits" AS PERMISSIVE FOR UPDATE TO public USING (session_user = 'openschool_runtime' AND current_user = 'openschool_invitation_acceptor') WITH CHECK (session_user = 'openschool_runtime' AND current_user = 'openschool_invitation_acceptor');--> statement-breakpoint
ALTER POLICY "account_invitations_acceptance_select" ON "account_invitations" TO public USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_invitation_acceptor'
        AND "account_invitations"."token_hash" = nullif(current_setting('app.invitation_token_hash', true), '')
      );--> statement-breakpoint
ALTER POLICY "account_invitations_acceptance_update" ON "account_invitations" TO public USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_invitation_acceptor'
        AND "account_invitations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND "account_invitations"."token_hash" = nullif(current_setting('app.invitation_token_hash', true), '')
        AND "account_invitations"."status" = 'pending'
        AND "account_invitations"."expires_at" > now()
        AND "account_invitations"."identity_provider" = nullif(current_setting('app.identity_provider', true), '')
        AND "account_invitations"."intended_email" = lower(btrim(nullif(current_setting('app.identity_email', true), '')))
        AND (
          "account_invitations"."intended_provider_subject" IS NULL
          OR "account_invitations"."intended_provider_subject" = nullif(current_setting('app.provider_subject', true), '')
        )
      ) WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_invitation_acceptor'
        AND "account_invitations"."status" = 'accepted'
        AND "account_invitations"."accepted_provider_subject" = nullif(current_setting('app.provider_subject', true), '')
        AND EXISTS (
          SELECT 1 FROM public.accounts AS accepted_account
          WHERE accepted_account.id = "account_invitations"."accepted_by_account_id"
            AND accepted_account.identity_provider = nullif(current_setting('app.identity_provider', true), '')
            AND accepted_account.provider_subject = nullif(current_setting('app.provider_subject', true), '')
            AND lower(btrim(accepted_account.primary_email)) = lower(btrim(nullif(current_setting('app.identity_email', true), '')))
            AND accepted_account.status = 'active'
        )
      );--> statement-breakpoint
ALTER POLICY "invitation_delivery_runtime_insert" ON "invitation_delivery_outbox" TO openschool_runtime WITH CHECK (
        "invitation_delivery_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.accounts.invite'
        AND EXISTS (
          SELECT 1 FROM public.account_invitations AS invitation
          WHERE invitation.tenant_id = "invitation_delivery_outbox"."tenant_id"
            AND invitation.id = "invitation_delivery_outbox"."invitation_id"
            AND invitation.intended_email = "invitation_delivery_outbox"."recipient_email"
            AND invitation.issued_by_account_id = nullif(current_setting('app.account_id', true), '')::uuid
            AND invitation.status = 'pending'
        )
      );--> statement-breakpoint

CREATE FUNCTION "openschool_private"."consume_invitation_acceptance_rate_limit"(
	p_key_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
	current_attempt_count integer;
	checked_at timestamp with time zone := clock_timestamp();
BEGIN
	IF session_user <> 'openschool_runtime'
		OR current_user <> 'openschool_invitation_acceptor'
		OR p_key_hash !~ '^[0-9a-f]{64}$'
	THEN
		RAISE EXCEPTION 'INVITATION_RATE_LIMIT_CONTEXT_INVALID' USING ERRCODE = '22023';
	END IF;

	INSERT INTO public.invitation_acceptance_rate_limits (
		key_hash, window_started_at, attempt_count, updated_at
	) VALUES (
		p_key_hash, checked_at, 1, checked_at
	)
	ON CONFLICT (key_hash) DO UPDATE SET
		window_started_at = CASE
			WHEN invitation_acceptance_rate_limits.window_started_at <= checked_at - interval '5 minutes'
				THEN checked_at
			ELSE invitation_acceptance_rate_limits.window_started_at
		END,
		attempt_count = CASE
			WHEN invitation_acceptance_rate_limits.window_started_at <= checked_at - interval '5 minutes'
				THEN 1
			ELSE LEAST(invitation_acceptance_rate_limits.attempt_count + 1, 1000000)
		END,
		updated_at = checked_at
	RETURNING attempt_count INTO current_attempt_count;

	RETURN current_attempt_count <= 10;
END;
$$;--> statement-breakpoint

ALTER FUNCTION "openschool_private"."consume_invitation_acceptance_rate_limit"(text)
	OWNER TO "openschool_invitation_acceptor";--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."consume_invitation_acceptance_rate_limit"(text)
	FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."consume_invitation_acceptance_rate_limit"(text)
	TO "openschool_runtime";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.invitation_acceptance_rate_limits
	TO "openschool_invitation_acceptor";--> statement-breakpoint

REVOKE UPDATE ON TABLE public.account_invitations
	FROM "openschool_invitation_acceptor";--> statement-breakpoint
GRANT UPDATE (
	status, accepted_at, accepted_by_account_id, accepted_provider_subject, updated_at
) ON TABLE public.account_invitations
	TO "openschool_invitation_acceptor";
