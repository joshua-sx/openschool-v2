CREATE POLICY "school_enrollments_section_manager_select" ON "school_enrollments" AS PERMISSIVE FOR SELECT TO "openschool_section_manager" USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_section_manager'
        AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.sections.manage'
        AND public.openschool_school_scope_allows("school_enrollments"."tenant_id", "school_enrollments"."school_id")
      );--> statement-breakpoint
CREATE POLICY "academic_terms_section_manager_select" ON "academic_terms" AS PERMISSIVE FOR SELECT TO "openschool_section_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_section_manager'
  AND "academic_terms"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    = 'tenant.sections.manage'
  AND public.openschool_school_scope_allows("academic_terms"."tenant_id", "academic_terms"."school_id")
);--> statement-breakpoint
CREATE POLICY "academic_years_section_manager_select" ON "academic_years" AS PERMISSIVE FOR SELECT TO "openschool_section_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_section_manager'
  AND "academic_years"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    = 'tenant.sections.manage'
  AND public.openschool_school_scope_allows("academic_years"."tenant_id", "academic_years"."school_id")
);--> statement-breakpoint
CREATE POLICY "learner_levels_section_manager_select" ON "learner_levels" AS PERMISSIVE FOR SELECT TO "openschool_section_manager" USING (
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_section_manager'
  AND "learner_levels"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    = 'tenant.sections.manage'
  AND public.openschool_school_scope_allows("learner_levels"."tenant_id", "learner_levels"."school_id")
);--> statement-breakpoint
ALTER POLICY "schools_runtime_select" ON "schools" TO openschool_runtime USING (
        "schools"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND (
          "schools"."id" = nullif(current_setting('app.school_id', true), '')::uuid
          OR (
            nullif(current_setting('app.policy_capability', true), '')
              IN (
                'tenant.schools.read',
                'tenant.students.create', 'tenant.students.read',
                'tenant.students.update', 'tenant.students.delete',
                'support.schools.read', 'support.students.read',
                'tenant.accounts.invite', 'tenant.accounts.manage',
                'tenant.academic_structure.read', 'tenant.academic_structure.manage',
                'tenant.student_enrollments.read', 'tenant.student_enrollments.manage',
                'tenant.guardian_contacts.read', 'tenant.guardian_contacts.manage',
                'tenant.sections.read', 'tenant.sections.manage',
                'identity.context.resolve'
              )
            AND public.openschool_school_scope_allows(
              "schools"."tenant_id", "schools"."id"
            )
          )
        )
      );--> statement-breakpoint
ALTER POLICY "school_enrollments_runtime_select" ON "school_enrollments" TO openschool_runtime USING (
        "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') IN (

  'tenant.students.read', 'tenant.students.update',
  'tenant.students.delete', 'support.students.read',
  'tenant.student_enrollments.read', 'tenant.student_enrollments.manage'
,
          'tenant.guardian_contacts.read', 'tenant.guardian_contacts.manage',
          'tenant.households.read', 'tenant.households.manage',
          'tenant.sections.read', 'tenant.sections.manage',
          'identity.context.resolve'
        )
        AND public.openschool_canonical_student_scope_allows(
          "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
        )
      );--> statement-breakpoint
ALTER POLICY "academic_compatibility_evidence_runtime_select" ON "academic_compatibility_evidence" TO openschool_runtime USING (
  "academic_compatibility_evidence"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN (
  'tenant.academic_structure.read', 'tenant.academic_structure.manage',
  'tenant.sections.read', 'tenant.sections.manage'
)
  AND public.openschool_school_scope_allows("academic_compatibility_evidence"."tenant_id", "academic_compatibility_evidence"."school_id")
);--> statement-breakpoint
ALTER POLICY "academic_terms_runtime_select" ON "academic_terms" TO openschool_runtime USING (
  "academic_terms"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN (
  'tenant.academic_structure.read', 'tenant.academic_structure.manage',
  'tenant.sections.read', 'tenant.sections.manage'
)
  AND public.openschool_school_scope_allows("academic_terms"."tenant_id", "academic_terms"."school_id")
);--> statement-breakpoint
ALTER POLICY "academic_years_runtime_select" ON "academic_years" TO openschool_runtime USING (
  "academic_years"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN (
  'tenant.academic_structure.read', 'tenant.academic_structure.manage',
  'tenant.sections.read', 'tenant.sections.manage'
)
  AND public.openschool_school_scope_allows("academic_years"."tenant_id", "academic_years"."school_id")
);--> statement-breakpoint
ALTER POLICY "learner_levels_runtime_select" ON "learner_levels" TO openschool_runtime USING (
  "learner_levels"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN (
  'tenant.academic_structure.read', 'tenant.academic_structure.manage',
  'tenant.sections.read', 'tenant.sections.manage'
)
  AND public.openschool_school_scope_allows("learner_levels"."tenant_id", "learner_levels"."school_id")
);
