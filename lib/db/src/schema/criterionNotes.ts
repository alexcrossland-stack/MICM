import { pgTable, serial, timestamp, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { assessmentCyclesTable } from "./assessments";
import { criteriaTable } from "./domains";

export const criterionNotesTable = pgTable("criterion_notes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  assessmentId: integer("assessment_id").notNull().references(() => assessmentCyclesTable.id),
  criterionId: integer("criterion_id").notNull().references(() => criteriaTable.id),
  authorUserId: integer("author_user_id").notNull().references(() => usersTable.id),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCriterionNoteSchema = createInsertSchema(criterionNotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCriterionNote = z.infer<typeof insertCriterionNoteSchema>;
export type CriterionNote = typeof criterionNotesTable.$inferSelect;
