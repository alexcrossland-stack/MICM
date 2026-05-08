import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const assessmentCyclesTable = pgTable("assessment_cycles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"), // draft | active | completed
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const assessmentAssigneesTable = pgTable("assessment_assignees", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull().references(() => assessmentCyclesTable.id),
  userId: integer("user_id").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAssessmentCycleSchema = createInsertSchema(assessmentCyclesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAssessmentCycle = z.infer<typeof insertAssessmentCycleSchema>;
export type AssessmentCycle = typeof assessmentCyclesTable.$inferSelect;

export const insertAssessmentAssigneeSchema = createInsertSchema(assessmentAssigneesTable).omit({ id: true, createdAt: true });
export type InsertAssessmentAssignee = z.infer<typeof insertAssessmentAssigneeSchema>;
export type AssessmentAssignee = typeof assessmentAssigneesTable.$inferSelect;
