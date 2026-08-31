ALTER TABLE "scores" ALTER COLUMN "criterion_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ALTER COLUMN "assessment_question_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "criterion_notes" ALTER COLUMN "criterion_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "criterion_notes" ALTER COLUMN "assessment_question_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_question_assessment_fk" FOREIGN KEY ("assessment_id","assessment_question_id") REFERENCES "public"."assessment_questions"("assessment_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_notes" ADD CONSTRAINT "criterion_notes_question_assessment_fk" FOREIGN KEY ("assessment_id","assessment_question_id") REFERENCES "public"."assessment_questions"("assessment_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "criterion_notes_question_idx" ON "criterion_notes" USING btree ("assessment_id","assessment_question_id");--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_question_user_unique" UNIQUE("assessment_id","user_id","assessment_question_id");--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_maturity_scale" CHECK ("scores"."score" BETWEEN 0 AND 4);