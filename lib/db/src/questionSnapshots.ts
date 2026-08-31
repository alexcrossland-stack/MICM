import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { db } from "./index";
import {
  assessmentQuestionsTable,
  categoriesTable,
  criteriaTable,
  domainsTable,
  type AssessmentQuestion,
} from "./schema";

export type QuestionDatabase = Pick<
  typeof db,
  "select" | "insert" | "update" | "delete"
>;

export async function createQuestionSnapshot(
  store: QuestionDatabase,
  assessmentId: number,
  copy?: AssessmentQuestion[],
) {
  let rows;
  if (copy) {
    rows = copy.map(({ id, createdAt, updatedAt, ...question }) => ({
      ...question,
      assessmentId,
    }));
  } else {
    const domains = await store.select().from(domainsTable);
    const categories = await store.select().from(categoriesTable);
    const criteria = await store.select().from(criteriaTable);
    rows = criteria.map((criterion) => {
      const category = categories.find((c) => c.id === criterion.categoryId);
      const domain = domains.find((d) => d.id === category?.domainId);
      if (!category || !domain)
        throw new Error("Invalid question catalogue hierarchy");
      return {
        assessmentId,
        sourceCriterionId: criterion.id,
        categoryId: category.id,
        domainId: domain.id,
        domainName: domain.name,
        domainDescription: domain.description,
        domainOrder: domain.orderIndex,
        categoryName: category.name,
        categoryOrder: category.orderIndex,
        name: criterion.name,
        description: criterion.description,
        baselineDescription: criterion.baselineDescription,
        excellenceDescription: criterion.excellenceDescription,
        orderIndex: criterion.orderIndex,
        isIncluded: true,
      };
    });
  }
  if (!rows.length)
    throw new Error(
      "The question catalogue is empty; an operator must provision it before creating assessments",
    );
  return store.insert(assessmentQuestionsTable).values(rows).returning();
}

export function loadAssessmentQuestions(
  store: QuestionDatabase,
  assessmentId: number,
) {
  return store
    .select()
    .from(assessmentQuestionsTable)
    .where(eq(assessmentQuestionsTable.assessmentId, assessmentId));
}

export async function attachQuestionReferences<
  T extends { assessmentId: number; criterionId: number },
>(store: QuestionDatabase, rows: T[]) {
  const questions = (
    await Promise.all(
      [...new Set(rows.map((row) => row.assessmentId))].map((id) =>
        loadAssessmentQuestions(store, id),
      ),
    )
  ).flat();
  return rows.map((row) => {
    const question = questions.find(
      (q) =>
        q.assessmentId === row.assessmentId &&
        q.sourceCriterionId === row.criterionId,
    );
    if (!question)
      throw new Error("Missing assessment question snapshot for seeded answer");
    return { ...row, assessmentQuestionId: question.id };
  });
}

export function questionSetSignature(questions: AssessmentQuestion[]) {
  const content = questions
    .filter((q) => q.isIncluded)
    .map((q) =>
      JSON.stringify([
        q.domainName,
        q.categoryName,
        q.name,
        q.description ?? "",
        q.baselineDescription ?? "",
        q.excellenceDescription ?? "",
      ]),
    )
    .sort();
  return createHash("sha256")
    .update(JSON.stringify({ scale: [0, 1, 2, 3, 4], content }))
    .digest("hex");
}

export function questionTree(questions: AssessmentQuestion[]) {
  const domains = new Map<
    number,
    {
      id: number;
      name: string;
      description: string | null;
      orderIndex: number;
      categories: Array<{
        id: number;
        domainId: number;
        name: string;
        orderIndex: number;
        criteria: AssessmentQuestion[];
      }>;
    }
  >();
  for (const q of questions.filter((q) => q.isIncluded)) {
    if (!domains.has(q.domainId))
      domains.set(q.domainId, {
        id: q.domainId,
        name: q.domainName,
        description: q.domainDescription,
        orderIndex: q.domainOrder,
        categories: [],
      });
    const domain = domains.get(q.domainId)!;
    let category = domain.categories.find((c) => c.id === q.categoryId);
    if (!category) {
      category = {
        id: q.categoryId,
        domainId: q.domainId,
        name: q.categoryName,
        orderIndex: q.categoryOrder,
        criteria: [],
      };
      domain.categories.push(category);
    }
    category.criteria.push(q);
  }
  return [...domains.values()]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((d) => ({
      ...d,
      categories: d.categories
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((c) => ({
          ...c,
          criteria: c.criteria.sort(
            (a, b) => a.orderIndex - b.orderIndex || a.id - b.id,
          ),
        })),
    }));
}
