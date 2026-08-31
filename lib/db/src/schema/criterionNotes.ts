import { pgTable, serial, timestamp, integer, text, foreignKey, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { assessmentCyclesTable } from "./assessments";
import { criteriaTable } from "./domains";
import { assessmentQuestionsTable } from "./assessmentQuestions";

export const criterionNotesTable = pgTable("criterion_notes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  assessmentId: integer("assessment_id").notNull().references(() => assessmentCyclesTable.id),
  criterionId: integer("criterion_id").references(() => criteriaTable.id),
  assessmentQuestionId: integer("assessment_question_id").notNull().references(() => assessmentQuestionsTable.id),
  authorUserId: integer("author_user_id").notNull().references(() => usersTable.id),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  foreignKey({ columns: [table.assessmentId, table.assessmentQuestionId], foreignColumns: [assessmentQuestionsTable.assessmentId, assessmentQuestionsTable.id], name: "criterion_notes_question_assessment_fk" }),
  index("criterion_notes_question_idx").on(table.assessmentId, table.assessmentQuestionId),
]);

export const insertCriterionNoteSchema = createInsertSchema(criterionNotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCriterionNote = z.infer<typeof insertCriterionNoteSchema>;
export type CriterionNote = typeof criterionNotesTable.$inferSelect;
