ALTER TABLE "companies" ADD COLUMN "current_status_description" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "current_challenges" jsonb DEFAULT '[]'::jsonb NOT NULL;