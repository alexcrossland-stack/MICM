import { pgTable, serial, timestamp, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { assessmentCyclesTable } from "./assessments";
import { criteriaTable } from "./domains";

export const scoresTable = pgTable("scores", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull().references(() => assessmentCyclesTable.id),
  userId: integer("user_id").notNull(),
  criterionId: integer("criterion_id").notNull().references(() => criteriaTable.id),
  score: integer("score").notNull(), // 0-4
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertScoreSchema = createInsertSchema(scoresTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertScore = z.infer<typeof insertScoreSchema>;
export type Score = typeof scoresTable.$inferSelect;
