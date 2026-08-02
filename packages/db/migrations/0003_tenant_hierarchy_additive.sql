CREATE TABLE "tenant_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"adapter" text DEFAULT 'pooled' NOT NULL,
	"placement_key" text DEFAULT 'primary' NOT NULL,
	"region" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_placements_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "education_organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legacy_organization_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "education_organizations_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "education_organizations_tenant_id_slug_unique" UNIQUE("tenant_id","slug"),
	CONSTRAINT "education_organizations_legacy_organization_id_unique" UNIQUE("legacy_organization_id")
);
--> statement-breakpoint
CREATE TABLE "organization_tree_closure" (
	"tenant_id" uuid NOT NULL,
	"tree_version_id" uuid NOT NULL,
	"ancestor_organization_id" uuid NOT NULL,
	"descendant_organization_id" uuid NOT NULL,
	"depth" integer NOT NULL,
	CONSTRAINT "organization_tree_closure_pk" PRIMARY KEY("tenant_id","tree_version_id","ancestor_organization_id","descendant_organization_id"),
	CONSTRAINT "organization_tree_closure_depth_nonnegative" CHECK ("organization_tree_closure"."depth" >= 0),
	CONSTRAINT "organization_tree_closure_self_depth" CHECK (("organization_tree_closure"."ancestor_organization_id" = "organization_tree_closure"."descendant_organization_id") = ("organization_tree_closure"."depth" = 0))
);
--> statement-breakpoint
CREATE TABLE "organization_tree_nodes" (
	"tenant_id" uuid NOT NULL,
	"tree_version_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"parent_organization_id" uuid,
	CONSTRAINT "organization_tree_nodes_pk" PRIMARY KEY("tenant_id","tree_version_id","organization_id"),
	CONSTRAINT "organization_tree_nodes_not_self_parent" CHECK ("organization_tree_nodes"."parent_organization_id" IS NULL OR "organization_tree_nodes"."parent_organization_id" <> "organization_tree_nodes"."organization_id")
);
--> statement-breakpoint
CREATE TABLE "organization_tree_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_tree_versions_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "organization_tree_versions_tenant_id_version_unique" UNIQUE("tenant_id","version"),
	CONSTRAINT "organization_tree_versions_tenant_effective_from_unique" UNIQUE("tenant_id","effective_from"),
	CONSTRAINT "organization_tree_versions_version_positive" CHECK ("organization_tree_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "school_governance_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"education_organization_id" uuid NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_governance_assignments_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "school_governance_assignments_valid_period" CHECK ("school_governance_assignments"."valid_until" IS NULL OR "school_governance_assignments"."valid_until" > "school_governance_assignments"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT "students_student_number_unique";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "parent_student" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "teachers_on_class" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "users_on_org" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "users_on_school" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "grades" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_tenant_id_slug_unique" UNIQUE("tenant_id","slug");--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_student_number_unique" UNIQUE("tenant_id","student_number");--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "tenant_placements" ADD CONSTRAINT "tenant_placements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "education_organizations" ADD CONSTRAINT "education_organizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "organization_tree_closure" ADD CONSTRAINT "organization_tree_closure_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "organization_tree_closure" ADD CONSTRAINT "organization_tree_closure_version_fk" FOREIGN KEY ("tenant_id","tree_version_id") REFERENCES "public"."organization_tree_versions"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tree_closure" ADD CONSTRAINT "organization_tree_closure_ancestor_fk" FOREIGN KEY ("tenant_id","ancestor_organization_id") REFERENCES "public"."education_organizations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tree_closure" ADD CONSTRAINT "organization_tree_closure_descendant_fk" FOREIGN KEY ("tenant_id","descendant_organization_id") REFERENCES "public"."education_organizations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tree_nodes" ADD CONSTRAINT "organization_tree_nodes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "organization_tree_nodes" ADD CONSTRAINT "organization_tree_nodes_version_fk" FOREIGN KEY ("tenant_id","tree_version_id") REFERENCES "public"."organization_tree_versions"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tree_nodes" ADD CONSTRAINT "organization_tree_nodes_organization_fk" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "public"."education_organizations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tree_nodes" ADD CONSTRAINT "organization_tree_nodes_parent_fk" FOREIGN KEY ("tenant_id","parent_organization_id") REFERENCES "public"."education_organizations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tree_versions" ADD CONSTRAINT "organization_tree_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_governance_assignments" ADD CONSTRAINT "school_governance_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "school_governance_assignments" ADD CONSTRAINT "school_governance_assignments_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_governance_assignments" ADD CONSTRAINT "school_governance_assignments_organization_fk" FOREIGN KEY ("tenant_id","education_organization_id") REFERENCES "public"."education_organizations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "education_organizations_tenant_type_idx" ON "education_organizations" USING btree ("tenant_id","type");--> statement-breakpoint
CREATE INDEX "organization_tree_closure_descendants_idx" ON "organization_tree_closure" USING btree ("tenant_id","tree_version_id","ancestor_organization_id","depth","descendant_organization_id");--> statement-breakpoint
CREATE INDEX "organization_tree_closure_ancestors_idx" ON "organization_tree_closure" USING btree ("tenant_id","tree_version_id","descendant_organization_id","depth","ancestor_organization_id");--> statement-breakpoint
CREATE INDEX "organization_tree_nodes_parent_idx" ON "organization_tree_nodes" USING btree ("tenant_id","tree_version_id","parent_organization_id");--> statement-breakpoint
CREATE INDEX "organization_tree_versions_effective_lookup_idx" ON "organization_tree_versions" USING btree ("tenant_id","effective_from");--> statement-breakpoint
CREATE INDEX "school_governance_assignments_effective_lookup_idx" ON "school_governance_assignments" USING btree ("tenant_id","school_id","valid_from","valid_until");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "parent_student" ADD CONSTRAINT "parent_student_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "teachers_on_class" ADD CONSTRAINT "teachers_on_class_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "users_on_org" ADD CONSTRAINT "users_on_org_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "users_on_school" ADD CONSTRAINT "users_on_school_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;
