import { pgTable, text, serial, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type StakeholderEngagementRow = {
  stakeholder: string;
  engagementTopic: string;
  contact: string;
  dateOfContact: string;
};

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sector: text("sector"),
  size: text("size"),
  contactEmail: text("contact_email"),
  currentStatusDescription: text("current_status_description"),
  currentChallenges: jsonb("current_challenges").$type<string[]>().notNull().default([]),
  stakeholderEngagement: jsonb("stakeholder_engagement").$type<StakeholderEngagementRow[]>(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
