import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const domainsTable = pgTable("domains", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull().default(0),
});

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  domainId: integer("domain_id").notNull().references(() => domainsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull().default(0),
});

export const criteriaTable = pgTable("criteria", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
  name: text("name").notNull(),
  description: text("description"),
  baselineDescription: text("baseline_description"),
  excellenceDescription: text("excellence_description"),
  orderIndex: integer("order_index").notNull().default(0),
});

export const insertDomainSchema = createInsertSchema(domainsTable).omit({ id: true });
export type InsertDomain = z.infer<typeof insertDomainSchema>;
export type Domain = typeof domainsTable.$inferSelect;

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;

export const insertCriterionSchema = createInsertSchema(criteriaTable).omit({ id: true });
export type InsertCriterion = z.infer<typeof insertCriterionSchema>;
export type Criterion = typeof criteriaTable.$inferSelect;
