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
        AND "account_invitations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND "account_invitations"."token_hash" = nullif(current_setting('app.invitation_token_hash', true), '')
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
      );