import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const actionsTable = pgTable("actions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  assessmentId: integer("assessment_id"),
  domainId: integer("domain_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("not_started"), // not_started | in_progress | completed | on_hold
  priority: text("priority").notNull().default("medium"), // low | medium | high
  assignedUserId: integer("assigned_user_id"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completedDate: timestamp("completed_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertActionSchema = createInsertSchema(actionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAction = z.infer<typeof insertActionSchema>;
export type Action = typeof actionsTable.$inferSelect;
