import { pgTable, serial, timestamp, integer, text, foreignKey, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { assessmentCyclesTable } from "./assessments";
import { criteriaTable } from "./domains";
import { assessmentQuestionsTable } from "./assessmentQuestions";

export const scoresTable = pgTable("scores", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull().references(() => assessmentCyclesTable.id),
  userId: integer("user_id").notNull(),
  criterionId: integer("criterion_id").references(() => criteriaTable.id),
  assessmentQuestionId: integer("assessment_question_id").notNull().references(() => assessmentQuestionsTable.id),
  score: integer("score").notNull(), // 0-4
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  foreignKey({ columns: [table.assessmentId, table.assessmentQuestionId], foreignColumns: [assessmentQuestionsTable.assessmentId, assessmentQuestionsTable.id], name: "scores_question_assessment_fk" }),
  unique("scores_question_user_unique").on(table.assessmentId, table.userId, table.assessmentQuestionId),
  check("scores_maturity_scale", sql`${table.score} BETWEEN 0 AND 4`),
]);

export const insertScoreSchema = createInsertSchema(scoresTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertScore = z.infer<typeof insertScoreSchema>;
export type Score = typeof scoresTable.$inferSelect;
