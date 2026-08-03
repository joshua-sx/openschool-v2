-- Versioned, atomic Audit Ledger and durable outbox. Audit Events are range-partitioned
-- by occurrence time; application roles can append but cannot alter committed evidence.

CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint

CREATE FUNCTION "openschool_audit_scope_allows"(
	row_tenant_id uuid,
	row_organization_id uuid,
	row_school_id uuid
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
			AND policy_constraint ->> 'kind' = 'tenant'
	)
	OR (
		row_school_id IS NOT NULL
		AND public.openschool_school_scope_allows(row_tenant_id, row_school_id)
	)
	OR (
		row_organization_id IS NOT NULL
		AND EXISTS (
			SELECT 1
			FROM jsonb_array_elements(public.openschool_policy_constraints()) AS policy_constraint
			WHERE policy_constraint ->> 'tenantId' = row_tenant_id::text
				AND (
					(
						policy_constraint ->> 'kind' = 'organization_exact'
						AND policy_constraint ->> 'organizationId' = row_organization_id::text
					)
					OR (
						policy_constraint ->> 'kind' = 'organization_subtree'
						AND EXISTS (
							SELECT 1
							FROM public.organization_tree_closure AS closure
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
	)
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_audit_scope_allows"(uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_audit_scope_allows"(uuid, uuid, uuid)
	TO "openschool_runtime", "openschool_worker";--> statement-breakpoint

CREATE TABLE "audit_archive_manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"retention_class" text NOT NULL,
	"event_count" integer NOT NULL,
	"first_event_hash" text NOT NULL,
	"last_event_hash" text NOT NULL,
	"root_hash" text NOT NULL,
	"previous_manifest_hash" text,
	"manifest_hash" text NOT NULL,
	"signing_key_id" text NOT NULL,
	"signature" text NOT NULL,
	"archive_location_hash" text NOT NULL,
	"includes_legal_hold" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_archive_manifest_period_unique" UNIQUE("tenant_id","period_start","retention_class"),
	CONSTRAINT "audit_archive_manifest_period_check" CHECK ("audit_archive_manifests"."period_end" > "audit_archive_manifests"."period_start"),
	CONSTRAINT "audit_archive_manifest_count_check" CHECK ("audit_archive_manifests"."event_count" >= 0),
	CONSTRAINT "audit_archive_manifest_hashes_check" CHECK ("audit_archive_manifests"."first_event_hash" ~ '^[0-9a-f]{64}$' AND "audit_archive_manifests"."last_event_hash" ~ '^[0-9a-f]{64}$' AND "audit_archive_manifests"."root_hash" ~ '^[0-9a-f]{64}$' AND "audit_archive_manifests"."manifest_hash" ~ '^[0-9a-f]{64}$' AND "audit_archive_manifests"."archive_location_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"event_type" text NOT NULL,
	"outcome" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"education_organization_id" uuid,
	"school_id" uuid,
	"actor_type" text NOT NULL,
	"actor_account_id" uuid,
	"actor_person_id" uuid,
	"capability" text,
	"policy_version" text,
	"policy_decision" jsonb,
	"request_id" text NOT NULL,
	"correlation_id" text NOT NULL,
	"causation_id" uuid,
	"pre_operation_receipt_id" uuid,
	"support_grant_id" uuid,
	"target_type" text NOT NULL,
	"target_id" text,
	"data_classes" jsonb NOT NULL,
	"change_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"purpose" text,
	"source" text NOT NULL,
	"retention_class" text DEFAULT 'security' NOT NULL,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"content_hash" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_pk" PRIMARY KEY("occurred_at","id"),
	CONSTRAINT "audit_events_version_positive" CHECK ("audit_events"."event_version" > 0),
	CONSTRAINT "audit_events_type_format" CHECK ("audit_events"."event_type" ~ '^[a-z][a-z0-9_.]{2,127}$'),
	CONSTRAINT "audit_events_reference_format" CHECK ("audit_events"."target_type" ~ '^[a-z][a-z0-9_.]{2,127}$' AND char_length("audit_events"."request_id") BETWEEN 1 AND 512 AND char_length("audit_events"."correlation_id") BETWEEN 1 AND 512 AND ("audit_events"."target_id" IS NULL OR char_length("audit_events"."target_id") BETWEEN 1 AND 512) AND ("audit_events"."purpose" IS NULL OR "audit_events"."purpose" ~ '^[a-z][a-z0-9_.-]{2,63}$')),
	CONSTRAINT "audit_events_outcome_check" CHECK ("audit_events"."outcome" IN ('attempted', 'succeeded', 'denied', 'failed')),
	CONSTRAINT "audit_events_actor_type_check" CHECK ("audit_events"."actor_type" IN ('account', 'worker', 'system', 'support')),
	CONSTRAINT "audit_events_source_check" CHECK ("audit_events"."source" IN ('web', 'worker', 'migration', 'support', 'system')),
	CONSTRAINT "audit_events_retention_check" CHECK ("audit_events"."retention_class" IN ('operational', 'security', 'financial', 'safeguarding', 'legal_hold')),
	CONSTRAINT "audit_events_data_classes_check" CHECK (jsonb_typeof("audit_events"."data_classes") = 'array' AND jsonb_array_length("audit_events"."data_classes") BETWEEN 1 AND 8 AND "audit_events"."data_classes" <@ '["internal", "student_personal", "financial", "health", "safeguarding", "credential"]'::jsonb),
	CONSTRAINT "audit_events_json_shape_check" CHECK (jsonb_typeof("audit_events"."change_summary") = 'object' AND ("audit_events"."policy_decision" IS NULL OR jsonb_typeof("audit_events"."policy_decision") = 'object')),
	CONSTRAINT "audit_events_account_actor_check" CHECK (("audit_events"."actor_type" NOT IN ('account', 'support')) OR ("audit_events"."actor_account_id" IS NOT NULL AND "audit_events"."actor_person_id" IS NOT NULL)),
	CONSTRAINT "audit_events_support_context_check" CHECK (("audit_events"."actor_type" = 'support' AND "audit_events"."support_grant_id" IS NOT NULL AND "audit_events"."purpose" IS NOT NULL AND "audit_events"."source" = 'support') OR ("audit_events"."actor_type" <> 'support' AND "audit_events"."support_grant_id" IS NULL)),
	CONSTRAINT "audit_events_content_hash_check" CHECK ("audit_events"."content_hash" ~ '^[0-9a-f]{64}$')
) PARTITION BY RANGE ("occurred_at");
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_events_2026_q3" PARTITION OF "audit_events"
	FOR VALUES FROM ('2026-07-01T00:00:00Z') TO ('2026-10-01T00:00:00Z');--> statement-breakpoint
CREATE TABLE "audit_events_default" PARTITION OF "audit_events" DEFAULT;--> statement-breakpoint
CREATE TABLE "audit_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"audit_event_id" uuid NOT NULL,
	"audit_event_occurred_at" timestamp with time zone NOT NULL,
	"topic" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"correlation_id" text NOT NULL,
	"context" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text DEFAULT 'pending' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_outbox_tenant_dedup_unique" UNIQUE("tenant_id","deduplication_key"),
	CONSTRAINT "audit_outbox_attempt_nonnegative" CHECK ("audit_outbox"."attempt_count" >= 0),
	CONSTRAINT "audit_outbox_topic_format" CHECK ("audit_outbox"."topic" ~ '^[a-z][a-z0-9_.]{2,127}$'),
	CONSTRAINT "audit_outbox_reference_format" CHECK (char_length("audit_outbox"."deduplication_key") BETWEEN 1 AND 512 AND char_length("audit_outbox"."correlation_id") BETWEEN 1 AND 512),
	CONSTRAINT "audit_outbox_context_binding_check" CHECK (jsonb_typeof("audit_outbox"."context") = 'object' AND jsonb_typeof("audit_outbox"."payload") = 'object' AND "audit_outbox"."context" ->> 'tenantId' = "audit_outbox"."tenant_id"::text AND "audit_outbox"."context" ->> 'correlationId' = "audit_outbox"."correlation_id" AND nullif("audit_outbox"."context" ->> 'requestId', '') IS NOT NULL AND "audit_outbox"."payload" ->> 'auditEventId' = "audit_outbox"."audit_event_id"::text),
	CONSTRAINT "audit_outbox_status_check" CHECK ("audit_outbox"."status" IN ('pending', 'processing', 'published', 'failed', 'dead_letter')),
	CONSTRAINT "audit_outbox_payload_hash_check" CHECK ("audit_outbox"."payload_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "audit_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_outbox" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_archive_manifests" ADD CONSTRAINT "audit_archive_manifests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_actor_person_fk" FOREIGN KEY ("tenant_id","actor_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_organization_fk" FOREIGN KEY ("tenant_id","education_organization_id") REFERENCES "public"."education_organizations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit_outbox" ADD CONSTRAINT "audit_outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit_outbox" ADD CONSTRAINT "audit_outbox_event_fk" FOREIGN KEY ("audit_event_occurred_at","audit_event_id") REFERENCES "public"."audit_events"("occurred_at","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "audit_archive_manifest_chain_idx" ON "audit_archive_manifests" USING btree ("tenant_id","retention_class","period_start");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_time_idx" ON "audit_events" USING btree ("tenant_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_target_idx" ON "audit_events" USING btree ("tenant_id","target_type","target_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("tenant_id","correlation_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_outbox_claim_idx" ON "audit_outbox" USING btree ("tenant_id","status","available_at","id");--> statement-breakpoint
CREATE INDEX "audit_outbox_event_idx" ON "audit_outbox" USING btree ("audit_event_occurred_at","audit_event_id");--> statement-breakpoint
CREATE POLICY "audit_events_runtime_select" ON "audit_events" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "audit_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.audit.read'
        AND public.openschool_audit_scope_allows(
          "audit_events"."tenant_id", "audit_events"."education_organization_id", "audit_events"."school_id"
        )
      );--> statement-breakpoint
CREATE POLICY "audit_events_runtime_insert" ON "audit_events" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (
        "audit_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND "audit_events"."actor_type" IN ('account', 'support')
        AND "audit_events"."actor_account_id" = nullif(current_setting('app.account_id', true), '')::uuid
        AND "audit_events"."actor_person_id" = nullif(current_setting('app.person_id', true), '')::uuid
        AND "audit_events"."request_id" = nullif(current_setting('app.request_id', true), '')
        AND "audit_events"."education_organization_id" IS NOT DISTINCT FROM nullif(current_setting('app.education_organization_id', true), '')::uuid
        AND "audit_events"."school_id" IS NOT DISTINCT FROM nullif(current_setting('app.school_id', true), '')::uuid
        AND (
          ("audit_events"."actor_type" = 'account' AND "audit_events"."source" = 'web' AND "audit_events"."support_grant_id" IS NULL)
          OR ("audit_events"."actor_type" = 'support' AND "audit_events"."source" = 'support' AND "audit_events"."support_grant_id" IS NOT NULL AND "audit_events"."purpose" IS NOT NULL)
        )
      );--> statement-breakpoint
CREATE POLICY "audit_events_runtime_update_deny" ON "audit_events" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "audit_events_runtime_delete_deny" ON "audit_events" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "audit_events_worker_select" ON "audit_events" AS PERMISSIVE FOR SELECT TO "openschool_worker" USING ("audit_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "audit_events_worker_insert" ON "audit_events" AS PERMISSIVE FOR INSERT TO "openschool_worker" WITH CHECK (
        "audit_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND "audit_events"."actor_type" = 'worker'
        AND "audit_events"."actor_account_id" IS NULL
        AND "audit_events"."actor_person_id" IS NULL
        AND "audit_events"."source" = 'worker'
      );--> statement-breakpoint
CREATE POLICY "audit_events_worker_update_deny" ON "audit_events" AS PERMISSIVE FOR UPDATE TO "openschool_worker" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "audit_events_worker_delete_deny" ON "audit_events" AS PERMISSIVE FOR DELETE TO "openschool_worker" USING (false);--> statement-breakpoint
CREATE POLICY "audit_outbox_runtime_select" ON "audit_outbox" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "audit_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND "audit_outbox"."context" ->> 'requestId' = nullif(current_setting('app.request_id', true), '')
      );--> statement-breakpoint
CREATE POLICY "audit_outbox_runtime_insert" ON "audit_outbox" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (
        "audit_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND "audit_outbox"."context" ->> 'requestId' = nullif(current_setting('app.request_id', true), '')
      );--> statement-breakpoint
CREATE POLICY "audit_outbox_runtime_update_deny" ON "audit_outbox" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "audit_outbox_runtime_delete_deny" ON "audit_outbox" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "audit_outbox_worker_select" ON "audit_outbox" AS PERMISSIVE FOR SELECT TO "openschool_worker" USING ("audit_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "audit_outbox_worker_update" ON "audit_outbox" AS PERMISSIVE FOR UPDATE TO "openschool_worker" USING ("audit_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("audit_outbox"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "audit_outbox_worker_insert_deny" ON "audit_outbox" AS PERMISSIVE FOR INSERT TO "openschool_worker" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "audit_outbox_worker_delete_deny" ON "audit_outbox" AS PERMISSIVE FOR DELETE TO "openschool_worker" USING (false);--> statement-breakpoint

CREATE FUNCTION "openschool_guard_audit_event_insert"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
	field_name text;
	field_value jsonb;
	summary_side text;
	allowed_value_fields text[] := ARRAY[]::text[];
BEGIN
	IF EXISTS (
		SELECT 1
		FROM jsonb_object_keys(NEW.change_summary) AS summary_key
		WHERE summary_key NOT IN ('changedFields', 'before', 'after')
	) THEN
		RAISE EXCEPTION 'Audit change summary has an unsupported top-level field'
			USING ERRCODE = '22023';
	END IF;

	IF NEW.change_summary ? 'changedFields' THEN
		IF jsonb_typeof(NEW.change_summary -> 'changedFields') <> 'array' THEN
			RAISE EXCEPTION 'Audit changedFields must be an array'
				USING ERRCODE = '22023';
		END IF;
		FOR field_value IN SELECT value FROM jsonb_array_elements(NEW.change_summary -> 'changedFields')
		LOOP
			IF jsonb_typeof(field_value) <> 'string'
				OR (field_value #>> '{}') !~ '^[a-z][A-Za-z0-9]{0,63}$'
			THEN
				RAISE EXCEPTION 'Audit changedFields contains an unsafe label'
					USING ERRCODE = '22023';
			END IF;
		END LOOP;
	END IF;

	IF NEW.data_classes ?| ARRAY['health', 'safeguarding', 'credential']
		AND (NEW.change_summary ? 'before' OR NEW.change_summary ? 'after')
	THEN
		RAISE EXCEPTION 'Sensitive Audit classes cannot contain generic values'
			USING ERRCODE = '22023';
	END IF;

	CASE NEW.event_type
		WHEN 'student.create', 'student.update' THEN
			allowed_value_fields := ARRAY['schoolId', 'status'];
		WHEN 'account_link.activate', 'account_link.revoke' THEN
			allowed_value_fields := ARRAY['status', 'membershipVersion'];
		WHEN 'audit.read.intent' THEN
			allowed_value_fields := ARRAY['limit'];
		WHEN 'audit.read' THEN
			allowed_value_fields := ARRAY['resultCount'];
		WHEN 'audit.export.request' THEN
			allowed_value_fields := ARRAY['format'];
		ELSE
			allowed_value_fields := ARRAY[]::text[];
	END CASE;

	FOREACH summary_side IN ARRAY ARRAY['before', 'after']
	LOOP
		IF NEW.change_summary ? summary_side THEN
			IF jsonb_typeof(NEW.change_summary -> summary_side) <> 'object' THEN
				RAISE EXCEPTION 'Audit before/after summary must be an object'
					USING ERRCODE = '22023';
			END IF;
			FOR field_name, field_value IN
				SELECT key, value FROM jsonb_each(NEW.change_summary -> summary_side)
			LOOP
				IF NOT field_name = ANY(allowed_value_fields) THEN
					RAISE EXCEPTION 'Audit value field is not allowlisted: %', field_name
						USING ERRCODE = '22023';
				END IF;
				IF jsonb_typeof(field_value) NOT IN ('string', 'number', 'boolean', 'null')
					OR (jsonb_typeof(field_value) = 'string' AND length(field_value #>> '{}') > 256)
				THEN
					RAISE EXCEPTION 'Audit value is unsafe: %', field_name
						USING ERRCODE = '22023';
				END IF;
			END LOOP;
		END IF;
	END LOOP;

	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_hash_audit_event_on_insert"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
SET timezone = 'UTC'
AS $$
BEGIN
	NEW.content_hash := encode(
		digest(
			convert_to((to_jsonb(NEW) - 'content_hash')::text, 'UTF8'),
			'sha256'
		),
		'hex'
	);
	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_hash_audit_outbox_on_insert"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
SET timezone = 'UTC'
AS $$
BEGIN
	NEW.payload_hash := encode(
		digest(
			convert_to(
				jsonb_build_object(
					'id', NEW.id,
					'tenantId', NEW.tenant_id,
					'auditEventId', NEW.audit_event_id,
					'auditEventOccurredAt', NEW.audit_event_occurred_at,
					'topic', NEW.topic,
					'deduplicationKey', NEW.deduplication_key,
					'correlationId', NEW.correlation_id,
					'context', NEW.context,
					'payload', NEW.payload,
					'createdAt', NEW.created_at
				)::text,
				'UTF8'
			),
			'sha256'
		),
		'hex'
	);
	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_guard_audit_outbox_insert"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	IF NEW.status <> 'pending'
		OR NEW.attempt_count <> 0
		OR NEW.locked_at IS NOT NULL
		OR NEW.published_at IS NOT NULL
		OR NEW.last_error_code IS NOT NULL
	THEN
		RAISE EXCEPTION 'New Audit Outbox evidence must start pending and unclaimed'
			USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_audit_event_hash_matches"(event "audit_events")
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
SET timezone = 'UTC'
AS $$
	SELECT event.content_hash = encode(
		digest(
			convert_to((to_jsonb(event) - 'content_hash')::text, 'UTF8'),
			'sha256'
		),
		'hex'
	)
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_reject_audit_event_change"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	RAISE EXCEPTION 'Audit Events are append-only'
		USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_guard_audit_outbox_change"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
		OR NEW.audit_event_id IS DISTINCT FROM OLD.audit_event_id
		OR NEW.audit_event_occurred_at IS DISTINCT FROM OLD.audit_event_occurred_at
		OR NEW.topic IS DISTINCT FROM OLD.topic
		OR NEW.deduplication_key IS DISTINCT FROM OLD.deduplication_key
		OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
		OR NEW.context IS DISTINCT FROM OLD.context
		OR NEW.payload IS DISTINCT FROM OLD.payload
		OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	THEN
		RAISE EXCEPTION 'Audit Outbox evidence anchors are immutable'
			USING ERRCODE = '55000';
	END IF;

	IF NOT (
		(OLD.status IN ('pending', 'failed') AND NEW.status = 'processing')
		OR (OLD.status = 'processing' AND NEW.status IN ('published', 'failed', 'dead_letter'))
	) THEN
		RAISE EXCEPTION 'Invalid Audit Outbox status transition: % to %', OLD.status, NEW.status
			USING ERRCODE = '55000';
	END IF;

	IF NEW.updated_at < OLD.updated_at THEN
		RAISE EXCEPTION 'Audit Outbox update time cannot move backwards'
			USING ERRCODE = '55000';
	END IF;

	IF NEW.status = 'processing' THEN
		IF NEW.attempt_count <> OLD.attempt_count + 1 OR NEW.locked_at IS NULL
			OR NEW.last_error_code IS NOT NULL
		THEN
			RAISE EXCEPTION 'Audit Outbox claim evidence is invalid'
				USING ERRCODE = '55000';
		END IF;
	ELSIF NEW.attempt_count <> OLD.attempt_count OR NEW.locked_at IS NOT NULL THEN
		RAISE EXCEPTION 'Audit Outbox completion evidence is invalid'
			USING ERRCODE = '55000';
	END IF;

	IF NEW.status = 'published' AND (NEW.published_at IS NULL OR NEW.last_error_code IS NOT NULL) THEN
		RAISE EXCEPTION 'Published Audit Outbox evidence is incomplete'
			USING ERRCODE = '55000';
	END IF;
	IF NEW.status IN ('failed', 'dead_letter') AND NEW.last_error_code IS NULL THEN
		RAISE EXCEPTION 'Failed Audit Outbox evidence needs an error code'
			USING ERRCODE = '55000';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_reject_audit_evidence_delete"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	RAISE EXCEPTION 'Committed Audit evidence cannot be deleted'
		USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint

CREATE TRIGGER "audit_events_hash_on_insert"
	BEFORE INSERT ON "audit_events"
	FOR EACH ROW EXECUTE FUNCTION "openschool_hash_audit_event_on_insert"();--> statement-breakpoint
CREATE TRIGGER "audit_events_insert_guard"
	BEFORE INSERT ON "audit_events"
	FOR EACH ROW EXECUTE FUNCTION "openschool_guard_audit_event_insert"();--> statement-breakpoint
CREATE TRIGGER "audit_events_update_rejected"
	BEFORE UPDATE ON "audit_events"
	FOR EACH ROW EXECUTE FUNCTION "openschool_reject_audit_event_change"();--> statement-breakpoint
CREATE TRIGGER "audit_events_delete_rejected"
	BEFORE DELETE ON "audit_events"
	FOR EACH ROW EXECUTE FUNCTION "openschool_reject_audit_evidence_delete"();--> statement-breakpoint

CREATE TRIGGER "audit_outbox_hash_on_insert"
	BEFORE INSERT ON "audit_outbox"
	FOR EACH ROW EXECUTE FUNCTION "openschool_hash_audit_outbox_on_insert"();--> statement-breakpoint
CREATE TRIGGER "audit_outbox_insert_guard"
	BEFORE INSERT ON "audit_outbox"
	FOR EACH ROW EXECUTE FUNCTION "openschool_guard_audit_outbox_insert"();--> statement-breakpoint
CREATE TRIGGER "audit_outbox_update_guard"
	BEFORE UPDATE ON "audit_outbox"
	FOR EACH ROW EXECUTE FUNCTION "openschool_guard_audit_outbox_change"();--> statement-breakpoint
CREATE TRIGGER "audit_outbox_delete_rejected"
	BEFORE DELETE ON "audit_outbox"
	FOR EACH ROW EXECUTE FUNCTION "openschool_reject_audit_evidence_delete"();--> statement-breakpoint

CREATE TRIGGER "audit_archive_manifest_update_rejected"
	BEFORE UPDATE ON "audit_archive_manifests"
	FOR EACH ROW EXECUTE FUNCTION "openschool_reject_audit_event_change"();--> statement-breakpoint
CREATE TRIGGER "audit_archive_manifest_delete_rejected"
	BEFORE DELETE ON "audit_archive_manifests"
	FOR EACH ROW EXECUTE FUNCTION "openschool_reject_audit_evidence_delete"();--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_hash_audit_event_on_insert"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_guard_audit_event_insert"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_hash_audit_outbox_on_insert"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_guard_audit_outbox_insert"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_audit_event_hash_matches"("audit_events") FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_reject_audit_event_change"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_guard_audit_outbox_change"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_reject_audit_evidence_delete"() FROM PUBLIC;
