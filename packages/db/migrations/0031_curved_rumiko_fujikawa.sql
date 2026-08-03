ALTER TABLE "school_enrollment_transition_events" DROP CONSTRAINT "school_enrollment_transition_events_shape_check";--> statement-breakpoint
ALTER TABLE "school_enrollment_transition_events" DROP CONSTRAINT "school_enrollment_transition_events_tenant_from_fk";
--> statement-breakpoint
ALTER TABLE "school_enrollment_transition_events" DROP CONSTRAINT "school_enrollment_transition_events_tenant_to_fk";
--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_transition_reference_unique" UNIQUE("tenant_id","id","person_id","school_id");--> statement-breakpoint
ALTER TABLE "school_enrollment_transition_events" ADD CONSTRAINT "school_enrollment_transition_events_tenant_from_fk" FOREIGN KEY ("tenant_id","from_enrollment_id","person_id","source_school_id") REFERENCES "public"."school_enrollments"("tenant_id","id","person_id","school_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_enrollment_transition_events" ADD CONSTRAINT "school_enrollment_transition_events_tenant_to_fk" FOREIGN KEY ("tenant_id","to_enrollment_id","person_id","destination_school_id") REFERENCES "public"."school_enrollments"("tenant_id","id","person_id","school_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint

CREATE FUNCTION "openschool_private"."assign_school_enrollment_tree_version"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.source = 'native' AND NEW.organization_tree_version_id IS NULL THEN
    SELECT tree_version.id
    INTO NEW.organization_tree_version_id
    FROM public.organization_tree_versions AS tree_version
    WHERE tree_version.tenant_id = NEW.tenant_id
      AND tree_version.effective_from <= NEW.valid_from
    ORDER BY tree_version.effective_from DESC, tree_version.version DESC
    LIMIT 1;

    IF NEW.organization_tree_version_id IS NULL THEN
      RAISE EXCEPTION 'SCHOOL_ENROLLMENT_TREE_CONTEXT_STALE' USING ERRCODE = '40001';
    END IF;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "openschool_private"."assign_school_enrollment_tree_version"()
  FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER "school_enrollments_assign_tree_version"
  BEFORE INSERT ON "school_enrollments"
  FOR EACH ROW EXECUTE FUNCTION "openschool_private"."assign_school_enrollment_tree_version"();--> statement-breakpoint

ALTER TABLE "school_enrollment_transition_events" ADD CONSTRAINT "school_enrollment_transition_events_shape_check" CHECK ((
          "school_enrollment_transition_events"."transition_type" IN ('withdraw', 'graduate', 'end_secondary')
          AND "school_enrollment_transition_events"."from_enrollment_id" IS NOT NULL
          AND "school_enrollment_transition_events"."source_school_id" IS NOT NULL
          AND "school_enrollment_transition_events"."destination_school_id" IS NULL
          AND "school_enrollment_transition_events"."to_enrollment_id" IS NULL
        ) OR (
          "school_enrollment_transition_events"."transition_type" = 'transfer'
          AND "school_enrollment_transition_events"."from_enrollment_id" IS NOT NULL
          AND "school_enrollment_transition_events"."source_school_id" IS NOT NULL
          AND "school_enrollment_transition_events"."destination_school_id" IS NOT NULL
          AND (
            ("school_enrollment_transition_events"."event_type" = 'applied' AND "school_enrollment_transition_events"."to_enrollment_id" IS NOT NULL)
            OR ("school_enrollment_transition_events"."event_type" IN ('scheduled', 'cancelled') AND "school_enrollment_transition_events"."to_enrollment_id" IS NULL)
          )
        ) OR (
          "school_enrollment_transition_events"."transition_type" IN ('reenroll', 'add_secondary')
          AND "school_enrollment_transition_events"."from_enrollment_id" IS NULL
          AND "school_enrollment_transition_events"."source_school_id" IS NULL
          AND "school_enrollment_transition_events"."destination_school_id" IS NOT NULL
          AND (
            ("school_enrollment_transition_events"."event_type" = 'applied' AND "school_enrollment_transition_events"."to_enrollment_id" IS NOT NULL)
            OR ("school_enrollment_transition_events"."event_type" IN ('scheduled', 'cancelled') AND "school_enrollment_transition_events"."to_enrollment_id" IS NULL)
          )
        ));--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_native_tree_version_check" CHECK ("school_enrollments"."source" = 'legacy_backfill' OR "school_enrollments"."organization_tree_version_id" IS NOT NULL);--> statement-breakpoint
ALTER POLICY "school_enrollments_admitter_update" ON "school_enrollments" TO openschool_student_admitter USING (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.student_enrollments.manage'
        AND public.openschool_canonical_student_scope_allows(
          "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
        )
      ) WITH CHECK (
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND "school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.student_enrollments.manage'
        AND public.openschool_canonical_student_scope_allows(
          "school_enrollments"."tenant_id", "school_enrollments"."school_id", "school_enrollments"."person_id"
        )
      );
