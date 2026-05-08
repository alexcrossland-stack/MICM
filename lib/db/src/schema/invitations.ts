import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const invitationsTable = pgTable("invitations", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull(), // super_admin | company_admin | company_user
  companyId: integer("company_id").references(() => companiesTable.id),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"), // pending | accepted | expired
  invitedById: integer("invited_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInvitationSchema = createInsertSchema(invitationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitationsTable.$inferSelect;
