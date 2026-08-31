import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { assessmentCyclesTable } from "./assessments";
import { categoriesTable, criteriaTable, domainsTable } from "./domains";

export const assessmentQuestionsTable = pgTable(
  "assessment_questions",
  {
    id: serial("id").primaryKey(),
    assessmentId: integer("assessment_id")
      .notNull()
      .references(() => assessmentCyclesTable.id),
    sourceCriterionId: integer("source_criterion_id").references(
      () => criteriaTable.id,
    ),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id),
    domainId: integer("domain_id")
      .notNull()
      .references(() => domainsTable.id),
    domainName: text("domain_name").notNull(),
    domainDescription: text("domain_description"),
    domainOrder: integer("domain_order").notNull(),
    categoryName: text("category_name").notNull(),
    categoryOrder: integer("category_order").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    baselineDescription: text("baseline_description"),
    excellenceDescription: text("excellence_description"),
    orderIndex: integer("order_index").notNull().default(0),
    isIncluded: boolean("is_included").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("assessment_questions_assessment_id_id_unique").on(
      table.assessmentId,
      table.id,
    ),
    unique("assessment_questions_source_unique").on(
      table.assessmentId,
      table.sourceCriterionId,
    ),
    index("assessment_questions_order_idx").on(
      table.assessmentId,
      table.orderIndex,
    ),
  ],
);

export type AssessmentQuestion = typeof assessmentQuestionsTable.$inferSelect;
