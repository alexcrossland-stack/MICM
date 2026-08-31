CREATE TABLE "assessment_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"source_criterion_id" integer,
	"category_id" integer NOT NULL,
	"domain_id" integer NOT NULL,
	"domain_name" text NOT NULL,
	"domain_description" text,
	"domain_order" integer NOT NULL,
	"category_name" text NOT NULL,
	"category_order" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"baseline_description" text,
	"excellence_description" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"is_included" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_questions_assessment_id_id_unique" UNIQUE("assessment_id","id"),
	CONSTRAINT "assessment_questions_source_unique" UNIQUE("assessment_id","source_criterion_id")
);
--> statement-breakpoint
ALTER TABLE "assessment_cycles" ADD COLUMN "questions_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment_cycles" ADD COLUMN "questions_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assessment_cycles" ADD COLUMN "questions_origin" text DEFAULT 'catalogue_copy' NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "assessment_question_id" integer;--> statement-breakpoint
ALTER TABLE "criterion_notes" ADD COLUMN "assessment_question_id" integer;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_assessment_id_assessment_cycles_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_source_criterion_id_criteria_id_fk" FOREIGN KEY ("source_criterion_id") REFERENCES "public"."criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessment_questions_order_idx" ON "assessment_questions" USING btree ("assessment_id","order_index");--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_assessment_question_id_assessment_questions_id_fk" FOREIGN KEY ("assessment_question_id") REFERENCES "public"."assessment_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_notes" ADD CONSTRAINT "criterion_notes_assessment_question_id_assessment_questions_id_fk" FOREIGN KEY ("assessment_question_id") REFERENCES "public"."assessment_questions"("id") ON DELETE no action ON UPDATE no action;