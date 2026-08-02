-- Effective records must not overlap for the same identity and scope. These
-- constraints apply to future periods too, so ambiguous grants are rejected at
-- write time instead of being resolved by query ordering.

ALTER TABLE "account_links"
  ADD CONSTRAINT "account_links_account_no_active_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "account_id" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active');

ALTER TABLE "account_links"
  ADD CONSTRAINT "account_links_person_no_active_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "person_id" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active');

ALTER TABLE "affiliations"
  ADD CONSTRAINT "affiliations_tenant_scope_no_active_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "person_id" WITH =,
    "kind" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active' AND "scope_type" = 'tenant');

ALTER TABLE "affiliations"
  ADD CONSTRAINT "affiliations_org_scope_no_active_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "person_id" WITH =,
    "kind" WITH =,
    "education_organization_id" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active' AND "scope_type" = 'education_organization');

ALTER TABLE "affiliations"
  ADD CONSTRAINT "affiliations_school_scope_no_active_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "person_id" WITH =,
    "kind" WITH =,
    "school_id" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active' AND "scope_type" = 'school');

ALTER TABLE "affiliations"
  ADD CONSTRAINT "affiliations_class_scope_no_active_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "person_id" WITH =,
    "kind" WITH =,
    "class_id" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active' AND "scope_type" = 'class');

ALTER TABLE "role_template_assignments"
  ADD CONSTRAINT "role_template_assignments_no_active_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "affiliation_id" WITH =,
    "role_template_key" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active');

ALTER TABLE "person_relationships"
  ADD CONSTRAINT "person_relationships_no_active_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "subject_person_id" WITH =,
    "related_person_id" WITH =,
    "type" WITH =,
    tstzrange("valid_from", COALESCE("valid_until", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" = 'active');

ALTER TABLE "account_links"
  ADD CONSTRAINT "account_links_expiry_evidence_check"
  CHECK ("status" <> 'expired' OR "valid_until" IS NOT NULL);

-- Tenant keys and identity anchors are immutable. A link or grant is revoked
-- and replaced rather than silently repointed at another Person or scope.

CREATE FUNCTION "openschool_reject_identity_anchor_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  column_name text;
BEGIN
  FOREACH column_name IN ARRAY TG_ARGV LOOP
    IF (to_jsonb(NEW) -> column_name) IS DISTINCT FROM (to_jsonb(OLD) -> column_name) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format('%s is immutable on %I', column_name, TG_TABLE_NAME);
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;

CREATE TRIGGER "accounts_identity_anchors_immutable"
  BEFORE UPDATE ON "accounts"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'legacy_user_id', 'identity_provider', 'provider_subject'
  );
CREATE TRIGGER "people_identity_anchors_immutable"
  BEFORE UPDATE ON "people"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'tenant_id', 'legacy_user_id', 'legacy_student_id', 'source'
  );
CREATE TRIGGER "account_links_identity_anchors_immutable"
  BEFORE UPDATE ON "account_links"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'tenant_id', 'account_id', 'person_id'
  );
CREATE TRIGGER "affiliations_identity_anchors_immutable"
  BEFORE UPDATE ON "affiliations"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'tenant_id', 'person_id', 'kind', 'scope_type',
    'education_organization_id', 'school_id', 'class_id'
  );
CREATE TRIGGER "role_template_assignments_identity_anchors_immutable"
  BEFORE UPDATE ON "role_template_assignments"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'tenant_id', 'affiliation_id', 'role_template_key'
  );
CREATE TRIGGER "person_relationships_identity_anchors_immutable"
  BEFORE UPDATE ON "person_relationships"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'tenant_id', 'subject_person_id', 'related_person_id', 'type'
  );
CREATE TRIGGER "student_profiles_identity_anchors_immutable"
  BEFORE UPDATE ON "student_profiles"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'tenant_id', 'person_id', 'legacy_student_id'
  );
CREATE TRIGGER "guardian_profiles_identity_anchors_immutable"
  BEFORE UPDATE ON "guardian_profiles"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'tenant_id', 'person_id'
  );
CREATE TRIGGER "employee_profiles_identity_anchors_immutable"
  BEFORE UPDATE ON "employee_profiles"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'tenant_id', 'person_id'
  );
CREATE TRIGGER "teacher_profiles_identity_anchors_immutable"
  BEFORE UPDATE ON "teacher_profiles"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'tenant_id', 'person_id'
  );
CREATE TRIGGER "person_merge_evidence_identity_anchors_immutable"
  BEFORE UPDATE ON "person_merge_evidence"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'tenant_id', 'source_person_id', 'target_person_id', 'recorded_by_account_id'
  );

CREATE FUNCTION "openschool_validate_identity_event"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "account_links" AS link
    WHERE link."tenant_id" = NEW."tenant_id"
      AND link."id" = NEW."account_link_id"
      AND link."account_id" = NEW."account_id"
      AND link."person_id" = NEW."person_id"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Identity event must match its Account Link, Account, Person, and Tenant';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "identity_migration_events_validate_before_insert"
  BEFORE INSERT ON "identity_migration_events"
  FOR EACH ROW EXECUTE FUNCTION "openschool_validate_identity_event"();

CREATE FUNCTION "openschool_reject_immutable_row_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format('%I rows are append-only', TG_TABLE_NAME);
END
$$;

CREATE TRIGGER "identity_migration_events_append_only"
  BEFORE UPDATE OR DELETE ON "identity_migration_events"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_immutable_row_mutation"();
