CREATE TABLE "household_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"address_key" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"address_type" text NOT NULL,
	"label" text,
	"line1" text NOT NULL,
	"line2" text,
	"locality" text NOT NULL,
	"administrative_area" text,
	"postal_code" text,
	"country_code" text NOT NULL,
	"normalized_address" text NOT NULL,
	"delivery_instructions" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"issued_by_account_id" uuid NOT NULL,
	"issuance_reason" text NOT NULL,
	"ended_by_account_id" uuid,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_addresses_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "household_addresses_tenant_key_version_unique" UNIQUE("tenant_id","address_key","version"),
	CONSTRAINT "household_addresses_type_check" CHECK ("household_addresses"."address_type" IN ('residential', 'mailing', 'temporary', 'other')),
	CONSTRAINT "household_addresses_country_code_check" CHECK ("household_addresses"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "household_addresses_required_text_check" CHECK (char_length(btrim("household_addresses"."line1")) BETWEEN 1 AND 200 AND char_length(btrim("household_addresses"."locality")) BETWEEN 1 AND 120 AND char_length(btrim("household_addresses"."normalized_address")) BETWEEN 3 AND 600),
	CONSTRAINT "household_addresses_valid_period_check" CHECK ("household_addresses"."valid_until" IS NULL OR "household_addresses"."valid_until" > "household_addresses"."valid_from"),
	CONSTRAINT "household_addresses_end_evidence_check" CHECK ("household_addresses"."status" <> 'ended' OR ("household_addresses"."valid_until" IS NOT NULL AND "household_addresses"."ended_by_account_id" IS NOT NULL AND char_length(btrim("household_addresses"."end_reason")) BETWEEN 3 AND 512)),
	CONSTRAINT "household_addresses_version_positive" CHECK ("household_addresses"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "household_addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "household_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"membership_key" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"membership_kind" text NOT NULL,
	"is_primary_residence" boolean DEFAULT false NOT NULL,
	"is_primary_mailing" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"issued_by_account_id" uuid NOT NULL,
	"issuance_reason" text NOT NULL,
	"ended_by_account_id" uuid,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_memberships_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "household_memberships_tenant_key_version_unique" UNIQUE("tenant_id","membership_key","version"),
	CONSTRAINT "household_memberships_kind_check" CHECK ("household_memberships"."membership_kind" IN ('resident', 'associated')),
	CONSTRAINT "household_memberships_primary_requires_resident" CHECK ((NOT "household_memberships"."is_primary_residence" AND NOT "household_memberships"."is_primary_mailing") OR "household_memberships"."membership_kind" = 'resident'),
	CONSTRAINT "household_memberships_valid_period_check" CHECK ("household_memberships"."valid_until" IS NULL OR "household_memberships"."valid_until" > "household_memberships"."valid_from"),
	CONSTRAINT "household_memberships_end_evidence_check" CHECK ("household_memberships"."status" <> 'ended' OR ("household_memberships"."valid_until" IS NOT NULL AND "household_memberships"."ended_by_account_id" IS NOT NULL AND char_length(btrim("household_memberships"."end_reason")) BETWEEN 3 AND 512)),
	CONSTRAINT "household_memberships_version_positive" CHECK ("household_memberships"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "household_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"normalized_display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by_account_id" uuid NOT NULL,
	"creation_reason" text NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_account_id" uuid,
	"closure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "households_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "households_name_check" CHECK (char_length(btrim("households"."display_name")) BETWEEN 1 AND 160 AND char_length(btrim("households"."normalized_display_name")) BETWEEN 1 AND 160),
	CONSTRAINT "households_status_check" CHECK ("households"."status" IN ('active', 'closed')),
	CONSTRAINT "households_version_positive" CHECK ("households"."version" > 0),
	CONSTRAINT "households_creation_reason_check" CHECK (char_length(btrim("households"."creation_reason")) BETWEEN 3 AND 512),
	CONSTRAINT "households_closure_evidence_check" CHECK ("households"."status" <> 'closed' OR ("households"."closed_at" IS NOT NULL AND "households"."closed_by_account_id" IS NOT NULL AND char_length(btrim("households"."closure_reason")) BETWEEN 3 AND 512))
);
--> statement-breakpoint
ALTER TABLE "households" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "household_addresses" ADD CONSTRAINT "household_addresses_issued_by_account_id_accounts_id_fk" FOREIGN KEY ("issued_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "household_addresses" ADD CONSTRAINT "household_addresses_ended_by_account_id_accounts_id_fk" FOREIGN KEY ("ended_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "household_addresses" ADD CONSTRAINT "household_addresses_tenant_household_fk" FOREIGN KEY ("tenant_id","household_id") REFERENCES "public"."households"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "household_memberships" ADD CONSTRAINT "household_memberships_issued_by_account_id_accounts_id_fk" FOREIGN KEY ("issued_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "household_memberships" ADD CONSTRAINT "household_memberships_ended_by_account_id_accounts_id_fk" FOREIGN KEY ("ended_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "household_memberships" ADD CONSTRAINT "household_memberships_tenant_household_fk" FOREIGN KEY ("tenant_id","household_id") REFERENCES "public"."households"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "household_memberships" ADD CONSTRAINT "household_memberships_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_closed_by_account_id_accounts_id_fk" FOREIGN KEY ("closed_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "household_addresses_household_effective_idx" ON "household_addresses" USING btree ("tenant_id","household_id","status","valid_from","valid_until","id");--> statement-breakpoint
CREATE INDEX "household_memberships_household_effective_idx" ON "household_memberships" USING btree ("tenant_id","household_id","status","valid_from","valid_until","id");--> statement-breakpoint
CREATE INDEX "household_memberships_person_effective_idx" ON "household_memberships" USING btree ("tenant_id","person_id","status","valid_from","valid_until","id");--> statement-breakpoint
CREATE INDEX "households_tenant_status_name_idx" ON "households" USING btree ("tenant_id","status","normalized_display_name","id");--> statement-breakpoint
ALTER TABLE "households" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "household_addresses" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "household_memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "household_memberships"
  ADD CONSTRAINT "household_memberships_no_effective_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "household_id" WITH =,
    "person_id" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active');--> statement-breakpoint
ALTER TABLE "household_memberships"
  ADD CONSTRAINT "household_memberships_primary_residence_no_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "person_id" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active' AND "is_primary_residence");--> statement-breakpoint
ALTER TABLE "household_memberships"
  ADD CONSTRAINT "household_memberships_primary_mailing_no_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "person_id" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active' AND "is_primary_mailing");--> statement-breakpoint
ALTER TABLE "household_addresses"
  ADD CONSTRAINT "household_addresses_lineage_no_effective_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "address_key" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active');--> statement-breakpoint
ALTER TABLE "household_addresses"
  ADD CONSTRAINT "household_addresses_primary_type_no_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "household_id" WITH =,
    "address_type" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active' AND "is_primary");--> statement-breakpoint

CREATE FUNCTION "openschool_household_person_read_scope_allows"(
  row_tenant_id uuid,
  row_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    row_tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND nullif(current_setting('app.policy_capability', true), '')
      IN ('tenant.households.read', 'tenant.households.manage')
    AND (
      EXISTS (
        SELECT 1
        FROM public.school_enrollments AS enrollment
        WHERE enrollment.tenant_id = row_tenant_id
          AND enrollment.person_id = row_person_id
          AND public.openschool_canonical_student_scope_allows(
            enrollment.tenant_id, enrollment.school_id, enrollment.person_id
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.person_relationships AS relationship
        WHERE relationship.tenant_id = row_tenant_id
          AND relationship.subject_person_id = row_person_id
          AND relationship.type IN ('parent_of', 'guardian_of', 'emergency_contact_of')
          AND public.openschool_guardian_contact_read_scope_allows(
            relationship.tenant_id, relationship.related_person_id
          )
      )
    )
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_household_person_manage_scope_allows"(
  row_tenant_id uuid,
  row_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    row_tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
    AND (
      EXISTS (
        SELECT 1
        FROM public.school_enrollments AS enrollment
        WHERE enrollment.tenant_id = row_tenant_id
          AND enrollment.person_id = row_person_id
          AND enrollment.status = 'enrolled'
          AND enrollment.valid_from <= now()
          AND (enrollment.valid_until IS NULL OR enrollment.valid_until > now())
          AND public.openschool_canonical_student_scope_allows(
            enrollment.tenant_id, enrollment.school_id, enrollment.person_id
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.person_relationships AS relationship
        WHERE relationship.tenant_id = row_tenant_id
          AND relationship.subject_person_id = row_person_id
          AND relationship.type IN ('parent_of', 'guardian_of', 'emergency_contact_of')
          AND relationship.status = 'active'
          AND relationship.valid_from <= now()
          AND (relationship.valid_until IS NULL OR relationship.valid_until > now())
          AND public.openschool_guardian_contact_manage_scope_allows(
            relationship.tenant_id, relationship.related_person_id
          )
      )
    )
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_household_read_scope_allows"(
  row_tenant_id uuid,
  row_household_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_memberships AS membership
    WHERE membership.tenant_id = row_tenant_id
      AND membership.household_id = row_household_id
      AND public.openschool_household_person_read_scope_allows(
        membership.tenant_id, membership.person_id
      )
  )
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_household_manage_scope_allows"(
  row_tenant_id uuid,
  row_household_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_memberships AS membership
    WHERE membership.tenant_id = row_tenant_id
      AND membership.household_id = row_household_id
      AND membership.status = 'active'
      AND membership.valid_from <= now()
      AND (membership.valid_until IS NULL OR membership.valid_until > now())
      AND public.openschool_household_person_manage_scope_allows(
        membership.tenant_id, membership.person_id
      )
  )
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_household_member_read_scope_allows"(
  row_tenant_id uuid,
  row_household_id uuid,
  row_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT public.openschool_household_read_scope_allows(row_tenant_id, row_household_id)
    AND public.openschool_household_person_read_scope_allows(row_tenant_id, row_person_id)
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_household_member_manage_scope_allows"(
  row_tenant_id uuid,
  row_household_id uuid,
  row_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT public.openschool_household_manage_scope_allows(row_tenant_id, row_household_id)
    AND public.openschool_household_person_manage_scope_allows(row_tenant_id, row_person_id)
$$;--> statement-breakpoint

ALTER FUNCTION "openschool_household_person_read_scope_allows"(uuid, uuid)
  OWNER TO "openschool_household_scope_resolver";--> statement-breakpoint
ALTER FUNCTION "openschool_household_person_manage_scope_allows"(uuid, uuid)
  OWNER TO "openschool_household_scope_resolver";--> statement-breakpoint
ALTER FUNCTION "openschool_household_read_scope_allows"(uuid, uuid)
  OWNER TO "openschool_household_scope_resolver";--> statement-breakpoint
ALTER FUNCTION "openschool_household_manage_scope_allows"(uuid, uuid)
  OWNER TO "openschool_household_scope_resolver";--> statement-breakpoint
ALTER FUNCTION "openschool_household_member_read_scope_allows"(uuid, uuid, uuid)
  OWNER TO "openschool_household_scope_resolver";--> statement-breakpoint
ALTER FUNCTION "openschool_household_member_manage_scope_allows"(uuid, uuid, uuid)
  OWNER TO "openschool_household_scope_resolver";--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_household_person_read_scope_allows"(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_household_person_manage_scope_allows"(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_household_read_scope_allows"(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_household_manage_scope_allows"(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_household_member_read_scope_allows"(uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_household_member_manage_scope_allows"(uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_household_read_scope_allows"(uuid, uuid),
  "openschool_household_manage_scope_allows"(uuid, uuid),
  "openschool_household_member_read_scope_allows"(uuid, uuid, uuid),
  "openschool_household_member_manage_scope_allows"(uuid, uuid, uuid)
  TO "openschool_runtime", "openschool_household_manager";--> statement-breakpoint

DROP POLICY "school_enrollments_runtime_select" ON "school_enrollments";--> statement-breakpoint
CREATE POLICY "school_enrollments_runtime_select" ON "school_enrollments"
  AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
    "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND nullif(current_setting('app.policy_capability', true), '') IN (
      'tenant.students.read', 'tenant.students.update',
      'tenant.students.delete', 'support.students.read',
      'tenant.student_enrollments.read', 'tenant.student_enrollments.manage',
      'tenant.guardian_contacts.read', 'tenant.guardian_contacts.manage',
      'tenant.households.read', 'tenant.households.manage',
      'identity.context.resolve'
    )
    AND public.openschool_canonical_student_scope_allows(
      "school_enrollments"."tenant_id",
      "school_enrollments"."school_id",
      "school_enrollments"."person_id"
    )
  );--> statement-breakpoint

CREATE POLICY "school_enrollments_household_scope_resolver_select" ON "school_enrollments"
  AS PERMISSIVE FOR SELECT TO "openschool_household_scope_resolver" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_household_scope_resolver'
    AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND nullif(current_setting('app.policy_capability', true), '')
      IN ('tenant.households.read', 'tenant.households.manage')
    AND public.openschool_canonical_student_scope_allows(
      "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
    )
  );--> statement-breakpoint
CREATE POLICY "person_relationships_household_scope_resolver_select" ON "person_relationships"
  AS PERMISSIVE FOR SELECT TO "openschool_household_scope_resolver" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_household_scope_resolver'
    AND "person_relationships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND "person_relationships"."type" IN ('parent_of', 'guardian_of', 'emergency_contact_of')
    AND (
      (
        nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.read'
        AND public.openschool_guardian_contact_read_scope_allows(
          "person_relationships"."tenant_id", "person_relationships"."related_person_id"
        )
      )
      OR (
        nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
        AND public.openschool_guardian_contact_manage_scope_allows(
          "person_relationships"."tenant_id", "person_relationships"."related_person_id"
        )
      )
    )
  );--> statement-breakpoint
CREATE POLICY "household_memberships_scope_resolver_select" ON "household_memberships"
  AS PERMISSIVE FOR SELECT TO "openschool_household_scope_resolver" USING (
    session_user = 'openschool_runtime'
    AND current_user = 'openschool_household_scope_resolver'
    AND "household_memberships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND (
      (
        nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.read'
        AND public.openschool_household_person_read_scope_allows(
          "household_memberships"."tenant_id", "household_memberships"."person_id"
        )
      )
      OR (
        nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
        AND public.openschool_household_person_manage_scope_allows(
          "household_memberships"."tenant_id", "household_memberships"."person_id"
        )
      )
    )
  );--> statement-breakpoint
GRANT USAGE ON SCHEMA "public" TO "openschool_household_scope_resolver";--> statement-breakpoint
GRANT SELECT ON "school_enrollments", "person_relationships", "household_memberships"
  TO "openschool_household_scope_resolver";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_policy_constraints"(),
  "openschool_school_scope_allows"(uuid, uuid),
  "openschool_canonical_student_scope_allows"(uuid, uuid, uuid),
  "openschool_guardian_contact_read_scope_allows"(uuid, uuid),
  "openschool_guardian_contact_manage_scope_allows"(uuid, uuid)
  TO "openschool_household_scope_resolver";--> statement-breakpoint
CREATE POLICY "household_addresses_runtime_select" ON "household_addresses" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "household_addresses"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN ('tenant.households.read', 'tenant.households.manage')
  AND public.openschool_household_read_scope_allows("household_addresses"."tenant_id", "household_addresses"."household_id")
);--> statement-breakpoint
CREATE POLICY "household_addresses_runtime_insert_deny" ON "household_addresses" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "household_addresses_runtime_update_deny" ON "household_addresses" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "household_addresses_runtime_delete_deny" ON "household_addresses" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "household_addresses_manager_select" ON "household_addresses" AS PERMISSIVE FOR SELECT TO "openschool_household_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_household_manager'
  AND "household_addresses"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
  AND public.openschool_household_manage_scope_allows("household_addresses"."tenant_id", "household_addresses"."household_id")
);--> statement-breakpoint
CREATE POLICY "household_addresses_manager_insert" ON "household_addresses" AS PERMISSIVE FOR INSERT TO "openschool_household_manager" WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_household_manager'
  AND "household_addresses"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
  AND public.openschool_household_manage_scope_allows("household_addresses"."tenant_id", "household_addresses"."household_id")
);--> statement-breakpoint
CREATE POLICY "household_addresses_manager_update" ON "household_addresses" AS PERMISSIVE FOR UPDATE TO "openschool_household_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_household_manager'
  AND "household_addresses"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
  AND public.openschool_household_manage_scope_allows("household_addresses"."tenant_id", "household_addresses"."household_id")
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_household_manager'
  AND "household_addresses"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
  AND public.openschool_household_manage_scope_allows("household_addresses"."tenant_id", "household_addresses"."household_id")
);--> statement-breakpoint
CREATE POLICY "household_addresses_manager_delete_deny" ON "household_addresses" AS PERMISSIVE FOR DELETE TO "openschool_household_manager" USING (false);--> statement-breakpoint
CREATE POLICY "household_memberships_runtime_select" ON "household_memberships" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "household_memberships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.households.read', 'tenant.households.manage')
        AND public.openschool_household_member_read_scope_allows(
          "household_memberships"."tenant_id", "household_memberships"."household_id", "household_memberships"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "household_memberships_runtime_insert_deny" ON "household_memberships" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "household_memberships_runtime_update_deny" ON "household_memberships" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "household_memberships_runtime_delete_deny" ON "household_memberships" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "household_memberships_manager_select" ON "household_memberships" AS PERMISSIVE FOR SELECT TO "openschool_household_manager" USING (

  session_user = 'openschool_runtime'
  AND current_user = 'openschool_household_manager'
  AND "household_memberships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
  AND public.openschool_household_manage_scope_allows("household_memberships"."tenant_id", "household_memberships"."household_id")

        AND public.openschool_household_person_manage_scope_allows(
          "household_memberships"."tenant_id", "household_memberships"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "household_memberships_manager_insert" ON "household_memberships" AS PERMISSIVE FOR INSERT TO "openschool_household_manager" WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_household_manager'
        AND "household_memberships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
        AND public.openschool_household_person_manage_scope_allows(
          "household_memberships"."tenant_id", "household_memberships"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "household_memberships_manager_update" ON "household_memberships" AS PERMISSIVE FOR UPDATE TO "openschool_household_manager" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_household_manager'
        AND "household_memberships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
        AND public.openschool_household_person_manage_scope_allows(
          "household_memberships"."tenant_id", "household_memberships"."person_id"
        )
      ) WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_household_manager'
        AND "household_memberships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
        AND public.openschool_household_person_manage_scope_allows(
          "household_memberships"."tenant_id", "household_memberships"."person_id"
        )
      );--> statement-breakpoint
CREATE POLICY "household_memberships_manager_delete_deny" ON "household_memberships" AS PERMISSIVE FOR DELETE TO "openschool_household_manager" USING (false);--> statement-breakpoint
CREATE POLICY "households_runtime_select" ON "households" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
  "households"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN ('tenant.households.read', 'tenant.households.manage')
  AND public.openschool_household_read_scope_allows("households"."tenant_id", "households"."id")
);--> statement-breakpoint
CREATE POLICY "households_runtime_insert_deny" ON "households" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "households_runtime_update_deny" ON "households" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "households_runtime_delete_deny" ON "households" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "households_manager_select" ON "households" AS PERMISSIVE FOR SELECT TO "openschool_household_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_household_manager'
  AND "households"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
  AND public.openschool_household_manage_scope_allows("households"."tenant_id", "households"."id")
);--> statement-breakpoint
CREATE POLICY "households_manager_insert" ON "households" AS PERMISSIVE FOR INSERT TO "openschool_household_manager" WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_household_manager'
        AND "households"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
      );--> statement-breakpoint
CREATE POLICY "households_manager_update" ON "households" AS PERMISSIVE FOR UPDATE TO "openschool_household_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_household_manager'
  AND "households"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
  AND public.openschool_household_manage_scope_allows("households"."tenant_id", "households"."id")
) WITH CHECK (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_household_manager'
  AND "households"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
  AND public.openschool_household_manage_scope_allows("households"."tenant_id", "households"."id")
);--> statement-breakpoint
CREATE POLICY "households_manager_delete_deny" ON "households" AS PERMISSIVE FOR DELETE TO "openschool_household_manager" USING (false);
--> statement-breakpoint

CREATE FUNCTION "openschool_private"."create_household"(
  p_household_id uuid,
  p_membership_id uuid,
  p_membership_key uuid,
  p_address_id uuid,
  p_address_key uuid,
  p_learner_person_id uuid,
  p_display_name text,
  p_normalized_display_name text,
  p_address_type text,
  p_address_label text,
  p_line1 text,
  p_line2 text,
  p_locality text,
  p_administrative_area text,
  p_postal_code text,
  p_country_code text,
  p_normalized_address text,
  p_delivery_instructions text,
  p_is_primary_residence boolean,
  p_is_primary_mailing boolean,
  p_valid_from timestamp with time zone,
  p_reason text
)
RETURNS TABLE (
  household_id uuid,
  membership_id uuid,
  address_id uuid,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_occurred_at timestamp with time zone := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_household_manager'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.households.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.request_id', true), '') IS NULL
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR p_household_id IS NULL
    OR p_membership_id IS NULL
    OR p_membership_key IS NULL
    OR p_address_id IS NULL
    OR p_address_key IS NULL
    OR p_learner_person_id IS NULL
    OR p_address_type NOT IN ('residential', 'mailing', 'temporary', 'other')
    OR p_valid_from IS NULL
    OR char_length(btrim(p_display_name)) NOT BETWEEN 1 AND 160
    OR char_length(btrim(p_normalized_display_name)) NOT BETWEEN 1 AND 160
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
    OR NOT public.openschool_household_person_manage_scope_allows(
      v_tenant_id, p_learner_person_id
    )
  THEN
    RAISE EXCEPTION 'HOUSEHOLD_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.households (
    id, tenant_id, display_name, normalized_display_name, status, version,
    created_by_account_id, creation_reason, created_at, updated_at
  ) VALUES (
    p_household_id, v_tenant_id, btrim(p_display_name), btrim(p_normalized_display_name),
    'active', 1, v_account_id, btrim(p_reason), v_occurred_at, v_occurred_at
  );

  INSERT INTO public.household_memberships (
    id, tenant_id, household_id, person_id, membership_key, version,
    membership_kind, is_primary_residence, is_primary_mailing, status,
    valid_from, issued_by_account_id, issuance_reason, created_at, updated_at
  ) VALUES (
    p_membership_id, v_tenant_id, p_household_id, p_learner_person_id,
    p_membership_key, 1, 'resident', p_is_primary_residence, p_is_primary_mailing,
    'active', p_valid_from, v_account_id, btrim(p_reason), v_occurred_at, v_occurred_at
  );

  INSERT INTO public.household_addresses (
    id, tenant_id, household_id, address_key, version, address_type, label,
    line1, line2, locality, administrative_area, postal_code, country_code,
    normalized_address, delivery_instructions, is_primary, status, valid_from,
    issued_by_account_id, issuance_reason, created_at, updated_at
  ) VALUES (
    p_address_id, v_tenant_id, p_household_id, p_address_key, 1, p_address_type,
    nullif(btrim(p_address_label), ''), btrim(p_line1), nullif(btrim(p_line2), ''),
    btrim(p_locality), nullif(btrim(p_administrative_area), ''),
    nullif(btrim(p_postal_code), ''), upper(btrim(p_country_code)),
    btrim(p_normalized_address), nullif(btrim(p_delivery_instructions), ''),
    true, 'active', p_valid_from, v_account_id, btrim(p_reason),
    v_occurred_at, v_occurred_at
  );

  RETURN QUERY SELECT p_household_id, p_membership_id, p_address_id, v_occurred_at;
END
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."add_household_member"(
  p_membership_id uuid,
  p_membership_key uuid,
  p_household_id uuid,
  p_person_id uuid,
  p_membership_kind text,
  p_is_primary_residence boolean,
  p_is_primary_mailing boolean,
  p_valid_from timestamp with time zone,
  p_reason text
)
RETURNS TABLE (membership_id uuid, version integer, occurred_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_occurred_at timestamp with time zone := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_household_manager'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.households.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.request_id', true), '') IS NULL
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR p_membership_id IS NULL
    OR p_membership_key IS NULL
    OR p_household_id IS NULL
    OR p_person_id IS NULL
    OR p_membership_kind NOT IN ('resident', 'associated')
    OR ((p_is_primary_residence OR p_is_primary_mailing) AND p_membership_kind <> 'resident')
    OR p_valid_from IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
    OR NOT public.openschool_household_manage_scope_allows(v_tenant_id, p_household_id)
    OR NOT public.openschool_household_person_manage_scope_allows(v_tenant_id, p_person_id)
  THEN
    RAISE EXCEPTION 'HOUSEHOLD_MEMBER_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.household_memberships (
    id, tenant_id, household_id, person_id, membership_key, version,
    membership_kind, is_primary_residence, is_primary_mailing, status,
    valid_from, issued_by_account_id, issuance_reason, created_at, updated_at
  ) VALUES (
    p_membership_id, v_tenant_id, p_household_id, p_person_id, p_membership_key, 1,
    p_membership_kind, p_is_primary_residence, p_is_primary_mailing, 'active',
    p_valid_from, v_account_id, btrim(p_reason), v_occurred_at, v_occurred_at
  );

  RETURN QUERY SELECT p_membership_id, 1, v_occurred_at;
END
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."revise_household_member"(
  p_membership_id uuid,
  p_replacement_id uuid,
  p_expected_version integer,
  p_membership_kind text,
  p_is_primary_residence boolean,
  p_is_primary_mailing boolean,
  p_effective_at timestamp with time zone,
  p_reason text
)
RETURNS TABLE (membership_id uuid, version integer, occurred_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_occurred_at timestamp with time zone := clock_timestamp();
  v_membership public.household_memberships%ROWTYPE;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_household_manager'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.households.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.request_id', true), '') IS NULL
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR p_membership_id IS NULL
    OR p_replacement_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_membership_kind NOT IN ('resident', 'associated')
    OR ((p_is_primary_residence OR p_is_primary_mailing) AND p_membership_kind <> 'resident')
    OR p_effective_at IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
  THEN
    RAISE EXCEPTION 'HOUSEHOLD_MEMBER_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT membership.* INTO v_membership
  FROM public.household_memberships AS membership
  WHERE membership.tenant_id = v_tenant_id
    AND membership.id = p_membership_id
    AND membership.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOUSEHOLD_MEMBER_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  IF v_membership.version <> p_expected_version THEN
    RAISE EXCEPTION 'HOUSEHOLD_MEMBER_STALE' USING ERRCODE = '40001';
  END IF;
  IF p_effective_at <= v_membership.valid_from THEN
    RAISE EXCEPTION 'HOUSEHOLD_MEMBER_PERIOD_INVALID' USING ERRCODE = '22023';
  END IF;

  UPDATE public.household_memberships AS membership
  SET status = 'ended', valid_until = p_effective_at, ended_by_account_id = v_account_id,
      end_reason = btrim(p_reason), updated_at = v_occurred_at
  WHERE membership.tenant_id = v_tenant_id AND membership.id = p_membership_id;

  INSERT INTO public.household_memberships (
    id, tenant_id, household_id, person_id, membership_key, version,
    membership_kind, is_primary_residence, is_primary_mailing, status,
    valid_from, issued_by_account_id, issuance_reason, created_at, updated_at
  ) VALUES (
    p_replacement_id, v_tenant_id, v_membership.household_id, v_membership.person_id,
    v_membership.membership_key, p_expected_version + 1, p_membership_kind,
    p_is_primary_residence, p_is_primary_mailing, 'active', p_effective_at,
    v_account_id, btrim(p_reason), v_occurred_at, v_occurred_at
  );

  RETURN QUERY SELECT p_replacement_id, p_expected_version + 1, v_occurred_at;
END
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."end_household_member"(
  p_membership_id uuid,
  p_expected_version integer,
  p_effective_at timestamp with time zone,
  p_reason text
)
RETURNS TABLE (membership_id uuid, version integer, occurred_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_occurred_at timestamp with time zone := clock_timestamp();
  v_membership public.household_memberships%ROWTYPE;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_household_manager'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.households.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.request_id', true), '') IS NULL
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR p_membership_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_effective_at IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
  THEN
    RAISE EXCEPTION 'HOUSEHOLD_MEMBER_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT membership.* INTO v_membership
  FROM public.household_memberships AS membership
  WHERE membership.tenant_id = v_tenant_id
    AND membership.id = p_membership_id
    AND membership.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOUSEHOLD_MEMBER_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  IF v_membership.version <> p_expected_version THEN
    RAISE EXCEPTION 'HOUSEHOLD_MEMBER_STALE' USING ERRCODE = '40001';
  END IF;
  IF p_effective_at <= v_membership.valid_from THEN
    RAISE EXCEPTION 'HOUSEHOLD_MEMBER_PERIOD_INVALID' USING ERRCODE = '22023';
  END IF;

  UPDATE public.household_memberships AS membership
  SET status = 'ended', valid_until = p_effective_at, ended_by_account_id = v_account_id,
      end_reason = btrim(p_reason), updated_at = v_occurred_at
  WHERE membership.tenant_id = v_tenant_id AND membership.id = p_membership_id;

  RETURN QUERY SELECT p_membership_id, p_expected_version, v_occurred_at;
END
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."add_household_address"(
  p_address_id uuid,
  p_address_key uuid,
  p_household_id uuid,
  p_address_type text,
  p_label text,
  p_line1 text,
  p_line2 text,
  p_locality text,
  p_administrative_area text,
  p_postal_code text,
  p_country_code text,
  p_normalized_address text,
  p_delivery_instructions text,
  p_is_primary boolean,
  p_valid_from timestamp with time zone,
  p_reason text
)
RETURNS TABLE (address_id uuid, version integer, occurred_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_occurred_at timestamp with time zone := clock_timestamp();
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_household_manager'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.households.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.request_id', true), '') IS NULL
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR p_address_id IS NULL
    OR p_address_key IS NULL
    OR p_household_id IS NULL
    OR p_address_type NOT IN ('residential', 'mailing', 'temporary', 'other')
    OR p_valid_from IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
    OR NOT public.openschool_household_manage_scope_allows(v_tenant_id, p_household_id)
  THEN
    RAISE EXCEPTION 'HOUSEHOLD_ADDRESS_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.household_addresses (
    id, tenant_id, household_id, address_key, version, address_type, label,
    line1, line2, locality, administrative_area, postal_code, country_code,
    normalized_address, delivery_instructions, is_primary, status, valid_from,
    issued_by_account_id, issuance_reason, created_at, updated_at
  ) VALUES (
    p_address_id, v_tenant_id, p_household_id, p_address_key, 1, p_address_type,
    nullif(btrim(p_label), ''), btrim(p_line1), nullif(btrim(p_line2), ''),
    btrim(p_locality), nullif(btrim(p_administrative_area), ''),
    nullif(btrim(p_postal_code), ''), upper(btrim(p_country_code)),
    btrim(p_normalized_address), nullif(btrim(p_delivery_instructions), ''),
    p_is_primary, 'active', p_valid_from, v_account_id, btrim(p_reason),
    v_occurred_at, v_occurred_at
  );

  RETURN QUERY SELECT p_address_id, 1, v_occurred_at;
END
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."revise_household_address"(
  p_address_id uuid,
  p_replacement_id uuid,
  p_expected_version integer,
  p_address_type text,
  p_label text,
  p_line1 text,
  p_line2 text,
  p_locality text,
  p_administrative_area text,
  p_postal_code text,
  p_country_code text,
  p_normalized_address text,
  p_delivery_instructions text,
  p_is_primary boolean,
  p_effective_at timestamp with time zone,
  p_reason text
)
RETURNS TABLE (address_id uuid, version integer, occurred_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_account_id uuid := nullif(current_setting('app.account_id', true), '')::uuid;
  v_occurred_at timestamp with time zone := clock_timestamp();
  v_address public.household_addresses%ROWTYPE;
BEGIN
  IF session_user <> 'openschool_runtime'
    OR current_user <> 'openschool_household_manager'
    OR nullif(current_setting('app.policy_capability', true), '') <> 'tenant.households.manage'
    OR nullif(current_setting('app.assurance_level', true), '') <> 'aal2'
    OR nullif(current_setting('app.request_id', true), '') IS NULL
    OR v_tenant_id IS NULL
    OR v_account_id IS NULL
    OR p_address_id IS NULL
    OR p_replacement_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_address_type NOT IN ('residential', 'mailing', 'temporary', 'other')
    OR p_effective_at IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 512
  THEN
    RAISE EXCEPTION 'HOUSEHOLD_ADDRESS_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT address.* INTO v_address
  FROM public.household_addresses AS address
  WHERE address.tenant_id = v_tenant_id
    AND address.id = p_address_id
    AND address.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOUSEHOLD_ADDRESS_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  IF v_address.version <> p_expected_version THEN
    RAISE EXCEPTION 'HOUSEHOLD_ADDRESS_STALE' USING ERRCODE = '40001';
  END IF;
  IF p_effective_at <= v_address.valid_from THEN
    RAISE EXCEPTION 'HOUSEHOLD_ADDRESS_PERIOD_INVALID' USING ERRCODE = '22023';
  END IF;

  UPDATE public.household_addresses AS address
  SET status = 'ended', valid_until = p_effective_at, ended_by_account_id = v_account_id,
      end_reason = btrim(p_reason), updated_at = v_occurred_at
  WHERE address.tenant_id = v_tenant_id AND address.id = p_address_id;

  INSERT INTO public.household_addresses (
    id, tenant_id, household_id, address_key, version, address_type, label,
    line1, line2, locality, administrative_area, postal_code, country_code,
    normalized_address, delivery_instructions, is_primary, status, valid_from,
    issued_by_account_id, issuance_reason, created_at, updated_at
  ) VALUES (
    p_replacement_id, v_tenant_id, v_address.household_id, v_address.address_key,
    p_expected_version + 1, p_address_type, nullif(btrim(p_label), ''), btrim(p_line1),
    nullif(btrim(p_line2), ''), btrim(p_locality),
    nullif(btrim(p_administrative_area), ''), nullif(btrim(p_postal_code), ''),
    upper(btrim(p_country_code)), btrim(p_normalized_address),
    nullif(btrim(p_delivery_instructions), ''), p_is_primary, 'active', p_effective_at,
    v_account_id, btrim(p_reason), v_occurred_at, v_occurred_at
  );

  RETURN QUERY SELECT p_replacement_id, p_expected_version + 1, v_occurred_at;
END
$$;--> statement-breakpoint

ALTER FUNCTION "openschool_private"."create_household"(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text,
  text, text, text, text, text, text, boolean, boolean, timestamp with time zone, text
) OWNER TO "openschool_household_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."add_household_member"(
  uuid, uuid, uuid, uuid, text, boolean, boolean, timestamp with time zone, text
) OWNER TO "openschool_household_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."revise_household_member"(
  uuid, uuid, integer, text, boolean, boolean, timestamp with time zone, text
) OWNER TO "openschool_household_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."end_household_member"(
  uuid, integer, timestamp with time zone, text
) OWNER TO "openschool_household_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."add_household_address"(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  boolean, timestamp with time zone, text
) OWNER TO "openschool_household_manager";--> statement-breakpoint
ALTER FUNCTION "openschool_private"."revise_household_address"(
  uuid, uuid, integer, text, text, text, text, text, text, text, text, text, text,
  boolean, timestamp with time zone, text
) OWNER TO "openschool_household_manager";--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_private"."create_household"(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text,
  text, text, text, text, text, text, boolean, boolean, timestamp with time zone, text
) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."add_household_member"(
  uuid, uuid, uuid, uuid, text, boolean, boolean, timestamp with time zone, text
) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."revise_household_member"(
  uuid, uuid, integer, text, boolean, boolean, timestamp with time zone, text
) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."end_household_member"(
  uuid, integer, timestamp with time zone, text
) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."add_household_address"(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  boolean, timestamp with time zone, text
) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."revise_household_address"(
  uuid, uuid, integer, text, text, text, text, text, text, text, text, text, text,
  boolean, timestamp with time zone, text
) FROM PUBLIC;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION "openschool_private"."create_household"(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text,
  text, text, text, text, text, text, boolean, boolean, timestamp with time zone, text
) TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."add_household_member"(
  uuid, uuid, uuid, uuid, text, boolean, boolean, timestamp with time zone, text
) TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."revise_household_member"(
  uuid, uuid, integer, text, boolean, boolean, timestamp with time zone, text
) TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."end_household_member"(
  uuid, integer, timestamp with time zone, text
) TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."add_household_address"(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  boolean, timestamp with time zone, text
) TO "openschool_runtime";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_private"."revise_household_address"(
  uuid, uuid, integer, text, text, text, text, text, text, text, text, text, text,
  boolean, timestamp with time zone, text
) TO "openschool_runtime";--> statement-breakpoint

GRANT USAGE ON SCHEMA "public", "openschool_private" TO "openschool_household_manager";--> statement-breakpoint
GRANT SELECT ON "households", "household_addresses", "household_memberships"
  TO "openschool_household_manager";--> statement-breakpoint
GRANT INSERT ON "households", "household_addresses", "household_memberships"
  TO "openschool_household_manager";--> statement-breakpoint
GRANT UPDATE ("status", "valid_until", "ended_by_account_id", "end_reason", "updated_at")
  ON "household_memberships" TO "openschool_household_manager";--> statement-breakpoint
GRANT UPDATE ("status", "valid_until", "ended_by_account_id", "end_reason", "updated_at")
  ON "household_addresses" TO "openschool_household_manager";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_household_person_manage_scope_allows"(uuid, uuid),
  "openschool_household_manage_scope_allows"(uuid, uuid),
  "openschool_household_member_manage_scope_allows"(uuid, uuid, uuid)
  TO "openschool_household_manager";--> statement-breakpoint
GRANT SELECT ON "households", "household_addresses", "household_memberships"
  TO "openschool_runtime";--> statement-breakpoint

DO $$
DECLARE
  unsafe_execution_membership boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_auth_members AS membership
    WHERE membership.roleid IN (
      'openschool_household_scope_resolver'::regrole,
      'openschool_household_manager'::regrole
    )
      AND membership.member IN (
        'openschool_runtime'::regrole,
        'openschool_worker'::regrole,
        'openschool_control_plane'::regrole
      )
  ) INTO unsafe_execution_membership;
  IF unsafe_execution_membership THEN
    RAISE EXCEPTION 'Execution roles must not assume Household authority roles';
  END IF;
END
$$;
