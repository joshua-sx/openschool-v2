ALTER TABLE "schools" ADD COLUMN "academic_year" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "terms" jsonb DEFAULT '[]'::jsonb;