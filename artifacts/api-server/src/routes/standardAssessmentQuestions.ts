import { createHash } from "node:crypto";
import { Router } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  criteriaTable,
  categoriesTable,
  domainsTable,
  type QuestionDatabase,
} from "@workspace/db";
import {
  GetStandardAssessmentQuestionsResponse,
  SaveStandardAssessmentQuestionsBody,
} from "@workspace/api-zod";
import { requireAuth } from "./auth";
import {
  questionActor,
  questionRoute,
  QuestionError,
} from "../lib/assessmentQuestions";
import { recordAuditEvent } from "../lib/audit";

const router = Router();
const schema = SaveStandardAssessmentQuestionsBody.strict().extend({
  questions: SaveStandardAssessmentQuestionsBody.shape.questions.element
    .strict()
    .array()
    .min(1)
    .max(500),
});

async function catalogue(store: QuestionDatabase) {
  const rows = await store
    .select()
    .from(criteriaTable)
    .orderBy(criteriaTable.id);
  const questions = rows.map((q) => ({
    id: q.id,
    categoryId: q.categoryId,
    name: q.name,
    description: q.description ?? null,
    baselineDescription: q.baselineDescription ?? null,
    excellenceDescription: q.excellenceDescription ?? null,
    orderIndex: q.orderIndex,
    isIncluded: q.isIncluded,
  }));
  return {
    version: createHash("sha256")
      .update(JSON.stringify(questions))
      .digest("hex"),
    includedCount: questions.filter((q) => q.isIncluded).length,
    questions,
  };
}

router.get(
  "/standard-assessment-questions",
  requireAuth,
  questionRoute(async (req, res) => {
    await questionActor(req, true);
    res.json(GetStandardAssessmentQuestionsResponse.parse(await catalogue(db)));
  }),
);

router.put(
  "/standard-assessment-questions",
  requireAuth,
  questionRoute(async (req, res) => {
    const actor = await questionActor(req, true);
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      throw new QuestionError(
        400,
        "Check question text, category, order and catalogue version",
      );
    const input = parsed.data;
    if (!input.questions.some((q) => q.isIncluded))
      throw new QuestionError(
        400,
        "Keep at least one standard question included for new assessments",
      );
    const saved = await db.transaction(async (tx) => {
      // Fixed domain rows serialize catalogue editors, including simultaneous additions.
      // Assessment creation reads all included criteria in one statement, never a partial save.
      const domains = await tx
        .select()
        .from(domainsTable)
        .orderBy(domainsTable.id)
        .for("update");
      if (!domains.length)
        throw new QuestionError(
          409,
          "The domain catalogue must be provisioned before adding standard questions",
        );
      const before = await catalogue(tx);
      if (input.expectedVersion !== before.version)
        throw new QuestionError(
          409,
          "The standard questions changed. Reload the latest catalogue before saving.",
          "CATALOGUE_VERSION_CONFLICT",
        );
      const ids = input.questions.flatMap((q) => (q.id == null ? [] : [q.id]));
      if (
        new Set(ids).size !== ids.length ||
        ids.length !== before.questions.length ||
        before.questions.some((q) => !ids.includes(q.id))
      ) {
        throw new QuestionError(
          400,
          "Keep every existing standard question; use Remove instead of deleting its record",
        );
      }
      const categories = await tx.select().from(categoriesTable);
      const changedIds: number[] = [];
      const fields = new Set<string>();
      let addedCount = 0;
      let removedCount = 0;
      let restoredCount = 0;
      for (const q of input.questions) {
        if (
          ![q.id ?? 1, q.categoryId, q.orderIndex].every(
            Number.isSafeInteger,
          ) ||
          !q.name.trim()
        )
          throw new QuestionError(
            400,
            "Question text and whole-number category/order values are required",
          );
        if (
          !categories.some(
            (c) =>
              c.id === q.categoryId && domains.some((d) => d.id === c.domainId),
          )
        )
          throw new QuestionError(400, "Select an existing category");
        const value = {
          categoryId: q.categoryId,
          name: q.name.trim(),
          description: q.description ?? null,
          baselineDescription: q.baselineDescription ?? null,
          excellenceDescription: q.excellenceDescription ?? null,
          orderIndex: q.orderIndex,
          isIncluded: q.isIncluded,
        };
        const old = before.questions.find((row) => row.id === q.id);
        if (old) {
          const changed = (
            Object.keys(value) as Array<keyof typeof value>
          ).filter((key) => old[key] !== value[key]);
          if (!changed.length) continue;
          changed.forEach((key) => fields.add(key));
          if (old.isIncluded && !value.isIncluded) removedCount++;
          if (!old.isIncluded && value.isIncluded) restoredCount++;
          await tx
            .update(criteriaTable)
            .set(value)
            .where(eq(criteriaTable.id, old.id));
          changedIds.push(old.id);
        } else {
          const [created] = await tx
            .insert(criteriaTable)
            .values(value)
            .returning();
          changedIds.push(created.id);
          addedCount++;
        }
      }
      const after = await catalogue(tx);
      if (changedIds.length)
        await recordAuditEvent(
          req,
          {
            currentUser: { ...actor, companyId: null },
            companyId: null,
            eventType: "catalogue.questions_changed",
            targetType: "question_catalogue",
            targetId: "standard",
            metadata: {
              questionIds: changedIds,
              changedFields: [...fields],
              addedCount,
              removedCount,
              restoredCount,
              includedCount: after.includedCount,
              previousVersion: before.version,
              nextVersion: after.version,
            },
          },
          tx,
        );
      return after;
    });
    res.json(GetStandardAssessmentQuestionsResponse.parse(saved));
  }),
);

export default router;
