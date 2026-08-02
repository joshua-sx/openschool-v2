-- Import legacy login and membership records beside the existing model. The
-- legacy tables remain untouched and available for rollback reads.

LOCK TABLE
  "users",
  "students",
  "users_on_org",
  "users_on_school",
  "teachers_on_class",
  "parent_student",
  "grades"
IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO "accounts" (
  "id",
  "legacy_user_id",
  "identity_provider",
  "provider_subject",
  "primary_email",
  "status",
  "membership_version",
  "security_version",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "id",
  'supabase',
  "id"::text,
  "email",
  'active',
  1,
  1,
  "created_at" AT TIME ZONE 'UTC',
  "updated_at" AT TIME ZONE 'UTC'
FROM "users";

WITH user_tenants AS (
  SELECT "tenant_id", "user_id" FROM "users_on_org"
  UNION
  SELECT "tenant_id", "user_id" FROM "users_on_school"
  UNION
  SELECT "tenant_id", "user_id" FROM "teachers_on_class"
  UNION
  SELECT "tenant_id", "parent_id" AS "user_id" FROM "parent_student"
  UNION
  SELECT "tenant_id", "graded_by" AS "user_id" FROM "grades" WHERE "graded_by" IS NOT NULL
)
INSERT INTO "people" (
  "tenant_id",
  "legacy_user_id",
  "display_name",
  "normalized_display_name",
  "first_name",
  "last_name",
  "email",
  "normalized_email",
  "status",
  "source",
  "created_at",
  "updated_at"
)
SELECT
  user_tenants."tenant_id",
  legacy_user."id",
  COALESCE(
    NULLIF(trim(concat_ws(' ', legacy_user."first_name", legacy_user."last_name")), ''),
    legacy_user."email"
  ),
  lower(regexp_replace(
    COALESCE(
      NULLIF(trim(concat_ws(' ', legacy_user."first_name", legacy_user."last_name")), ''),
      legacy_user."email"
    ),
    '\s+',
    ' ',
    'g'
  )),
  legacy_user."first_name",
  legacy_user."last_name",
  legacy_user."email",
  lower(trim(legacy_user."email")),
  'active',
  'legacy_user',
  legacy_user."created_at" AT TIME ZONE 'UTC',
  legacy_user."updated_at" AT TIME ZONE 'UTC'
FROM user_tenants
JOIN "users" AS legacy_user ON legacy_user."id" = user_tenants."user_id";

INSERT INTO "people" (
  "tenant_id",
  "legacy_student_id",
  "display_name",
  "normalized_display_name",
  "first_name",
  "last_name",
  "date_of_birth",
  "email",
  "normalized_email",
  "status",
  "source",
  "created_at",
  "updated_at"
)
SELECT
  student."tenant_id",
  student."id",
  trim(concat_ws(' ', student."first_name", student."last_name")),
  lower(regexp_replace(trim(concat_ws(' ', student."first_name", student."last_name")), '\s+', ' ', 'g')),
  student."first_name",
  student."last_name",
  student."date_of_birth",
  student."email",
  CASE WHEN student."email" IS NULL THEN NULL ELSE lower(trim(student."email")) END,
  CASE student."status" WHEN 'active' THEN 'active' ELSE 'archived' END,
  'legacy_student',
  student."created_at" AT TIME ZONE 'UTC',
  student."updated_at" AT TIME ZONE 'UTC'
FROM "students" AS student;

INSERT INTO "account_links" (
  "tenant_id",
  "account_id",
  "person_id",
  "status",
  "valid_from",
  "issuance_reason",
  "activated_at"
)
SELECT
  person."tenant_id",
  person."legacy_user_id",
  person."id",
  'active',
  person."created_at",
  'Backfilled from accepted legacy development user',
  now()
FROM "people" AS person
WHERE person."legacy_user_id" IS NOT NULL;

INSERT INTO "identity_migration_events" (
  "tenant_id",
  "account_id",
  "person_id",
  "account_link_id",
  "event_type",
  "membership_version",
  "evidence"
)
SELECT
  link."tenant_id",
  link."account_id",
  link."person_id",
  link."id",
  'account_link_backfilled',
  account."membership_version",
  jsonb_build_object('legacyUserId', account."legacy_user_id")
FROM "account_links" AS link
JOIN "accounts" AS account ON account."id" = link."account_id";

INSERT INTO "student_profiles" (
  "tenant_id",
  "person_id",
  "legacy_student_id",
  "student_number",
  "status"
)
SELECT
  person."tenant_id",
  person."id",
  student."id",
  student."student_number",
  CASE student."status"
    WHEN 'active' THEN 'active'
    WHEN 'archived' THEN 'inactive'
    ELSE 'inactive'
  END
FROM "people" AS person
JOIN "students" AS student
  ON student."tenant_id" = person."tenant_id"
 AND student."id" = person."legacy_student_id";

INSERT INTO "guardian_profiles" ("tenant_id", "person_id", "status")
SELECT DISTINCT person."tenant_id", person."id", 'active'
FROM "parent_student" AS legacy_relationship
JOIN "people" AS person
  ON person."tenant_id" = legacy_relationship."tenant_id"
 AND person."legacy_user_id" = legacy_relationship."parent_id";

INSERT INTO "employee_profiles" ("tenant_id", "person_id", "job_title", "status")
SELECT
  person."tenant_id",
  person."id",
  CASE
    WHEN bool_or(legacy_membership."role" = 'school_admin') THEN 'School administrator'
    WHEN bool_or(legacy_membership."role" = 'teacher') THEN 'Teacher'
    ELSE 'Staff'
  END,
  'active'
FROM "users_on_school" AS legacy_membership
JOIN "people" AS person
  ON person."tenant_id" = legacy_membership."tenant_id"
 AND person."legacy_user_id" = legacy_membership."user_id"
GROUP BY person."tenant_id", person."id";

INSERT INTO "teacher_profiles" ("tenant_id", "person_id", "status")
SELECT DISTINCT person."tenant_id", person."id", 'active'
FROM "people" AS person
WHERE EXISTS (
  SELECT 1 FROM "teachers_on_class" AS assignment
  WHERE assignment."tenant_id" = person."tenant_id"
    AND assignment."user_id" = person."legacy_user_id"
)
OR EXISTS (
  SELECT 1 FROM "users_on_school" AS membership
  WHERE membership."tenant_id" = person."tenant_id"
    AND membership."user_id" = person."legacy_user_id"
    AND membership."role" = 'teacher'
);

INSERT INTO "affiliations" (
  "tenant_id", "person_id", "kind", "scope_type", "education_organization_id",
  "status", "valid_from", "issuance_reason"
)
SELECT
  membership."tenant_id",
  person."id",
  CASE membership."role" WHEN 'org_admin' THEN 'administrator' ELSE 'member' END,
  'education_organization',
  membership."org_id",
  'active',
  membership."created_at" AT TIME ZONE 'UTC',
  'Backfilled from users_on_org:' || membership."id"::text
FROM "users_on_org" AS membership
JOIN "people" AS person
  ON person."tenant_id" = membership."tenant_id"
 AND person."legacy_user_id" = membership."user_id";

INSERT INTO "role_template_assignments" (
  "tenant_id", "affiliation_id", "role_template_key", "status", "valid_from", "issuance_reason"
)
SELECT
  affiliation."tenant_id",
  affiliation."id",
  membership."role",
  'active',
  affiliation."valid_from",
  'Backfilled role from users_on_org:' || membership."id"::text
FROM "users_on_org" AS membership
JOIN "people" AS person
  ON person."tenant_id" = membership."tenant_id"
 AND person."legacy_user_id" = membership."user_id"
JOIN "affiliations" AS affiliation
  ON affiliation."tenant_id" = membership."tenant_id"
 AND affiliation."person_id" = person."id"
 AND affiliation."issuance_reason" = 'Backfilled from users_on_org:' || membership."id"::text;

INSERT INTO "affiliations" (
  "tenant_id", "person_id", "kind", "scope_type", "school_id",
  "status", "valid_from", "issuance_reason"
)
SELECT
  membership."tenant_id",
  person."id",
  CASE membership."role"
    WHEN 'school_admin' THEN 'administrator'
    WHEN 'teacher' THEN 'teacher'
    ELSE 'employee'
  END,
  'school',
  membership."school_id",
  'active',
  membership."created_at" AT TIME ZONE 'UTC',
  'Backfilled from users_on_school:' || membership."id"::text
FROM "users_on_school" AS membership
JOIN "people" AS person
  ON person."tenant_id" = membership."tenant_id"
 AND person."legacy_user_id" = membership."user_id";

INSERT INTO "role_template_assignments" (
  "tenant_id", "affiliation_id", "role_template_key", "status", "valid_from", "issuance_reason"
)
SELECT
  affiliation."tenant_id",
  affiliation."id",
  membership."role",
  'active',
  affiliation."valid_from",
  'Backfilled role from users_on_school:' || membership."id"::text
FROM "users_on_school" AS membership
JOIN "people" AS person
  ON person."tenant_id" = membership."tenant_id"
 AND person."legacy_user_id" = membership."user_id"
JOIN "affiliations" AS affiliation
  ON affiliation."tenant_id" = membership."tenant_id"
 AND affiliation."person_id" = person."id"
 AND affiliation."issuance_reason" = 'Backfilled from users_on_school:' || membership."id"::text;

INSERT INTO "affiliations" (
  "tenant_id", "person_id", "kind", "scope_type", "class_id",
  "status", "valid_from", "issuance_reason"
)
SELECT
  assignment."tenant_id",
  person."id",
  'teacher',
  'class',
  assignment."class_id",
  'active',
  assignment."created_at" AT TIME ZONE 'UTC',
  'Backfilled from teachers_on_class:' || assignment."id"::text
FROM "teachers_on_class" AS assignment
JOIN "people" AS person
  ON person."tenant_id" = assignment."tenant_id"
 AND person."legacy_user_id" = assignment."user_id";

INSERT INTO "role_template_assignments" (
  "tenant_id", "affiliation_id", "role_template_key", "status", "valid_from", "issuance_reason"
)
SELECT
  affiliation."tenant_id",
  affiliation."id",
  'teacher',
  'active',
  affiliation."valid_from",
  'Backfilled role from teachers_on_class:' || assignment."id"::text
FROM "teachers_on_class" AS assignment
JOIN "people" AS person
  ON person."tenant_id" = assignment."tenant_id"
 AND person."legacy_user_id" = assignment."user_id"
JOIN "affiliations" AS affiliation
  ON affiliation."tenant_id" = assignment."tenant_id"
 AND affiliation."person_id" = person."id"
 AND affiliation."issuance_reason" = 'Backfilled from teachers_on_class:' || assignment."id"::text;

INSERT INTO "affiliations" (
  "tenant_id", "person_id", "kind", "scope_type", "school_id",
  "status", "valid_from", "issuance_reason"
)
SELECT
  student."tenant_id",
  person."id",
  'student',
  'school',
  student."school_id",
  'active',
  student."created_at" AT TIME ZONE 'UTC',
  'Backfilled from students:' || student."id"::text
FROM "students" AS student
JOIN "people" AS person
  ON person."tenant_id" = student."tenant_id"
 AND person."legacy_student_id" = student."id";

INSERT INTO "role_template_assignments" (
  "tenant_id", "affiliation_id", "role_template_key", "status", "valid_from", "issuance_reason"
)
SELECT
  affiliation."tenant_id",
  affiliation."id",
  'student',
  'active',
  affiliation."valid_from",
  'Backfilled student role:' || student."id"::text
FROM "students" AS student
JOIN "people" AS person
  ON person."tenant_id" = student."tenant_id"
 AND person."legacy_student_id" = student."id"
JOIN "affiliations" AS affiliation
  ON affiliation."tenant_id" = student."tenant_id"
 AND affiliation."person_id" = person."id"
 AND affiliation."issuance_reason" = 'Backfilled from students:' || student."id"::text;

INSERT INTO "affiliations" (
  "tenant_id", "person_id", "kind", "scope_type",
  "status", "valid_from", "issuance_reason"
)
SELECT DISTINCT
  relationship."tenant_id",
  guardian."id",
  'guardian',
  'tenant',
  'active',
  guardian."created_at",
  'Backfilled guardian access from parent_student'
FROM "parent_student" AS relationship
JOIN "people" AS guardian
  ON guardian."tenant_id" = relationship."tenant_id"
 AND guardian."legacy_user_id" = relationship."parent_id";

INSERT INTO "role_template_assignments" (
  "tenant_id", "affiliation_id", "role_template_key", "status", "valid_from", "issuance_reason"
)
SELECT
  affiliation."tenant_id",
  affiliation."id",
  'parent',
  'active',
  affiliation."valid_from",
  'Backfilled guardian role'
FROM "affiliations" AS affiliation
WHERE affiliation."issuance_reason" = 'Backfilled guardian access from parent_student';

INSERT INTO "person_relationships" (
  "tenant_id", "subject_person_id", "related_person_id", "type", "status",
  "valid_from", "issuance_reason"
)
SELECT
  relationship."tenant_id",
  guardian."id",
  student_person."id",
  CASE relationship."relationship"
    WHEN 'guardian' THEN 'guardian_of'
    WHEN 'mother' THEN 'parent_of'
    WHEN 'father' THEN 'parent_of'
    ELSE 'other'
  END,
  'active',
  relationship."created_at" AT TIME ZONE 'UTC',
  'Backfilled from parent_student:' || relationship."id"::text
FROM "parent_student" AS relationship
JOIN "people" AS guardian
  ON guardian."tenant_id" = relationship."tenant_id"
 AND guardian."legacy_user_id" = relationship."parent_id"
JOIN "people" AS student_person
  ON student_person."tenant_id" = relationship."tenant_id"
 AND student_person."legacy_student_id" = relationship."student_id";

DO $$
DECLARE
  expected_user_tenants bigint;
  expected_affiliations bigint;
  expected_relationships bigint;
BEGIN
  SELECT COUNT(*) INTO expected_user_tenants
  FROM (
    SELECT "tenant_id", "user_id" FROM "users_on_org"
    UNION SELECT "tenant_id", "user_id" FROM "users_on_school"
    UNION SELECT "tenant_id", "user_id" FROM "teachers_on_class"
    UNION SELECT "tenant_id", "parent_id" FROM "parent_student"
    UNION SELECT "tenant_id", "graded_by" FROM "grades" WHERE "graded_by" IS NOT NULL
  ) AS user_tenants;

  SELECT
    (SELECT COUNT(*) FROM "users_on_org")
    + (SELECT COUNT(*) FROM "users_on_school")
    + (SELECT COUNT(*) FROM "teachers_on_class")
    + (SELECT COUNT(*) FROM "students")
    + (SELECT COUNT(DISTINCT ("tenant_id", "parent_id")) FROM "parent_student")
  INTO expected_affiliations;

  SELECT COUNT(*) INTO expected_relationships FROM "parent_student";

  IF (SELECT COUNT(*) FROM "accounts") <> (SELECT COUNT(*) FROM "users") THEN
    RAISE EXCEPTION 'Account backfill count does not match legacy users';
  END IF;

  IF (SELECT COUNT(*) FROM "people" WHERE "legacy_user_id" IS NOT NULL) <> expected_user_tenants THEN
    RAISE EXCEPTION 'User Person backfill count does not match distinct Tenant memberships';
  END IF;

  IF (SELECT COUNT(*) FROM "people" WHERE "legacy_student_id" IS NOT NULL) <> (SELECT COUNT(*) FROM "students") THEN
    RAISE EXCEPTION 'Student Person backfill count does not match legacy students';
  END IF;

  IF (SELECT COUNT(*) FROM "account_links") <> expected_user_tenants THEN
    RAISE EXCEPTION 'Account Link backfill count does not match user People';
  END IF;

  IF (SELECT COUNT(*) FROM "identity_migration_events" WHERE "event_type" = 'account_link_backfilled') <> expected_user_tenants THEN
    RAISE EXCEPTION 'Account Link migration events do not match backfilled links';
  END IF;

  IF (SELECT COUNT(*) FROM "student_profiles") <> (SELECT COUNT(*) FROM "students") THEN
    RAISE EXCEPTION 'Student profile backfill count does not match legacy students';
  END IF;

  IF (SELECT COUNT(*) FROM "affiliations") <> expected_affiliations THEN
    RAISE EXCEPTION 'Affiliation backfill count does not match legacy access records';
  END IF;

  IF (SELECT COUNT(*) FROM "role_template_assignments") <> expected_affiliations THEN
    RAISE EXCEPTION 'Role Template assignment count does not match affiliations';
  END IF;

  IF (SELECT COUNT(*) FROM "person_relationships") <> expected_relationships THEN
    RAISE EXCEPTION 'Relationship backfill count does not match parent_student';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "account_links" AS link
    JOIN "people" AS person ON person."id" = link."person_id"
    WHERE link."tenant_id" <> person."tenant_id"
  ) THEN
    RAISE EXCEPTION 'Account Link backfill created a cross-Tenant Person link';
  END IF;
END
$$;
