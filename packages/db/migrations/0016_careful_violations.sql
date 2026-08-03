-- Invitation-only account onboarding. Scope checks reuse the exact Policy Decision
-- constraints bound to the transaction; acceptance is a narrow private function
-- because the verified identity does not have a Tenant context until it succeeds.

CREATE FUNCTION "openschool_invitation_scope_allows"(
	row_tenant_id uuid,
	row_scope_type text,
	row_organization_id uuid,
	row_school_id uuid,
	row_class_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
	SELECT EXISTS (
		SELECT 1
		FROM jsonb_array_elements(public.openschool_policy_constraints()) AS policy_constraint
		WHERE policy_constraint ->> 'tenantId' = row_tenant_id::text
			AND (
				policy_constraint ->> 'kind' = 'tenant'
				OR (
					row_scope_type = 'education_organization'
					AND (
						(
							policy_constraint ->> 'kind' = 'organization_exact'
							AND policy_constraint ->> 'organizationId' = row_organization_id::text
						)
						OR (
							policy_constraint ->> 'kind' = 'organization_subtree'
							AND EXISTS (
								SELECT 1 FROM public.organization_tree_closure AS closure
								WHERE closure.tenant_id = row_tenant_id
									AND closure.ancestor_organization_id::text =
										policy_constraint ->> 'ancestorOrganizationId'
									AND closure.descendant_organization_id = row_organization_id
									AND closure.tree_version_id = (
										SELECT tree_version.id
										FROM public.organization_tree_versions AS tree_version
										WHERE tree_version.tenant_id = row_tenant_id
											AND tree_version.effective_from <= now()
										ORDER BY tree_version.effective_from DESC
										LIMIT 1
									)
							)
						)
					)
				)
				OR (
					row_scope_type IN ('school', 'class')
					AND EXISTS (
						SELECT 1
						FROM public.schools AS school
						WHERE school.tenant_id = row_tenant_id
							AND school.id = COALESCE(
								row_school_id,
								(
									SELECT class.school_id
									FROM public.classes AS class
									WHERE class.tenant_id = row_tenant_id
										AND class.id = row_class_id
								)
							)
							AND public.openschool_school_scope_allows(row_tenant_id, school.id)
					)
				)
			)
	)
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_invitation_scope_allows"(uuid, text, uuid, uuid, uuid)
	FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_invitation_scope_allows"(uuid, text, uuid, uuid, uuid)
	TO "openschool_runtime";--> statement-breakpoint

CREATE TABLE "account_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"intended_email" text NOT NULL,
	"identity_provider" text DEFAULT 'supabase' NOT NULL,
	"intended_provider_subject" text,
	"token_hash" text NOT NULL,
	"token_version" integer DEFAULT 1 NOT NULL,
	"affiliation_kind" text NOT NULL,
	"scope_type" text NOT NULL,
	"education_organization_id" uuid,
	"school_id" uuid,
	"class_id" uuid,
	"role_template_keys" jsonb NOT NULL,
	"affiliation_valid_until" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"issued_by_account_id" uuid NOT NULL,
	"issuance_reason" text NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_account_id" uuid,
	"accepted_provider_subject" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_account_id" uuid,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_invitations_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "account_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "account_invitations_email_normalized_check" CHECK ("account_invitations"."intended_email" = lower(btrim("account_invitations"."intended_email")) AND char_length("account_invitations"."intended_email") BETWEEN 3 AND 320 AND "account_invitations"."intended_email" ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
	CONSTRAINT "account_invitations_identity_check" CHECK (char_length("account_invitations"."identity_provider") BETWEEN 1 AND 128 AND ("account_invitations"."intended_provider_subject" IS NULL OR char_length("account_invitations"."intended_provider_subject") BETWEEN 1 AND 512)),
	CONSTRAINT "account_invitations_token_check" CHECK ("account_invitations"."token_version" = 1 AND "account_invitations"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_invitations_scope_check" CHECK (("account_invitations"."scope_type" = 'tenant' AND "account_invitations"."education_organization_id" IS NULL AND "account_invitations"."school_id" IS NULL AND "account_invitations"."class_id" IS NULL)
          OR ("account_invitations"."scope_type" = 'education_organization' AND "account_invitations"."education_organization_id" IS NOT NULL AND "account_invitations"."school_id" IS NULL AND "account_invitations"."class_id" IS NULL)
          OR ("account_invitations"."scope_type" = 'school' AND "account_invitations"."education_organization_id" IS NULL AND "account_invitations"."school_id" IS NOT NULL AND "account_invitations"."class_id" IS NULL)
          OR ("account_invitations"."scope_type" = 'class' AND "account_invitations"."education_organization_id" IS NULL AND "account_invitations"."school_id" IS NULL AND "account_invitations"."class_id" IS NOT NULL)),
	CONSTRAINT "account_invitations_roles_check" CHECK (jsonb_typeof("account_invitations"."role_template_keys") = 'array'
          AND jsonb_array_length("account_invitations"."role_template_keys") BETWEEN 1 AND 8
          AND NOT jsonb_path_exists("account_invitations"."role_template_keys", '$[*] ? (@.type() != "string")')
          AND "account_invitations"."role_template_keys" <@ '["org_admin", "org_viewer", "school_admin", "staff", "teacher", "parent", "student"]'::jsonb
          AND (
            ("account_invitations"."scope_type" = 'tenant' AND "account_invitations"."role_template_keys" <@ '["parent"]'::jsonb)
            OR ("account_invitations"."scope_type" = 'education_organization' AND "account_invitations"."role_template_keys" <@ '["org_admin", "org_viewer"]'::jsonb)
            OR ("account_invitations"."scope_type" = 'school' AND "account_invitations"."role_template_keys" <@ '["school_admin", "staff", "parent", "student"]'::jsonb)
            OR ("account_invitations"."scope_type" = 'class' AND "account_invitations"."role_template_keys" <@ '["teacher"]'::jsonb)
          )),
	CONSTRAINT "account_invitations_period_check" CHECK ("account_invitations"."expires_at" > "account_invitations"."created_at" AND ("account_invitations"."affiliation_valid_until" IS NULL OR "account_invitations"."affiliation_valid_until" > "account_invitations"."created_at")),
	CONSTRAINT "account_invitations_status_evidence_check" CHECK (("account_invitations"."status" = 'pending' AND "account_invitations"."accepted_at" IS NULL AND "account_invitations"."accepted_by_account_id" IS NULL AND "account_invitations"."accepted_provider_subject" IS NULL AND "account_invitations"."cancelled_at" IS NULL AND "account_invitations"."cancelled_by_account_id" IS NULL AND "account_invitations"."cancellation_reason" IS NULL)
          OR ("account_invitations"."status" = 'accepted' AND "account_invitations"."accepted_at" IS NOT NULL AND "account_invitations"."accepted_by_account_id" IS NOT NULL AND "account_invitations"."accepted_provider_subject" IS NOT NULL AND "account_invitations"."cancelled_at" IS NULL AND "account_invitations"."cancelled_by_account_id" IS NULL AND "account_invitations"."cancellation_reason" IS NULL)
          OR ("account_invitations"."status" = 'cancelled' AND "account_invitations"."accepted_at" IS NULL AND "account_invitations"."accepted_by_account_id" IS NULL AND "account_invitations"."accepted_provider_subject" IS NULL AND "account_invitations"."cancelled_at" IS NOT NULL AND "account_invitations"."cancelled_by_account_id" IS NOT NULL AND nullif(btrim("account_invitations"."cancellation_reason"), '') IS NOT NULL)
          OR ("account_invitations"."status" = 'expired' AND "account_invitations"."accepted_at" IS NULL AND "account_invitations"."accepted_by_account_id" IS NULL AND "account_invitations"."accepted_provider_subject" IS NULL AND "account_invitations"."cancelled_at" IS NULL AND "account_invitations"."cancelled_by_account_id" IS NULL AND "account_invitations"."cancellation_reason" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "account_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account_invitations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invitation_delivery_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"encryption_key_id" text,
	"token_ciphertext" text,
	"token_iv" text,
	"token_auth_tag" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_delivery_invitation_unique" UNIQUE("tenant_id","invitation_id"),
	CONSTRAINT "invitation_delivery_email_normalized_check" CHECK ("invitation_delivery_outbox"."recipient_email" = lower(btrim("invitation_delivery_outbox"."recipient_email")) AND char_length("invitation_delivery_outbox"."recipient_email") BETWEEN 3 AND 320),
	CONSTRAINT "invitation_delivery_encryption_check" CHECK ((
            "invitation_delivery_outbox"."status" IN ('pending', 'processing', 'failed')
            AND "invitation_delivery_outbox"."encryption_key_id" ~ '^[A-Za-z0-9_.-]{1,64}$'
            AND "invitation_delivery_outbox"."token_ciphertext" ~ '^[A-Za-z0-9_-]{16,1024}$'
            AND "invitation_delivery_outbox"."token_iv" ~ '^[A-Za-z0-9_-]{16}$'
            AND "invitation_delivery_outbox"."token_auth_tag" ~ '^[A-Za-z0-9_-]{22}$'
          ) OR (
            "invitation_delivery_outbox"."status" IN ('delivered', 'dead_letter')
            AND "invitation_delivery_outbox"."encryption_key_id" IS NULL
            AND "invitation_delivery_outbox"."token_ciphertext" IS NULL
            AND "invitation_delivery_outbox"."token_iv" IS NULL
            AND "invitation_delivery_outbox"."token_auth_tag" IS NULL
          )),
	CONSTRAINT "invitation_delivery_attempt_nonnegative" CHECK ("invitation_delivery_outbox"."attempt_count" >= 0),
	CONSTRAINT "invitation_delivery_status_check" CHECK ("invitation_delivery_outbox"."status" IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter'))
);
--> statement-breakpoint
ALTER TABLE "invitation_delivery_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitation_delivery_outbox" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_issued_by_account_id_accounts_id_fk" FOREIGN KEY ("issued_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_accepted_by_account_id_accounts_id_fk" FOREIGN KEY ("accepted_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_cancelled_by_account_id_accounts_id_fk" FOREIGN KEY ("cancelled_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_tenant_organization_fk" FOREIGN KEY ("tenant_id","education_organization_id") REFERENCES "public"."education_organizations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_tenant_class_fk" FOREIGN KEY ("tenant_id","class_id") REFERENCES "public"."classes"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "invitation_delivery_outbox" ADD CONSTRAINT "invitation_delivery_outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "invitation_delivery_outbox" ADD CONSTRAINT "invitation_delivery_invitation_fk" FOREIGN KEY ("tenant_id","invitation_id") REFERENCES "public"."account_invitations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "account_invitations_tenant_status_expiry_idx" ON "account_invitations" USING btree ("tenant_id","status","expires_at","id");--> statement-breakpoint
CREATE INDEX "account_invitations_tenant_person_status_idx" ON "account_invitations" USING btree ("tenant_id","person_id","status","id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_invitations_pending_person_unique"
	ON "account_invitations" ("tenant_id", "person_id")
	WHERE "status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_primary_email_normalized_unique"
	ON "accounts" (lower(btrim("primary_email")));--> statement-breakpoint
CREATE INDEX "invitation_delivery_claim_idx" ON "invitation_delivery_outbox" USING btree ("tenant_id","status","available_at","id");--> statement-breakpoint
CREATE POLICY "account_invitations_runtime_select" ON "account_invitations" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "account_invitations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') IN (
          'tenant.accounts.invite', 'tenant.accounts.manage'
        )
        AND public.openschool_invitation_scope_allows(
          "account_invitations"."tenant_id", "account_invitations"."scope_type", "account_invitations"."education_organization_id",
          "account_invitations"."school_id", "account_invitations"."class_id"
        )
      );--> statement-breakpoint
CREATE POLICY "account_invitations_runtime_insert" ON "account_invitations" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (
        "account_invitations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND "account_invitations"."issued_by_account_id" = nullif(current_setting('app.account_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.accounts.invite'
        AND public.openschool_invitation_scope_allows(
          "account_invitations"."tenant_id", "account_invitations"."scope_type", "account_invitations"."education_organization_id",
          "account_invitations"."school_id", "account_invitations"."class_id"
        )
      );--> statement-breakpoint
CREATE POLICY "account_invitations_runtime_update" ON "account_invitations" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (
        "account_invitations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.accounts.manage'
        AND public.openschool_invitation_scope_allows(
          "account_invitations"."tenant_id", "account_invitations"."scope_type", "account_invitations"."education_organization_id",
          "account_invitations"."school_id", "account_invitations"."class_id"
        )
      ) WITH CHECK (
        "account_invitations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND "account_invitations"."cancelled_by_account_id" = nullif(current_setting('app.account_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.accounts.manage'
        AND public.openschool_invitation_scope_allows(
          "account_invitations"."tenant_id", "account_invitations"."scope_type", "account_invitations"."education_organization_id",
          "account_invitations"."school_id", "account_invitations"."class_id"
        )
      );--> statement-breakpoint
CREATE POLICY "account_invitations_runtime_delete_deny" ON "account_invitations" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "account_invitations_worker_select" ON "account_invitations" AS PERMISSIVE FOR SELECT TO "openschool_worker" USING ("account_invitations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "account_invitations_acceptance_select" ON "account_invitations" AS PERMISSIVE FOR SELECT TO PUBLIC USING (
		session_user = 'openschool_runtime'
		AND current_user = 'openschool_invitation_acceptor'
	);--> statement-breakpoint
CREATE POLICY "account_invitations_acceptance_update" ON "account_invitations" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (
		session_user = 'openschool_runtime'
		AND current_user = 'openschool_invitation_acceptor'
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
CREATE POLICY "invitation_delivery_runtime_insert" ON "invitation_delivery_outbox" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (
        "invitation_delivery_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.accounts.invite'
        AND EXISTS (
          SELECT 1 FROM public.account_invitations AS invitation
          WHERE invitation.tenant_id = "invitation_delivery_outbox"."tenant_id"
            AND invitation.id = "invitation_delivery_outbox"."invitation_id"
            AND invitation.issued_by_account_id = nullif(current_setting('app.account_id', true), '')::uuid
            AND invitation.status = 'pending'
        )
      );--> statement-breakpoint
CREATE POLICY "invitation_delivery_runtime_select_deny" ON "invitation_delivery_outbox" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "invitation_delivery_runtime_update_deny" ON "invitation_delivery_outbox" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "invitation_delivery_runtime_delete_deny" ON "invitation_delivery_outbox" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "invitation_delivery_worker_select" ON "invitation_delivery_outbox" AS PERMISSIVE FOR SELECT TO "openschool_worker" USING ("invitation_delivery_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "invitation_delivery_worker_update" ON "invitation_delivery_outbox" AS PERMISSIVE FOR UPDATE TO "openschool_worker" USING ("invitation_delivery_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("invitation_delivery_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "invitation_delivery_worker_insert_deny" ON "invitation_delivery_outbox" AS PERMISSIVE FOR INSERT TO "openschool_worker" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "invitation_delivery_worker_delete_deny" ON "invitation_delivery_outbox" AS PERMISSIVE FOR DELETE TO "openschool_worker" USING (false);
--> statement-breakpoint
CREATE POLICY "audit_events_invitation_denial_insert" ON "audit_events" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (
	"audit_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
	AND "audit_events"."actor_type" = 'system'
	AND "audit_events"."actor_account_id" IS NULL
	AND "audit_events"."actor_person_id" IS NULL
	AND "audit_events"."request_id" = nullif(current_setting('app.request_id', true), '')
	AND "audit_events"."education_organization_id" IS NOT DISTINCT FROM nullif(current_setting('app.education_organization_id', true), '')::uuid
	AND "audit_events"."school_id" IS NOT DISTINCT FROM nullif(current_setting('app.school_id', true), '')::uuid
	AND "audit_events"."event_type" = 'account.invitation.accept'
	AND "audit_events"."outcome" = 'denied'
	AND "audit_events"."capability" = 'identity.invitation.accept'
	AND "audit_events"."policy_version" = 'identity-invitation.v1'
	AND "audit_events"."policy_decision" ->> 'effect' = 'deny'
	AND "audit_events"."policy_decision" ->> 'reason' IN (
		'INVITATION_UNAVAILABLE', 'INVITATION_IDENTITY_MISMATCH', 'INVITATION_ACCOUNT_CONFLICT'
	)
	AND "audit_events"."target_type" = 'account.invitation'
	AND "audit_events"."target_id" IS NOT NULL
	AND "audit_events"."data_classes" = '["credential"]'::jsonb
	AND "audit_events"."purpose" = 'account_onboarding'
	AND "audit_events"."source" = 'web'
	AND "audit_events"."retention_class" = 'security'
);--> statement-breakpoint
CREATE POLICY "audit_outbox_invitation_denial_insert" ON "audit_outbox" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (
	"audit_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
	AND "audit_outbox"."context" ->> 'requestId' = nullif(current_setting('app.request_id', true), '')
	AND "audit_outbox"."context" ->> 'actorAccountId' IS NULL
	AND "audit_outbox"."context" ->> 'actorPersonId' IS NULL
	AND "audit_outbox"."topic" = 'audit.event.committed'
	AND "audit_outbox"."payload" ->> 'eventType' = 'account.invitation.accept'
	AND "audit_outbox"."payload" ->> 'outcome' = 'denied'
	AND "audit_outbox"."payload" ->> 'targetType' = 'account.invitation'
	AND nullif("audit_outbox"."payload" ->> 'targetId', '') IS NOT NULL
	AND "audit_outbox"."deduplication_key" =
		'account.invitation.accept.denied:' || ("audit_outbox"."payload" ->> 'targetId') || ':' ||
		nullif(current_setting('app.request_id', true), '')
);

--> statement-breakpoint
CREATE FUNCTION "openschool_guard_account_invitation_insert"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	IF NEW.status <> 'pending'
		OR NEW.accepted_at IS NOT NULL
		OR NEW.accepted_by_account_id IS NOT NULL
		OR NEW.accepted_provider_subject IS NOT NULL
		OR NEW.cancelled_at IS NOT NULL
		OR NEW.cancelled_by_account_id IS NOT NULL
		OR NEW.cancellation_reason IS NOT NULL
	THEN
		RAISE EXCEPTION 'New invitation must start pending without terminal evidence'
			USING ERRCODE = '55000';
	END IF;
	IF (
		SELECT count(*) <> count(DISTINCT role_key)
		FROM jsonb_array_elements_text(NEW.role_template_keys) AS role_key
	) THEN
		RAISE EXCEPTION 'Invitation role template keys must be unique'
			USING ERRCODE = '22023';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_guard_account_invitation_change"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
		OR NEW.person_id IS DISTINCT FROM OLD.person_id
		OR NEW.intended_email IS DISTINCT FROM OLD.intended_email
		OR NEW.identity_provider IS DISTINCT FROM OLD.identity_provider
		OR NEW.intended_provider_subject IS DISTINCT FROM OLD.intended_provider_subject
		OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
		OR NEW.token_version IS DISTINCT FROM OLD.token_version
		OR NEW.affiliation_kind IS DISTINCT FROM OLD.affiliation_kind
		OR NEW.scope_type IS DISTINCT FROM OLD.scope_type
		OR NEW.education_organization_id IS DISTINCT FROM OLD.education_organization_id
		OR NEW.school_id IS DISTINCT FROM OLD.school_id
		OR NEW.class_id IS DISTINCT FROM OLD.class_id
		OR NEW.role_template_keys IS DISTINCT FROM OLD.role_template_keys
		OR NEW.affiliation_valid_until IS DISTINCT FROM OLD.affiliation_valid_until
		OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
		OR NEW.issued_by_account_id IS DISTINCT FROM OLD.issued_by_account_id
		OR NEW.issuance_reason IS DISTINCT FROM OLD.issuance_reason
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	THEN
		RAISE EXCEPTION 'Invitation approval anchors are immutable'
			USING ERRCODE = '55000';
	END IF;
	IF OLD.status <> 'pending' THEN
		RAISE EXCEPTION 'Terminal invitation evidence is immutable'
			USING ERRCODE = '55000';
	END IF;
	IF NEW.status NOT IN ('accepted', 'cancelled', 'expired') OR NEW.updated_at < OLD.updated_at THEN
		RAISE EXCEPTION 'Invitation lifecycle transition is invalid'
			USING ERRCODE = '55000';
	END IF;
	IF NEW.status = 'expired' AND OLD.expires_at > now() THEN
		RAISE EXCEPTION 'Invitation cannot expire before its deadline'
			USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_reject_invitation_delete"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	RAISE EXCEPTION 'Invitation evidence is append-only'
		USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_guard_invitation_delivery_insert"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	IF NEW.status <> 'pending'
		OR NEW.attempt_count <> 0
		OR NEW.locked_at IS NOT NULL
		OR NEW.delivered_at IS NOT NULL
		OR NEW.last_error_code IS NOT NULL
	THEN
		RAISE EXCEPTION 'New invitation delivery must start pending and unclaimed'
			USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_guard_invitation_delivery_change"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
		OR NEW.invitation_id IS DISTINCT FROM OLD.invitation_id
		OR NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	THEN
		RAISE EXCEPTION 'Invitation delivery payload is immutable'
			USING ERRCODE = '55000';
	END IF;
	IF NEW.status IN ('delivered', 'dead_letter') THEN
		IF NEW.encryption_key_id IS NOT NULL
			OR NEW.token_ciphertext IS NOT NULL
			OR NEW.token_iv IS NOT NULL
			OR NEW.token_auth_tag IS NOT NULL
		THEN
			RAISE EXCEPTION 'Terminal invitation delivery must erase credential material'
				USING ERRCODE = '55000';
		END IF;
	ELSIF NEW.encryption_key_id IS DISTINCT FROM OLD.encryption_key_id
		OR NEW.token_ciphertext IS DISTINCT FROM OLD.token_ciphertext
		OR NEW.token_iv IS DISTINCT FROM OLD.token_iv
		OR NEW.token_auth_tag IS DISTINCT FROM OLD.token_auth_tag
	THEN
		RAISE EXCEPTION 'Retryable invitation delivery credential is immutable'
			USING ERRCODE = '55000';
	END IF;
	IF NEW.updated_at < OLD.updated_at THEN
		RAISE EXCEPTION 'Invitation delivery time cannot move backwards'
			USING ERRCODE = '55000';
	END IF;
	IF NEW.status = 'processing' THEN
		IF OLD.status NOT IN ('pending', 'failed', 'processing')
			OR NEW.attempt_count <> OLD.attempt_count + 1
			OR NEW.locked_at IS NULL
			OR NEW.delivered_at IS NOT NULL
			OR NEW.last_error_code IS NOT NULL
		THEN
			RAISE EXCEPTION 'Invitation delivery claim is invalid'
				USING ERRCODE = '55000';
		END IF;
	ELSIF NEW.status = 'delivered' THEN
		IF OLD.status <> 'processing'
			OR NEW.attempt_count <> OLD.attempt_count
			OR NEW.locked_at IS NOT NULL
			OR NEW.delivered_at IS NULL
			OR NEW.last_error_code IS NOT NULL
		THEN
			RAISE EXCEPTION 'Invitation delivery completion is invalid'
				USING ERRCODE = '55000';
		END IF;
	ELSIF NEW.status IN ('failed', 'dead_letter') THEN
		IF OLD.status <> 'processing'
			OR NEW.attempt_count <> OLD.attempt_count
			OR NEW.locked_at IS NOT NULL
			OR NEW.delivered_at IS NOT NULL
			OR NEW.last_error_code !~ '^[A-Z][A-Z0-9_]{2,63}$'
			OR (NEW.status = 'failed' AND NEW.available_at <= now())
		THEN
			RAISE EXCEPTION 'Invitation delivery failure evidence is invalid'
				USING ERRCODE = '55000';
		END IF;
	ELSE
		RAISE EXCEPTION 'Invitation delivery lifecycle transition is invalid'
			USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "account_invitations_insert_guard"
	BEFORE INSERT ON "account_invitations"
	FOR EACH ROW EXECUTE FUNCTION "openschool_guard_account_invitation_insert"();--> statement-breakpoint
CREATE TRIGGER "account_invitations_update_guard"
	BEFORE UPDATE ON "account_invitations"
	FOR EACH ROW EXECUTE FUNCTION "openschool_guard_account_invitation_change"();--> statement-breakpoint
CREATE TRIGGER "account_invitations_delete_rejected"
	BEFORE DELETE ON "account_invitations"
	FOR EACH ROW EXECUTE FUNCTION "openschool_reject_invitation_delete"();--> statement-breakpoint
CREATE TRIGGER "invitation_delivery_insert_guard"
	BEFORE INSERT ON "invitation_delivery_outbox"
	FOR EACH ROW EXECUTE FUNCTION "openschool_guard_invitation_delivery_insert"();--> statement-breakpoint
CREATE TRIGGER "invitation_delivery_update_guard"
	BEFORE UPDATE ON "invitation_delivery_outbox"
	FOR EACH ROW EXECUTE FUNCTION "openschool_guard_invitation_delivery_change"();--> statement-breakpoint
CREATE TRIGGER "invitation_delivery_delete_rejected"
	BEFORE DELETE ON "invitation_delivery_outbox"
	FOR EACH ROW EXECUTE FUNCTION "openschool_reject_invitation_delete"();--> statement-breakpoint

CREATE SCHEMA IF NOT EXISTS "openschool_private";--> statement-breakpoint
REVOKE ALL ON SCHEMA "openschool_private" FROM PUBLIC;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."accept_account_invitation"(
	p_token_hash text,
	p_authenticated_at timestamp with time zone,
	p_session_expires_at timestamp with time zone
)
RETURNS TABLE (
	acceptance_outcome text,
	acceptance_reason text,
	invitation_id uuid,
	tenant_id uuid,
	account_id uuid,
	person_id uuid,
	membership_version bigint,
	security_version bigint,
	education_organization_id uuid,
	school_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
	invitation public.account_invitations%ROWTYPE;
	resolved_account public.accounts%ROWTYPE;
	affiliation_id uuid := gen_random_uuid();
	role_key text;
	resolved_school_id uuid;
	account_was_created boolean := false;
	verified_identity_provider text := nullif(current_setting('app.identity_provider', true), '');
	verified_provider_subject text := nullif(current_setting('app.provider_subject', true), '');
	verified_provider_session_id text := nullif(current_setting('app.provider_session_id', true), '');
	verified_identity_email text := lower(btrim(nullif(current_setting('app.identity_email', true), '')));
	verified_request_id text := nullif(current_setting('app.request_id', true), '');
	verified_assurance_level text := nullif(current_setting('app.assurance_level', true), '');
BEGIN
	IF session_user <> 'openschool_runtime'
		OR verified_identity_provider IS NULL
		OR verified_provider_subject IS NULL
		OR verified_provider_session_id IS NULL
		OR verified_identity_email IS NULL
		OR verified_request_id IS NULL
		OR verified_assurance_level NOT IN ('aal1', 'aal2')
		OR p_token_hash !~ '^[0-9a-f]{64}$'
		OR p_authenticated_at > now() + interval '1 minute'
		OR p_session_expires_at <= now()
		OR p_session_expires_at <= p_authenticated_at
	THEN
		RAISE EXCEPTION 'INVITATION_CONTEXT_INVALID' USING ERRCODE = '22023';
	END IF;

	SELECT candidate.* INTO invitation
	FROM public.account_invitations AS candidate
	WHERE candidate.token_hash = p_token_hash;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'INVITATION_INVALID' USING ERRCODE = 'P0001';
	END IF;

	IF invitation.scope_type = 'class' THEN
		SELECT class.school_id INTO resolved_school_id
		FROM public.classes AS class
		WHERE class.tenant_id = invitation.tenant_id AND class.id = invitation.class_id;
	ELSE
		resolved_school_id := invitation.school_id;
	END IF;

	-- Bind only canonical invitation scope. Denial evidence intentionally omits
	-- unverified provider identity claims and has no Account/Person actor.
	PERFORM set_config('app.account_id', '', true);
	PERFORM set_config('app.person_id', '', true);
	PERFORM set_config('app.tenant_id', invitation.tenant_id::text, true);
	PERFORM set_config('app.session_id', verified_provider_session_id, true);
	PERFORM set_config('app.education_organization_id', COALESCE(invitation.education_organization_id::text, ''), true);
	PERFORM set_config('app.school_id', COALESCE(resolved_school_id::text, ''), true);
	PERFORM set_config('app.policy_capability', 'identity.invitation.accept', true);
	PERFORM set_config('app.policy_version', 'identity-invitation.v1', true);
	PERFORM set_config(
		'app.policy_constraints',
		jsonb_build_array(jsonb_build_object('kind', 'tenant', 'tenantId', invitation.tenant_id))::text,
		true
	);

	IF invitation.status <> 'pending' OR invitation.expires_at <= now() THEN
		RETURN QUERY SELECT
			'denied'::text, 'INVITATION_UNAVAILABLE'::text,
			invitation.id, invitation.tenant_id, NULL::uuid, invitation.person_id,
			NULL::bigint, NULL::bigint, invitation.education_organization_id, resolved_school_id;
		RETURN;
	END IF;
	IF invitation.identity_provider <> verified_identity_provider
		OR invitation.intended_email <> verified_identity_email
		OR (
			invitation.intended_provider_subject IS NOT NULL
			AND invitation.intended_provider_subject <> verified_provider_subject
		)
	THEN
		RETURN QUERY SELECT
			'denied'::text, 'INVITATION_IDENTITY_MISMATCH'::text,
			invitation.id, invitation.tenant_id, NULL::uuid, invitation.person_id,
			NULL::bigint, NULL::bigint, invitation.education_organization_id, resolved_school_id;
		RETURN;
	END IF;

	-- Row-locking reads must satisfy the UPDATE policy as well as SELECT RLS.
	-- Classify immutable terminal and identity-mismatch evidence before taking
	-- that lock, then re-check eligibility while acquiring it so a concurrent
	-- acceptance, cancellation, or expiry resolves as unavailable.
	PERFORM 1
	FROM public.account_invitations AS candidate
	WHERE candidate.token_hash = p_token_hash
	FOR UPDATE;
	IF NOT FOUND THEN
		RETURN QUERY SELECT
			'denied'::text, 'INVITATION_UNAVAILABLE'::text,
			invitation.id, invitation.tenant_id, NULL::uuid, invitation.person_id,
			NULL::bigint, NULL::bigint, invitation.education_organization_id, resolved_school_id;
		RETURN;
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM public.people AS person
		WHERE person.tenant_id = invitation.tenant_id
			AND person.id = invitation.person_id
			AND person.status = 'active'
			AND (
				person.normalized_email IS NULL
				OR person.normalized_email = invitation.intended_email
		)
	) THEN
		RETURN QUERY SELECT
			'denied'::text, 'INVITATION_ACCOUNT_CONFLICT'::text,
			invitation.id, invitation.tenant_id, NULL::uuid, invitation.person_id,
			NULL::bigint, NULL::bigint, invitation.education_organization_id, resolved_school_id;
		RETURN;
	END IF;
	IF EXISTS (
		SELECT 1 FROM public.account_links AS link
		WHERE link.tenant_id = invitation.tenant_id
			AND link.person_id = invitation.person_id
	) THEN
		RETURN QUERY SELECT
			'denied'::text, 'INVITATION_ACCOUNT_CONFLICT'::text,
			invitation.id, invitation.tenant_id, NULL::uuid, invitation.person_id,
			NULL::bigint, NULL::bigint, invitation.education_organization_id, resolved_school_id;
		RETURN;
	END IF;

	SELECT account.* INTO resolved_account
	FROM public.accounts AS account
	WHERE account.identity_provider = verified_identity_provider
		AND account.provider_subject = verified_provider_subject
	FOR UPDATE;

	IF NOT FOUND THEN
		IF EXISTS (
			SELECT 1 FROM public.accounts AS conflicting_account
			WHERE lower(btrim(conflicting_account.primary_email)) = verified_identity_email
		) THEN
			RETURN QUERY SELECT
				'denied'::text, 'INVITATION_ACCOUNT_CONFLICT'::text,
				invitation.id, invitation.tenant_id, NULL::uuid, invitation.person_id,
				NULL::bigint, NULL::bigint, invitation.education_organization_id, resolved_school_id;
			RETURN;
		END IF;
		INSERT INTO public.accounts (
			identity_provider, provider_subject, primary_email, status,
			membership_version, security_version
		) VALUES (
			verified_identity_provider, verified_provider_subject, verified_identity_email, 'active', 1, 1
		) RETURNING * INTO resolved_account;
		account_was_created := true;
	ELSIF resolved_account.status <> 'active'
		OR lower(btrim(resolved_account.primary_email)) <> verified_identity_email
	THEN
		RETURN QUERY SELECT
			'denied'::text, 'INVITATION_ACCOUNT_CONFLICT'::text,
			invitation.id, invitation.tenant_id, NULL::uuid, invitation.person_id,
			NULL::bigint, NULL::bigint, invitation.education_organization_id, resolved_school_id;
		RETURN;
	END IF;

	IF EXISTS (
		SELECT 1 FROM public.account_links AS link
		WHERE link.tenant_id = invitation.tenant_id
			AND link.account_id = resolved_account.id
	) THEN
		RETURN QUERY SELECT
			'denied'::text, 'INVITATION_ACCOUNT_CONFLICT'::text,
			invitation.id, invitation.tenant_id, NULL::uuid, invitation.person_id,
			NULL::bigint, NULL::bigint, invitation.education_organization_id, resolved_school_id;
		RETURN;
	END IF;

	INSERT INTO public.account_links (
		tenant_id, account_id, person_id, status, valid_from,
		issued_by_account_id, issuance_reason, activated_at
	) VALUES (
		invitation.tenant_id, resolved_account.id, invitation.person_id, 'active', now(),
		invitation.issued_by_account_id, invitation.issuance_reason, now()
	);

	INSERT INTO public.affiliations (
		id, tenant_id, person_id, kind, scope_type,
		education_organization_id, school_id, class_id,
		status, valid_from, valid_until, issued_by_account_id, issuance_reason
	) VALUES (
		affiliation_id, invitation.tenant_id, invitation.person_id, invitation.affiliation_kind,
		invitation.scope_type, invitation.education_organization_id, invitation.school_id,
		invitation.class_id, 'active', now(), invitation.affiliation_valid_until,
		invitation.issued_by_account_id, invitation.issuance_reason
	);

	FOR role_key IN
		SELECT DISTINCT expanded.value
		FROM jsonb_array_elements_text(invitation.role_template_keys) AS expanded(value)
	LOOP
		INSERT INTO public.role_template_assignments (
			tenant_id, affiliation_id, role_template_key, status, valid_from,
			valid_until, issued_by_account_id, issuance_reason
		) VALUES (
			invitation.tenant_id, affiliation_id, role_key, 'active', now(),
			invitation.affiliation_valid_until, invitation.issued_by_account_id,
			invitation.issuance_reason
		);
	END LOOP;

	IF NOT account_was_created THEN
		UPDATE public.accounts
		SET membership_version = accounts.membership_version + 1,
			updated_at = now()
		WHERE accounts.id = resolved_account.id
		RETURNING * INTO resolved_account;
	END IF;

	UPDATE public.account_invitations
	SET status = 'accepted',
		accepted_at = now(),
		accepted_by_account_id = resolved_account.id,
		accepted_provider_subject = verified_provider_subject,
		updated_at = now()
	WHERE account_invitations.id = invitation.id;

	PERFORM set_config('app.account_id', resolved_account.id::text, true);
	PERFORM set_config('app.person_id', invitation.person_id::text, true);
	PERFORM set_config('app.tenant_id', invitation.tenant_id::text, true);
	PERFORM set_config('app.session_id', verified_provider_session_id, true);
	PERFORM set_config('app.membership_version', resolved_account.membership_version::text, true);
	PERFORM set_config('app.security_version', resolved_account.security_version::text, true);
	PERFORM set_config('app.context_policy_version', '1', true);
	PERFORM set_config('app.education_organization_id', COALESCE(invitation.education_organization_id::text, ''), true);
	PERFORM set_config('app.school_id', COALESCE(resolved_school_id::text, ''), true);
	PERFORM set_config('app.policy_capability', 'identity.invitation.accept', true);
	PERFORM set_config('app.policy_version', 'identity-invitation.v1', true);
	PERFORM set_config(
		'app.policy_constraints',
		jsonb_build_array(jsonb_build_object('kind', 'tenant', 'tenantId', invitation.tenant_id))::text,
		true
	);

	RETURN QUERY SELECT
		'accepted'::text,
		'ACCEPTED'::text,
		invitation.id,
		invitation.tenant_id,
		resolved_account.id,
		invitation.person_id,
		resolved_account.membership_version,
		resolved_account.security_version,
		invitation.education_organization_id,
		resolved_school_id;
END;
$$;--> statement-breakpoint

GRANT SELECT ON TABLE
	public.account_invitations,
	public.people,
	public.accounts,
	public.account_links,
	public.classes
	TO "openschool_invitation_acceptor";--> statement-breakpoint
GRANT INSERT, UPDATE ON TABLE public.accounts
	TO "openschool_invitation_acceptor";--> statement-breakpoint
GRANT INSERT ON TABLE
	public.account_links,
	public.affiliations,
	public.role_template_assignments
	TO "openschool_invitation_acceptor";--> statement-breakpoint
GRANT UPDATE ON TABLE public.account_invitations
	TO "openschool_invitation_acceptor";--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA "openschool_private"
	TO "openschool_invitation_acceptor";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."accept_account_invitation"(text, timestamp with time zone, timestamp with time zone)
	OWNER TO "openschool_invitation_acceptor";--> statement-breakpoint
REVOKE CREATE ON SCHEMA "openschool_private"
	FROM "openschool_invitation_acceptor";--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_guard_account_invitation_insert"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_guard_account_invitation_change"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_reject_invitation_delete"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_guard_invitation_delivery_insert"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_guard_invitation_delivery_change"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."accept_account_invitation"(text, timestamp with time zone, timestamp with time zone)
	FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA "openschool_private" TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."accept_account_invitation"(text, timestamp with time zone, timestamp with time zone)
	TO "openschool_runtime";
