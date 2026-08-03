-- Student/School forced-RLS policy helpers run as the non-owner invoker. They translate the
-- bounded Policy Decision constraints placed on the transaction into the same
-- School, Organization Tree, class, self, and guardian scopes used by the
-- application query layer.

CREATE FUNCTION "openschool_policy_constraints"()
RETURNS jsonb
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.policy_constraints', true), '')::jsonb,
    '[]'::jsonb
  )
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_school_scope_allows"(
  row_tenant_id uuid,
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
      AND (
        policy_constraint ->> 'kind' = 'tenant'
        OR (
          policy_constraint ->> 'kind' = 'school'
          AND policy_constraint ->> 'schoolId' = row_school_id::text
        )
        OR (
          policy_constraint ->> 'kind' = 'organization_exact'
          AND EXISTS (
            SELECT 1
            FROM public.school_governance_assignments AS governance
            WHERE governance.tenant_id = row_tenant_id
              AND governance.school_id = row_school_id
              AND governance.education_organization_id::text =
                policy_constraint ->> 'organizationId'
              AND governance.valid_from <= now()
              AND (governance.valid_until IS NULL OR governance.valid_until > now())
          )
        )
        OR (
          policy_constraint ->> 'kind' = 'organization_subtree'
          AND EXISTS (
            SELECT 1
            FROM public.school_governance_assignments AS governance
            INNER JOIN public.organization_tree_closure AS closure
              ON closure.tenant_id = governance.tenant_id
              AND closure.descendant_organization_id = governance.education_organization_id
            WHERE governance.tenant_id = row_tenant_id
              AND governance.school_id = row_school_id
              AND governance.valid_from <= now()
              AND (governance.valid_until IS NULL OR governance.valid_until > now())
              AND closure.ancestor_organization_id::text =
                policy_constraint ->> 'ancestorOrganizationId'
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
$$;--> statement-breakpoint

CREATE FUNCTION "openschool_student_scope_allows"(
  row_tenant_id uuid,
  row_school_id uuid,
  row_student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  SELECT public.openschool_school_scope_allows(row_tenant_id, row_school_id)
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(public.openschool_policy_constraints()) AS policy_constraint
      WHERE policy_constraint ->> 'tenantId' = row_tenant_id::text
        AND (
          (
            policy_constraint ->> 'kind' = 'class'
            AND policy_constraint ->> 'actorPersonId' =
              NULLIF(current_setting('app.person_id', true), '')
            AND (
              policy_constraint ->> 'schoolId' IS NULL
              OR policy_constraint ->> 'schoolId' = row_school_id::text
            )
            AND EXISTS (
              SELECT 1
              FROM public.enrollments AS enrollment
              INNER JOIN public.affiliations AS affiliation
                ON affiliation.tenant_id = enrollment.tenant_id
                AND affiliation.class_id = enrollment.class_id
              WHERE enrollment.tenant_id = row_tenant_id
                AND enrollment.student_id = row_student_id
                AND enrollment.status = 'active'
                AND affiliation.person_id::text =
                  NULLIF(current_setting('app.person_id', true), '')
                AND affiliation.kind = 'teacher'
                AND affiliation.scope_type = 'class'
                AND affiliation.status = 'active'
                AND affiliation.valid_from <= now()
                AND (affiliation.valid_until IS NULL OR affiliation.valid_until > now())
                AND (
                  policy_constraint ->> 'classId' IS NULL
                  OR policy_constraint ->> 'classId' = enrollment.class_id::text
                )
            )
          )
          OR (
            policy_constraint ->> 'kind' = 'self'
            AND policy_constraint ->> 'personId' =
              NULLIF(current_setting('app.person_id', true), '')
            AND EXISTS (
              SELECT 1
              FROM public.student_profiles AS profile
              WHERE profile.tenant_id = row_tenant_id
                AND profile.legacy_student_id = row_student_id
                AND profile.person_id::text =
                  NULLIF(current_setting('app.person_id', true), '')
                AND profile.status = 'active'
            )
          )
          OR (
            policy_constraint ->> 'kind' = 'linked_student'
            AND policy_constraint ->> 'guardianPersonId' =
              NULLIF(current_setting('app.person_id', true), '')
            AND (
              policy_constraint ->> 'studentId' IS NULL
              OR policy_constraint ->> 'studentId' = row_student_id::text
            )
            AND EXISTS (
              SELECT 1
              FROM public.student_profiles AS profile
              INNER JOIN public.person_relationships AS relationship
                ON relationship.tenant_id = profile.tenant_id
                AND relationship.related_person_id = profile.person_id
              WHERE profile.tenant_id = row_tenant_id
                AND profile.legacy_student_id = row_student_id
                AND profile.status = 'active'
                AND relationship.subject_person_id::text =
                  NULLIF(current_setting('app.person_id', true), '')
                AND relationship.type IN ('guardian_of', 'parent_of')
                AND relationship.status = 'active'
                AND relationship.valid_from <= now()
                AND (relationship.valid_until IS NULL OR relationship.valid_until > now())
            )
          )
        )
    )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "openschool_policy_constraints"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_school_scope_allows"(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_student_scope_allows"(uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_policy_constraints"()
  TO "openschool_runtime", "openschool_worker";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_school_scope_allows"(uuid, uuid)
  TO "openschool_runtime", "openschool_worker";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "openschool_student_scope_allows"(uuid, uuid, uuid)
  TO "openschool_runtime", "openschool_worker";--> statement-breakpoint

CREATE TRIGGER "students_identity_anchors_immutable"
  BEFORE UPDATE ON "students"
  FOR EACH ROW EXECUTE FUNCTION "openschool_reject_identity_anchor_change"(
    'id', 'tenant_id'
  );--> statement-breakpoint

ALTER TABLE "schools" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "schools" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "students" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "schools_runtime_select" ON "schools" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "schools"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND (
          "schools"."id" = nullif(current_setting('app.school_id', true), '')::uuid
          OR (
            nullif(current_setting('app.policy_capability', true), '')
              IN ('tenant.schools.read', 'tenant.students.create')
            AND public.openschool_school_scope_allows(
              "schools"."tenant_id", "schools"."id"
            )
          )
        )
      );--> statement-breakpoint
CREATE POLICY "schools_worker_select" ON "schools" AS PERMISSIVE FOR SELECT TO "openschool_worker" USING ("schools"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "schools_runtime_insert_deny" ON "schools" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "schools_runtime_update_deny" ON "schools" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "schools_runtime_delete_deny" ON "schools" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (false);--> statement-breakpoint
CREATE POLICY "schools_worker_insert_deny" ON "schools" AS PERMISSIVE FOR INSERT TO "openschool_worker" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "schools_worker_update_deny" ON "schools" AS PERMISSIVE FOR UPDATE TO "openschool_worker" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "schools_worker_delete_deny" ON "schools" AS PERMISSIVE FOR DELETE TO "openschool_worker" USING (false);--> statement-breakpoint
CREATE POLICY "students_runtime_select" ON "students" AS PERMISSIVE FOR SELECT TO "openschool_runtime" USING (
        "students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') IN (
          'tenant.students.create', 'tenant.students.read',
          'tenant.students.update', 'tenant.students.delete'
        )
        AND public.openschool_student_scope_allows(
          "students"."tenant_id", "students"."school_id", "students"."id"
        )
      );--> statement-breakpoint
CREATE POLICY "students_runtime_insert" ON "students" AS PERMISSIVE FOR INSERT TO "openschool_runtime" WITH CHECK (
        "students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.students.create'
        AND public.openschool_student_scope_allows(
          "students"."tenant_id", "students"."school_id", "students"."id"
        )
      );--> statement-breakpoint
CREATE POLICY "students_runtime_update" ON "students" AS PERMISSIVE FOR UPDATE TO "openschool_runtime" USING (
        "students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.students.update'
        AND public.openschool_student_scope_allows(
          "students"."tenant_id", "students"."school_id", "students"."id"
        )
      ) WITH CHECK (
        "students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.students.update'
        AND public.openschool_student_scope_allows(
          "students"."tenant_id", "students"."school_id", "students"."id"
        )
      );--> statement-breakpoint
CREATE POLICY "students_runtime_delete" ON "students" AS PERMISSIVE FOR DELETE TO "openschool_runtime" USING (
        "students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.students.delete'
        AND public.openschool_student_scope_allows(
          "students"."tenant_id", "students"."school_id", "students"."id"
        )
      );--> statement-breakpoint
CREATE POLICY "students_worker_select" ON "students" AS PERMISSIVE FOR SELECT TO "openschool_worker" USING ("students"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "students_worker_insert_deny" ON "students" AS PERMISSIVE FOR INSERT TO "openschool_worker" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "students_worker_update_deny" ON "students" AS PERMISSIVE FOR UPDATE TO "openschool_worker" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "students_worker_delete_deny" ON "students" AS PERMISSIVE FOR DELETE TO "openschool_worker" USING (false);
