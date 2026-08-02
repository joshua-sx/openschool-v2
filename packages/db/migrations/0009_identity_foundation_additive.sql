CREATE TABLE "account_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"issued_by_account_id" uuid,
	"issuance_reason" text NOT NULL,
	"activated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_account_id" uuid,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_links_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "account_links_status_check" CHECK ("account_links"."status" IN ('pending', 'active', 'suspended', 'revoked', 'expired')),
	CONSTRAINT "account_links_valid_period_check" CHECK ("account_links"."valid_from" IS NULL OR "account_links"."valid_until" IS NULL OR "account_links"."valid_until" > "account_links"."valid_from"),
	CONSTRAINT "account_links_activation_evidence_check" CHECK ("account_links"."status" <> 'active' OR ("account_links"."valid_from" IS NOT NULL AND "account_links"."activated_at" IS NOT NULL)),
	CONSTRAINT "account_links_revocation_evidence_check" CHECK ("account_links"."status" <> 'revoked' OR ("account_links"."revoked_at" IS NOT NULL AND "account_links"."revocation_reason" IS NOT NULL AND "account_links"."valid_until" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_user_id" uuid,
	"identity_provider" text DEFAULT 'supabase' NOT NULL,
	"provider_subject" text NOT NULL,
	"primary_email" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"membership_version" bigint DEFAULT 1 NOT NULL,
	"security_version" bigint DEFAULT 1 NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_legacy_user_id_unique" UNIQUE("legacy_user_id"),
	CONSTRAINT "accounts_provider_subject_unique" UNIQUE("identity_provider","provider_subject"),
	CONSTRAINT "accounts_primary_email_unique" UNIQUE("primary_email"),
	CONSTRAINT "accounts_status_check" CHECK ("accounts"."status" IN ('active', 'disabled', 'deleted')),
	CONSTRAINT "accounts_versions_positive" CHECK ("accounts"."membership_version" > 0 AND "accounts"."security_version" > 0),
	CONSTRAINT "accounts_disabled_evidence_check" CHECK ("accounts"."status" = 'active' OR ("accounts"."disabled_at" IS NOT NULL AND "accounts"."disabled_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "affiliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"scope_type" text NOT NULL,
	"education_organization_id" uuid,
	"school_id" uuid,
	"class_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"issued_by_account_id" uuid,
	"issuance_reason" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_account_id" uuid,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliations_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "affiliations_kind_check" CHECK ("affiliations"."kind" IN ('student', 'guardian', 'employee', 'teacher', 'administrator', 'member')),
	CONSTRAINT "affiliations_status_check" CHECK ("affiliations"."status" IN ('active', 'suspended', 'revoked')),
	CONSTRAINT "affiliations_scope_check" CHECK (("affiliations"."scope_type" = 'tenant' AND "affiliations"."education_organization_id" IS NULL AND "affiliations"."school_id" IS NULL AND "affiliations"."class_id" IS NULL)
          OR ("affiliations"."scope_type" = 'education_organization' AND "affiliations"."education_organization_id" IS NOT NULL AND "affiliations"."school_id" IS NULL AND "affiliations"."class_id" IS NULL)
          OR ("affiliations"."scope_type" = 'school' AND "affiliations"."education_organization_id" IS NULL AND "affiliations"."school_id" IS NOT NULL AND "affiliations"."class_id" IS NULL)
          OR ("affiliations"."scope_type" = 'class' AND "affiliations"."education_organization_id" IS NULL AND "affiliations"."school_id" IS NULL AND "affiliations"."class_id" IS NOT NULL)),
	CONSTRAINT "affiliations_valid_period_check" CHECK ("affiliations"."valid_until" IS NULL OR "affiliations"."valid_until" > "affiliations"."valid_from"),
	CONSTRAINT "affiliations_revocation_evidence_check" CHECK ("affiliations"."status" <> 'revoked' OR ("affiliations"."revoked_at" IS NOT NULL AND "affiliations"."revocation_reason" IS NOT NULL AND "affiliations"."valid_until" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "employee_profiles" (
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"employee_number" text,
	"job_title" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_profiles_pk" PRIMARY KEY("tenant_id","person_id"),
	CONSTRAINT "employee_profiles_tenant_employee_number_unique" UNIQUE("tenant_id","employee_number"),
	CONSTRAINT "employee_profiles_status_check" CHECK ("employee_profiles"."status" IN ('active', 'leave', 'terminated'))
);
--> statement-breakpoint
CREATE TABLE "guardian_profiles" (
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_profiles_pk" PRIMARY KEY("tenant_id","person_id"),
	CONSTRAINT "guardian_profiles_status_check" CHECK ("guardian_profiles"."status" IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "identity_migration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"account_link_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"membership_version" bigint NOT NULL,
	"actor_account_id" uuid,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_migration_events_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "identity_migration_events_type_check" CHECK ("identity_migration_events"."event_type" IN ('account_link_backfilled', 'account_link_activated', 'account_link_revoked')),
	CONSTRAINT "identity_migration_events_version_positive" CHECK ("identity_migration_events"."membership_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legacy_user_id" uuid,
	"legacy_student_id" uuid,
	"display_name" text NOT NULL,
	"normalized_display_name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"date_of_birth" date,
	"email" text,
	"normalized_email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'native' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "people_tenant_legacy_user_unique" UNIQUE("tenant_id","legacy_user_id"),
	CONSTRAINT "people_tenant_legacy_student_unique" UNIQUE("tenant_id","legacy_student_id"),
	CONSTRAINT "people_status_check" CHECK ("people"."status" IN ('active', 'suspended', 'archived', 'deceased')),
	CONSTRAINT "people_source_check" CHECK ("people"."source" IN ('legacy_user', 'legacy_student', 'native')),
	CONSTRAINT "people_legacy_source_check" CHECK (("people"."source" <> 'legacy_user' OR "people"."legacy_user_id" IS NOT NULL)
          AND ("people"."source" <> 'legacy_student' OR "people"."legacy_student_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "person_merge_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_person_id" uuid NOT NULL,
	"target_person_id" uuid NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_by_account_id" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_merge_evidence_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "person_merge_evidence_status_check" CHECK ("person_merge_evidence"."status" IN ('proposed', 'approved', 'completed', 'rejected', 'reverted')),
	CONSTRAINT "person_merge_evidence_distinct_people_check" CHECK ("person_merge_evidence"."source_person_id" <> "person_merge_evidence"."target_person_id"),
	CONSTRAINT "person_merge_evidence_completion_check" CHECK ("person_merge_evidence"."status" <> 'completed' OR "person_merge_evidence"."completed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "person_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_person_id" uuid NOT NULL,
	"related_person_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"issued_by_account_id" uuid,
	"issuance_reason" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_account_id" uuid,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_relationships_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "person_relationships_type_check" CHECK ("person_relationships"."type" IN ('guardian_of', 'parent_of', 'emergency_contact_of', 'spouse_of', 'sibling_of', 'other')),
	CONSTRAINT "person_relationships_status_check" CHECK ("person_relationships"."status" IN ('active', 'suspended', 'revoked')),
	CONSTRAINT "person_relationships_distinct_people_check" CHECK ("person_relationships"."subject_person_id" <> "person_relationships"."related_person_id"),
	CONSTRAINT "person_relationships_valid_period_check" CHECK ("person_relationships"."valid_until" IS NULL OR "person_relationships"."valid_until" > "person_relationships"."valid_from"),
	CONSTRAINT "person_relationships_revocation_evidence_check" CHECK ("person_relationships"."status" <> 'revoked' OR ("person_relationships"."revoked_at" IS NOT NULL AND "person_relationships"."revocation_reason" IS NOT NULL AND "person_relationships"."valid_until" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "role_template_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"affiliation_id" uuid NOT NULL,
	"role_template_key" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"issued_by_account_id" uuid,
	"issuance_reason" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_account_id" uuid,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_template_assignments_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "role_template_assignments_status_check" CHECK ("role_template_assignments"."status" IN ('active', 'suspended', 'revoked')),
	CONSTRAINT "role_template_assignments_valid_period_check" CHECK ("role_template_assignments"."valid_until" IS NULL OR "role_template_assignments"."valid_until" > "role_template_assignments"."valid_from"),
	CONSTRAINT "role_template_assignments_revocation_evidence_check" CHECK ("role_template_assignments"."status" <> 'revoked' OR ("role_template_assignments"."revoked_at" IS NOT NULL AND "role_template_assignments"."revocation_reason" IS NOT NULL AND "role_template_assignments"."valid_until" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"legacy_student_id" uuid,
	"student_number" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_profiles_pk" PRIMARY KEY("tenant_id","person_id"),
	CONSTRAINT "student_profiles_tenant_student_number_unique" UNIQUE("tenant_id","student_number"),
	CONSTRAINT "student_profiles_tenant_legacy_student_unique" UNIQUE("tenant_id","legacy_student_id"),
	CONSTRAINT "student_profiles_status_check" CHECK ("student_profiles"."status" IN ('active', 'inactive', 'graduated', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "teacher_profiles" (
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"registration_number" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_profiles_pk" PRIMARY KEY("tenant_id","person_id"),
	CONSTRAINT "teacher_profiles_tenant_registration_number_unique" UNIQUE("tenant_id","registration_number"),
	CONSTRAINT "teacher_profiles_status_check" CHECK ("teacher_profiles"."status" IN ('active', 'inactive', 'suspended'))
);
--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_issued_by_account_id_accounts_id_fk" FOREIGN KEY ("issued_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_revoked_by_account_id_accounts_id_fk" FOREIGN KEY ("revoked_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_legacy_user_id_users_id_fk" FOREIGN KEY ("legacy_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_issued_by_account_id_accounts_id_fk" FOREIGN KEY ("issued_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_revoked_by_account_id_accounts_id_fk" FOREIGN KEY ("revoked_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_tenant_education_organization_fk" FOREIGN KEY ("tenant_id","education_organization_id") REFERENCES "public"."education_organizations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_tenant_class_fk" FOREIGN KEY ("tenant_id","class_id") REFERENCES "public"."classes"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "guardian_profiles" ADD CONSTRAINT "guardian_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "guardian_profiles" ADD CONSTRAINT "guardian_profiles_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "identity_migration_events" ADD CONSTRAINT "identity_migration_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "identity_migration_events" ADD CONSTRAINT "identity_migration_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "identity_migration_events" ADD CONSTRAINT "identity_migration_events_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "identity_migration_events" ADD CONSTRAINT "identity_migration_events_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "identity_migration_events" ADD CONSTRAINT "identity_migration_events_tenant_account_link_fk" FOREIGN KEY ("tenant_id","account_link_id") REFERENCES "public"."account_links"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_legacy_user_id_users_id_fk" FOREIGN KEY ("legacy_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_tenant_legacy_student_fk" FOREIGN KEY ("tenant_id","legacy_student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_evidence" ADD CONSTRAINT "person_merge_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_evidence" ADD CONSTRAINT "person_merge_evidence_recorded_by_account_id_accounts_id_fk" FOREIGN KEY ("recorded_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_evidence" ADD CONSTRAINT "person_merge_evidence_tenant_source_fk" FOREIGN KEY ("tenant_id","source_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_merge_evidence" ADD CONSTRAINT "person_merge_evidence_tenant_target_fk" FOREIGN KEY ("tenant_id","target_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_issued_by_account_id_accounts_id_fk" FOREIGN KEY ("issued_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_revoked_by_account_id_accounts_id_fk" FOREIGN KEY ("revoked_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_tenant_subject_fk" FOREIGN KEY ("tenant_id","subject_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_tenant_related_fk" FOREIGN KEY ("tenant_id","related_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "role_template_assignments" ADD CONSTRAINT "role_template_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "role_template_assignments" ADD CONSTRAINT "role_template_assignments_issued_by_account_id_accounts_id_fk" FOREIGN KEY ("issued_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "role_template_assignments" ADD CONSTRAINT "role_template_assignments_revoked_by_account_id_accounts_id_fk" FOREIGN KEY ("revoked_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "role_template_assignments" ADD CONSTRAINT "role_template_assignments_tenant_affiliation_fk" FOREIGN KEY ("tenant_id","affiliation_id") REFERENCES "public"."affiliations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_tenant_legacy_student_fk" FOREIGN KEY ("tenant_id","legacy_student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_tenant_person_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "account_links_account_status_idx" ON "account_links" USING btree ("account_id","status","tenant_id");--> statement-breakpoint
CREATE INDEX "account_links_tenant_person_status_idx" ON "account_links" USING btree ("tenant_id","person_id","status");--> statement-breakpoint
CREATE INDEX "affiliations_tenant_person_effective_idx" ON "affiliations" USING btree ("tenant_id","person_id","status","valid_from","valid_until");--> statement-breakpoint
CREATE INDEX "affiliations_tenant_school_effective_idx" ON "affiliations" USING btree ("tenant_id","school_id","status","valid_from","valid_until");--> statement-breakpoint
CREATE INDEX "identity_migration_events_account_version_idx" ON "identity_migration_events" USING btree ("account_id","membership_version");--> statement-breakpoint
CREATE INDEX "identity_migration_events_tenant_person_idx" ON "identity_migration_events" USING btree ("tenant_id","person_id","created_at");--> statement-breakpoint
CREATE INDEX "people_tenant_name_idx" ON "people" USING btree ("tenant_id","normalized_display_name","id");--> statement-breakpoint
CREATE INDEX "people_tenant_email_idx" ON "people" USING btree ("tenant_id","normalized_email","id");--> statement-breakpoint
CREATE INDEX "person_merge_evidence_tenant_people_idx" ON "person_merge_evidence" USING btree ("tenant_id","source_person_id","target_person_id","created_at");--> statement-breakpoint
CREATE INDEX "person_relationships_subject_effective_idx" ON "person_relationships" USING btree ("tenant_id","subject_person_id","status","valid_from","valid_until");--> statement-breakpoint
CREATE INDEX "person_relationships_related_effective_idx" ON "person_relationships" USING btree ("tenant_id","related_person_id","status","valid_from","valid_until");--> statement-breakpoint
CREATE INDEX "role_template_assignments_affiliation_effective_idx" ON "role_template_assignments" USING btree ("tenant_id","affiliation_id","status","valid_from","valid_until");