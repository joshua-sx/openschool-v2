-- Phase 2 of the Tenant cutover: backfill and verify before any tenant key is
-- made NOT NULL. Existing flat organizations become independent Tenants and
-- root Education Organizations because no safe trust-realm merge can be
-- inferred from legacy data.

LOCK TABLE
  "organizations",
  "schools",
  "classes",
  "students",
  "users_on_org",
  "users_on_school",
  "teachers_on_class",
  "parent_student",
  "enrollments",
  "grades"
IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO "tenants" (
  "id",
  "name",
  "slug",
  "status",
  "settings",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "name",
  "slug",
  'active',
  COALESCE("settings", '{}'::jsonb),
  "created_at" AT TIME ZONE 'UTC',
  "updated_at" AT TIME ZONE 'UTC'
FROM "organizations"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "tenant_placements" (
  "tenant_id",
  "adapter",
  "placement_key",
  "status"
)
SELECT "id", 'pooled', 'primary', 'active'
FROM "tenants"
ON CONFLICT ("tenant_id") DO NOTHING;

UPDATE "organizations"
SET "tenant_id" = "id"
WHERE "tenant_id" IS NULL;

UPDATE "schools" AS school
SET "tenant_id" = organization."tenant_id"
FROM "organizations" AS organization
WHERE school."org_id" = organization."id"
  AND school."tenant_id" IS NULL;

UPDATE "classes" AS class
SET "tenant_id" = school."tenant_id"
FROM "schools" AS school
WHERE class."school_id" = school."id"
  AND class."tenant_id" IS NULL;

UPDATE "students" AS student
SET "tenant_id" = school."tenant_id"
FROM "schools" AS school
WHERE student."school_id" = school."id"
  AND student."tenant_id" IS NULL;

UPDATE "users_on_org" AS membership
SET "tenant_id" = organization."tenant_id"
FROM "organizations" AS organization
WHERE membership."org_id" = organization."id"
  AND membership."tenant_id" IS NULL;

UPDATE "users_on_school" AS membership
SET "tenant_id" = school."tenant_id"
FROM "schools" AS school
WHERE membership."school_id" = school."id"
  AND membership."tenant_id" IS NULL;

UPDATE "teachers_on_class" AS assignment
SET "tenant_id" = class."tenant_id"
FROM "classes" AS class
WHERE assignment."class_id" = class."id"
  AND assignment."tenant_id" IS NULL;

UPDATE "parent_student" AS relationship
SET "tenant_id" = student."tenant_id"
FROM "students" AS student
WHERE relationship."student_id" = student."id"
  AND relationship."tenant_id" IS NULL;

UPDATE "enrollments" AS enrollment
SET "tenant_id" = student."tenant_id"
FROM "students" AS student
WHERE enrollment."student_id" = student."id"
  AND enrollment."tenant_id" IS NULL;

UPDATE "grades" AS grade
SET "tenant_id" = enrollment."tenant_id"
FROM "enrollments" AS enrollment
WHERE grade."enrollment_id" = enrollment."id"
  AND grade."tenant_id" IS NULL;

DO $$
DECLARE
  null_rows bigint;
  mismatched_rows bigint;
BEGIN
  SELECT SUM(row_count) INTO null_rows
  FROM (
    SELECT COUNT(*) FILTER (WHERE "tenant_id" IS NULL) AS row_count FROM "organizations"
    UNION ALL SELECT COUNT(*) FILTER (WHERE "tenant_id" IS NULL) FROM "schools"
    UNION ALL SELECT COUNT(*) FILTER (WHERE "tenant_id" IS NULL) FROM "classes"
    UNION ALL SELECT COUNT(*) FILTER (WHERE "tenant_id" IS NULL) FROM "students"
    UNION ALL SELECT COUNT(*) FILTER (WHERE "tenant_id" IS NULL) FROM "users_on_org"
    UNION ALL SELECT COUNT(*) FILTER (WHERE "tenant_id" IS NULL) FROM "users_on_school"
    UNION ALL SELECT COUNT(*) FILTER (WHERE "tenant_id" IS NULL) FROM "teachers_on_class"
    UNION ALL SELECT COUNT(*) FILTER (WHERE "tenant_id" IS NULL) FROM "parent_student"
    UNION ALL SELECT COUNT(*) FILTER (WHERE "tenant_id" IS NULL) FROM "enrollments"
    UNION ALL SELECT COUNT(*) FILTER (WHERE "tenant_id" IS NULL) FROM "grades"
  ) AS tenant_null_counts;

  IF null_rows <> 0 THEN
    RAISE EXCEPTION 'Tenant backfill left % tenant-owned rows without tenant_id', null_rows;
  END IF;

  SELECT SUM(row_count) INTO mismatched_rows
  FROM (
    SELECT COUNT(*) AS row_count
    FROM "schools" AS child
    JOIN "organizations" AS parent ON parent."id" = child."org_id"
    WHERE child."tenant_id" <> parent."tenant_id"
    UNION ALL
    SELECT COUNT(*) FROM "classes" AS child
    JOIN "schools" AS parent ON parent."id" = child."school_id"
    WHERE child."tenant_id" <> parent."tenant_id"
    UNION ALL
    SELECT COUNT(*) FROM "students" AS child
    JOIN "schools" AS parent ON parent."id" = child."school_id"
    WHERE child."tenant_id" <> parent."tenant_id"
    UNION ALL
    SELECT COUNT(*) FROM "users_on_org" AS child
    JOIN "organizations" AS parent ON parent."id" = child."org_id"
    WHERE child."tenant_id" <> parent."tenant_id"
    UNION ALL
    SELECT COUNT(*) FROM "users_on_school" AS child
    JOIN "schools" AS parent ON parent."id" = child."school_id"
    WHERE child."tenant_id" <> parent."tenant_id"
    UNION ALL
    SELECT COUNT(*) FROM "teachers_on_class" AS child
    JOIN "classes" AS parent ON parent."id" = child."class_id"
    WHERE child."tenant_id" <> parent."tenant_id"
    UNION ALL
    SELECT COUNT(*) FROM "parent_student" AS child
    JOIN "students" AS parent ON parent."id" = child."student_id"
    WHERE child."tenant_id" <> parent."tenant_id"
    UNION ALL
    SELECT COUNT(*) FROM "enrollments" AS enrollment
    JOIN "students" AS student ON student."id" = enrollment."student_id"
    JOIN "classes" AS class ON class."id" = enrollment."class_id"
    WHERE enrollment."tenant_id" <> student."tenant_id"
       OR enrollment."tenant_id" <> class."tenant_id"
    UNION ALL
    SELECT COUNT(*) FROM "grades" AS child
    JOIN "enrollments" AS parent ON parent."id" = child."enrollment_id"
    WHERE child."tenant_id" <> parent."tenant_id"
  ) AS tenant_mismatch_counts;

  IF mismatched_rows <> 0 THEN
    RAISE EXCEPTION 'Tenant backfill found % cross-tenant operational references', mismatched_rows;
  END IF;
END
$$;

INSERT INTO "education_organizations" (
  "id",
  "tenant_id",
  "legacy_organization_id",
  "name",
  "slug",
  "type",
  "status",
  "settings",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "tenant_id",
  "id",
  "name",
  "slug",
  'other',
  'active',
  COALESCE("settings", '{}'::jsonb),
  "created_at" AT TIME ZONE 'UTC',
  "updated_at" AT TIME ZONE 'UTC'
FROM "organizations"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "organization_tree_versions" (
  "id",
  "tenant_id",
  "version",
  "effective_from",
  "reason"
)
SELECT
  "id",
  "tenant_id",
  1,
  "created_at" AT TIME ZONE 'UTC',
  'Imported from the legacy flat organization model'
FROM "organizations"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "organization_tree_nodes" (
  "tenant_id",
  "tree_version_id",
  "organization_id",
  "parent_organization_id"
)
SELECT "tenant_id", "id", "id", NULL
FROM "organizations"
ON CONFLICT DO NOTHING;

INSERT INTO "organization_tree_closure" (
  "tenant_id",
  "tree_version_id",
  "ancestor_organization_id",
  "descendant_organization_id",
  "depth"
)
SELECT "tenant_id", "id", "id", "id", 0
FROM "organizations"
ON CONFLICT DO NOTHING;

INSERT INTO "school_governance_assignments" (
  "tenant_id",
  "school_id",
  "education_organization_id",
  "valid_from"
)
SELECT
  "tenant_id",
  "id",
  "org_id",
  "created_at" AT TIME ZONE 'UTC'
FROM "schools";

DO $$
DECLARE
  legacy_organizations bigint;
  imported_roots bigint;
  legacy_schools bigint;
  imported_school_assignments bigint;
BEGIN
  SELECT COUNT(*) INTO legacy_organizations FROM "organizations";
  SELECT COUNT(*) INTO imported_roots
  FROM "education_organizations" AS organization
  JOIN "organization_tree_nodes" AS node
    ON node."tenant_id" = organization."tenant_id"
   AND node."organization_id" = organization."id"
  WHERE organization."legacy_organization_id" IS NOT NULL
    AND node."parent_organization_id" IS NULL;

  SELECT COUNT(*) INTO legacy_schools FROM "schools";
  SELECT COUNT(*) INTO imported_school_assignments
  FROM "schools" AS school
  JOIN "school_governance_assignments" AS assignment
    ON assignment."tenant_id" = school."tenant_id"
   AND assignment."school_id" = school."id"
   AND assignment."education_organization_id" = school."org_id"
  WHERE assignment."valid_until" IS NULL;

  IF legacy_organizations <> imported_roots THEN
    RAISE EXCEPTION 'Expected % imported organization roots, found %',
      legacy_organizations, imported_roots;
  END IF;

  IF legacy_schools <> imported_school_assignments THEN
    RAISE EXCEPTION 'Expected % imported School assignments, found %',
      legacy_schools, imported_school_assignments;
  END IF;
END
$$;
