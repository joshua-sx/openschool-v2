CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "school_governance_assignments"
  ADD CONSTRAINT "school_governance_assignments_no_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "school_id" WITH =,
    tstzrange(
      "valid_from",
      COALESCE("valid_until", 'infinity'::timestamptz),
      '[)'
    ) WITH &&
  );

ALTER TABLE "organization_tree_nodes"
  ADD CONSTRAINT "organization_tree_nodes_parent_in_version_fk"
  FOREIGN KEY ("tenant_id", "tree_version_id", "parent_organization_id")
  REFERENCES "organization_tree_nodes" (
    "tenant_id",
    "tree_version_id",
    "organization_id"
  )
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "organization_tree_nodes"
  ALTER CONSTRAINT "organization_tree_nodes_version_fk"
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "organization_tree_closure"
  ALTER CONSTRAINT "organization_tree_closure_version_fk"
  DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION "openschool_reject_tenant_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'tenant_id is immutable on %I (row id %s)',
        TG_TABLE_NAME,
        COALESCE(OLD."id"::text, '<composite-key>')
      );
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "organizations_tenant_id_immutable"
  BEFORE UPDATE ON "organizations"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();
CREATE TRIGGER "schools_tenant_id_immutable"
  BEFORE UPDATE ON "schools"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();
CREATE TRIGGER "classes_tenant_id_immutable"
  BEFORE UPDATE ON "classes"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();
CREATE TRIGGER "students_tenant_id_immutable"
  BEFORE UPDATE ON "students"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();
CREATE TRIGGER "users_on_org_tenant_id_immutable"
  BEFORE UPDATE ON "users_on_org"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();
CREATE TRIGGER "users_on_school_tenant_id_immutable"
  BEFORE UPDATE ON "users_on_school"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();
CREATE TRIGGER "teachers_on_class_tenant_id_immutable"
  BEFORE UPDATE ON "teachers_on_class"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();
CREATE TRIGGER "parent_student_tenant_id_immutable"
  BEFORE UPDATE ON "parent_student"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();
CREATE TRIGGER "enrollments_tenant_id_immutable"
  BEFORE UPDATE ON "enrollments"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();
CREATE TRIGGER "grades_tenant_id_immutable"
  BEFORE UPDATE ON "grades"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();
CREATE TRIGGER "tenant_placements_tenant_id_immutable"
  BEFORE UPDATE ON "tenant_placements"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();
CREATE TRIGGER "education_organizations_tenant_id_immutable"
  BEFORE UPDATE ON "education_organizations"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();
CREATE TRIGGER "organization_tree_versions_tenant_id_immutable"
  BEFORE UPDATE ON "organization_tree_versions"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();
CREATE TRIGGER "school_governance_assignments_tenant_id_immutable"
  BEFORE UPDATE ON "school_governance_assignments"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tenant_change"();

CREATE FUNCTION "openschool_reject_tree_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format(
      '%I rows are immutable; create a new Organization Tree version',
      TG_TABLE_NAME
    );
END
$$;

CREATE TRIGGER "organization_tree_versions_immutable"
  BEFORE UPDATE OR DELETE ON "organization_tree_versions"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tree_mutation"();
CREATE TRIGGER "organization_tree_nodes_immutable"
  BEFORE UPDATE OR DELETE ON "organization_tree_nodes"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tree_mutation"();
CREATE TRIGGER "organization_tree_closure_immutable"
  BEFORE UPDATE OR DELETE ON "organization_tree_closure"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_tree_mutation"();

CREATE FUNCTION "openschool_guard_tree_node_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "organization_tree_versions"
    WHERE "tenant_id" = NEW."tenant_id"
      AND "id" = NEW."tree_version_id"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Organization Tree version is sealed; insert a new version instead';
  END IF;

  IF NEW."parent_organization_id" IS NOT NULL AND EXISTS (
    WITH RECURSIVE parent_chain AS (
      SELECT "organization_id", "parent_organization_id"
      FROM "organization_tree_nodes"
      WHERE "tenant_id" = NEW."tenant_id"
        AND "tree_version_id" = NEW."tree_version_id"
        AND "organization_id" = NEW."parent_organization_id"

      UNION ALL

      SELECT parent."organization_id", parent."parent_organization_id"
      FROM "organization_tree_nodes" AS parent
      JOIN parent_chain AS child
        ON child."parent_organization_id" = parent."organization_id"
      WHERE parent."tenant_id" = NEW."tenant_id"
        AND parent."tree_version_id" = NEW."tree_version_id"
    )
    SELECT 1
    FROM parent_chain
    WHERE "organization_id" = NEW."organization_id"
       OR "parent_organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Organization Tree cycle rejected';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "organization_tree_nodes_insert_guard"
  BEFORE INSERT ON "organization_tree_nodes"
  FOR EACH ROW EXECUTE FUNCTION "openschool_guard_tree_node_insert"();

CREATE FUNCTION "openschool_guard_tree_closure_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "organization_tree_versions"
    WHERE "tenant_id" = NEW."tenant_id"
      AND "id" = NEW."tree_version_id"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Organization Tree version is sealed; insert a new version instead';
  END IF;

  IF NEW."ancestor_organization_id" <> NEW."descendant_organization_id" AND EXISTS (
    SELECT 1
    FROM "organization_tree_closure"
    WHERE "tenant_id" = NEW."tenant_id"
      AND "tree_version_id" = NEW."tree_version_id"
      AND "ancestor_organization_id" = NEW."descendant_organization_id"
      AND "descendant_organization_id" = NEW."ancestor_organization_id"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Reciprocal Organization Tree closure edge rejected';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "organization_tree_closure_insert_guard"
  BEFORE INSERT ON "organization_tree_closure"
  FOR EACH ROW EXECUTE FUNCTION "openschool_guard_tree_closure_insert"();

CREATE FUNCTION "openschool_validate_tree_version"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  root_count integer;
BEGIN
  SELECT COUNT(*) INTO root_count
  FROM "organization_tree_nodes"
  WHERE "tenant_id" = NEW."tenant_id"
    AND "tree_version_id" = NEW."id"
    AND "parent_organization_id" IS NULL;

  IF root_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'Organization Tree version must contain exactly one root; found %s',
        root_count
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "organization_tree_nodes" AS child
    WHERE child."tenant_id" = NEW."tenant_id"
      AND child."tree_version_id" = NEW."id"
      AND child."parent_organization_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "organization_tree_nodes" AS parent
        WHERE parent."tenant_id" = child."tenant_id"
          AND parent."tree_version_id" = child."tree_version_id"
          AND parent."organization_id" = child."parent_organization_id"
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Organization Tree version contains a parent outside the version';
  END IF;

  IF EXISTS (
    WITH RECURSIVE expected_closure AS (
      SELECT
        node."organization_id" AS "ancestor_organization_id",
        node."organization_id" AS "descendant_organization_id",
        0 AS "depth"
      FROM "organization_tree_nodes" AS node
      WHERE node."tenant_id" = NEW."tenant_id"
        AND node."tree_version_id" = NEW."id"

      UNION ALL

      SELECT
        node."parent_organization_id" AS "ancestor_organization_id",
        edge."descendant_organization_id",
        edge."depth" + 1
      FROM expected_closure AS edge
      JOIN "organization_tree_nodes" AS node
        ON node."tenant_id" = NEW."tenant_id"
       AND node."tree_version_id" = NEW."id"
       AND node."organization_id" = edge."ancestor_organization_id"
      WHERE node."parent_organization_id" IS NOT NULL
    ),
    actual_closure AS (
      SELECT
        "ancestor_organization_id",
        "descendant_organization_id",
        "depth"
      FROM "organization_tree_closure"
      WHERE "tenant_id" = NEW."tenant_id"
        AND "tree_version_id" = NEW."id"
    ),
    difference AS (
      (SELECT * FROM expected_closure EXCEPT SELECT * FROM actual_closure)
      UNION ALL
      (SELECT * FROM actual_closure EXCEPT SELECT * FROM expected_closure)
    )
    SELECT 1 FROM difference
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Organization Tree closure is incomplete or inconsistent with its nodes';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "organization_tree_versions_validate_before_seal"
  BEFORE INSERT ON "organization_tree_versions"
  FOR EACH ROW EXECUTE FUNCTION "openschool_validate_tree_version"();
