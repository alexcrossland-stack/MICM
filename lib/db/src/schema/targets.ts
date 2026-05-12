import { pgTable, serial, integer, real, timestamp, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { domainsTable } from "./domains";

export const maturityTargetsTable = pgTable(
  "maturity_targets",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companiesTable.id),
    domainId: integer("domain_id").notNull().references(() => domainsTable.id),
    targetScore: real("target_score").notNull(),
    targetDate: timestamp("target_date", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("uniq_company_domain_target").on(t.companyId, t.domainId)],
);

export const insertMaturityTargetSchema = createInsertSchema(maturityTargetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMaturityTarget = z.infer<typeof insertMaturityTargetSchema>;
export type MaturityTargetRow = typeof maturityTargetsTable.$inferSelect;
