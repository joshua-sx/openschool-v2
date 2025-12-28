ALTER TABLE "schools" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;