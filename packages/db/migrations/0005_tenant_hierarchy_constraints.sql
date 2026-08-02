ALTER TABLE "schools" DROP CONSTRAINT "schools_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "classes" DROP CONSTRAINT "classes_school_id_schools_id_fk";
--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT "students_school_id_schools_id_fk";
--> statement-breakpoint
ALTER TABLE "parent_student" DROP CONSTRAINT "parent_student_student_id_students_id_fk";
--> statement-breakpoint
ALTER TABLE "teachers_on_class" DROP CONSTRAINT "teachers_on_class_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "users_on_org" DROP CONSTRAINT "users_on_org_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "users_on_school" DROP CONSTRAINT "users_on_school_school_id_schools_id_fk";
--> statement-breakpoint
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_student_id_students_id_fk";
--> statement-breakpoint
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "grades" DROP CONSTRAINT "grades_enrollment_id_enrollments_id_fk";
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "parent_student" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teachers_on_class" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users_on_org" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users_on_school" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grades" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_tenant_organization_fk" FOREIGN KEY ("tenant_id","org_id") REFERENCES "public"."organizations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "education_organizations" ADD CONSTRAINT "education_organizations_legacy_organization_fk" FOREIGN KEY ("tenant_id","legacy_organization_id") REFERENCES "public"."organizations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "parent_student" ADD CONSTRAINT "parent_student_tenant_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "teachers_on_class" ADD CONSTRAINT "teachers_on_class_tenant_class_fk" FOREIGN KEY ("tenant_id","class_id") REFERENCES "public"."classes"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "users_on_org" ADD CONSTRAINT "users_on_org_tenant_organization_fk" FOREIGN KEY ("tenant_id","org_id") REFERENCES "public"."organizations"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "users_on_school" ADD CONSTRAINT "users_on_school_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_class_fk" FOREIGN KEY ("tenant_id","class_id") REFERENCES "public"."classes"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_enrollment_fk" FOREIGN KEY ("tenant_id","enrollment_id") REFERENCES "public"."enrollments"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "schools_tenant_organization_idx" ON "schools" USING btree ("tenant_id","org_id");--> statement-breakpoint
CREATE INDEX "classes_tenant_school_idx" ON "classes" USING btree ("tenant_id","school_id");--> statement-breakpoint
CREATE INDEX "students_tenant_school_idx" ON "students" USING btree ("tenant_id","school_id");--> statement-breakpoint
CREATE INDEX "parent_student_tenant_parent_idx" ON "parent_student" USING btree ("tenant_id","parent_id");--> statement-breakpoint
CREATE INDEX "teachers_on_class_tenant_user_idx" ON "teachers_on_class" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "users_on_org_tenant_user_idx" ON "users_on_org" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "users_on_school_tenant_user_idx" ON "users_on_school" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "enrollments_tenant_student_idx" ON "enrollments" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX "enrollments_tenant_class_idx" ON "enrollments" USING btree ("tenant_id","class_id");--> statement-breakpoint
CREATE INDEX "grades_tenant_enrollment_idx" ON "grades" USING btree ("tenant_id","enrollment_id");--> statement-breakpoint
ALTER TABLE "parent_student" ADD CONSTRAINT "parent_student_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "teachers_on_class" ADD CONSTRAINT "teachers_on_class_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "users_on_org" ADD CONSTRAINT "users_on_org_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "users_on_school" ADD CONSTRAINT "users_on_school_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_id_unique" UNIQUE("tenant_id","id");