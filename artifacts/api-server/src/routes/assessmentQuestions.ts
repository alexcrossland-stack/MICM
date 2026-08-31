import { Router } from "express";
import {
  db,
  assessmentCyclesTable,
  assessmentQuestionsTable,
  categoriesTable,
  domainsTable,
  createQuestionSnapshot,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetAssessmentQuestionsResponse,
  SaveAssessmentQuestionsBody,
  CreateAssessmentRevisionBody,
  GetAssessmentResponse,
} from "@workspace/api-zod";
import { requireAuth } from "./auth";
import { recordAuditEvent } from "../lib/audit";
import {
  authorizeQuestions,
  checkQuestionsVersion,
  QuestionError,
  questionActor,
  questionRoute,
  questionSetPayload,
} from "../lib/assessmentQuestions";

const router = Router();
const writeSchema = SaveAssessmentQuestionsBody.strict().extend({
  questions: SaveAssessmentQuestionsBody.shape.questions.element
    .strict()
    .array()
    .max(500),
});
const idOf = (req: any) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new QuestionError(400, "Invalid assessment ID");
  return id;
};

router.get(
  "/assessments/:id/questions",
  requireAuth,
  questionRoute(async (req, res) => {
    const user = await questionActor(req);
    if (
      req.query.includeRemoved != null &&
      !["true", "false"].includes(req.query.includeRemoved)
    )
      throw new QuestionError(400, "Invalid removed-question filter");
    const includeRemoved = req.query.includeRemoved === "true";
    if (includeRemoved && user.role !== "super_admin")
      throw new QuestionError(403, "Forbidden");
    const [record] = await db
      .select()
      .from(assessmentCyclesTable)
      .where(eq(assessmentCyclesTable.id, idOf(req)));
    const cycle = await authorizeQuestions(db, record, user);
    res.json(
      GetAssessmentQuestionsResponse.parse(
        await questionSetPayload(
          db,
          cycle,
          user.role === "super_admin",
          includeRemoved,
        ),
      ),
    );
  }),
);

router.put(
  "/assessments/:id/questions",
  requireAuth,
  questionRoute(async (req, res) => {
    const user = await questionActor(req, true);
    const parsed = writeSchema.safeParse(req.body);
    if (!parsed.success)
      throw new QuestionError(
        400,
        "Check question text, category, order and version",
      );
    const input = parsed.data;
    const result = await db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(assessmentCyclesTable)
        .where(eq(assessmentCyclesTable.id, idOf(req)))
        .for("update");
      const cycle = await authorizeQuestions(tx, record, user, true);
      checkQuestionsVersion(cycle, input.expectedQuestionsVersion);
      const before = await questionSetPayload(tx, cycle, true, true);
      if (!before.canEdit)
        throw new QuestionError(
          409,
          before.lockReason ?? "Questions are locked",
          "QUESTIONS_LOCKED",
        );
      const ids = input.questions.flatMap((q) => (q.id == null ? [] : [q.id]));
      if (
        new Set(ids).size !== ids.length ||
        ids.length !== before.questions.length ||
        before.questions.some((q) => !ids.includes(q.id))
      )
        throw new QuestionError(
          400,
          "Keep every existing question; use Remove from assessment instead of deleting a row",
        );
      const categories = await tx.select().from(categoriesTable);
      const domains = await tx.select().from(domainsTable);
      const edited: number[] = [];
      const changedFields = new Set<string>();
      let removed = 0;
      let restored = 0;
      let added = 0;
      for (const q of input.questions) {
        if (
          ![
            q.categoryId,
            q.orderIndex,
            q.id ?? 1,
            input.expectedQuestionsVersion,
          ].every(Number.isSafeInteger) ||
          !q.name.trim()
        )
          throw new QuestionError(
            400,
            "Question text and whole-number category/order values are required",
          );
        const category = categories.find((c) => c.id === q.categoryId);
        const domain = domains.find((d) => d.id === category?.domainId);
        if (!category || !domain)
          throw new QuestionError(400, "Select an existing category");
        const existing = before.questions.find((row) => row.id === q.id);
        const value = {
          categoryId: category.id,
          domainId: domain.id,
          domainName:
            existing?.domainId === domain.id
              ? existing.domainName
              : domain.name,
          domainDescription:
            existing?.domainId === domain.id
              ? existing.domainDescription
              : domain.description,
          domainOrder:
            existing?.domainId === domain.id
              ? existing.domainOrder
              : domain.orderIndex,
          categoryName:
            existing?.categoryId === category.id
              ? existing.categoryName
              : category.name,
          categoryOrder:
            existing?.categoryId === category.id
              ? existing.categoryOrder
              : category.orderIndex,
          name: q.name.trim(),
          description: q.description ?? null,
          baselineDescription: q.baselineDescription ?? null,
          excellenceDescription: q.excellenceDescription ?? null,
          orderIndex: q.orderIndex,
          isIncluded: q.isIncluded,
        };
        if (existing) {
          if (
            Object.entries(value).some(
              ([key, value]) =>
                existing[key as keyof typeof existing] !== value,
            )
          ) {
            for (const [key, next] of Object.entries(value))
              if (existing[key as keyof typeof existing] !== next)
                changedFields.add(key);
            if (existing.isIncluded && !value.isIncluded) removed++;
            if (!existing.isIncluded && value.isIncluded) restored++;
            await tx
              .update(assessmentQuestionsTable)
              .set(value)
              .where(eq(assessmentQuestionsTable.id, existing.id));
            edited.push(existing.id);
          }
        } else {
          await tx
            .insert(assessmentQuestionsTable)
            .values({
              ...value,
              assessmentId: cycle.id,
              sourceCriterionId: null,
            });
          added++;
        }
      }
      if (edited.length || added) {
        const [updated] = await tx
          .update(assessmentCyclesTable)
          .set({
            questionsVersion: cycle.questionsVersion + 1,
            questionsOrigin: "customised",
          })
          .where(eq(assessmentCyclesTable.id, cycle.id))
          .returning();
        await recordAuditEvent(
          req,
          {
            currentUser: user,
            companyId: cycle.companyId,
            eventType: "assessment.questions_changed",
            targetType: "assessment",
            targetId: cycle.id,
            metadata: {
              previousVersion: before.version,
              nextVersion: updated.questionsVersion,
              questionIds: edited,
              changedFields: [...changedFields],
              addedCount: added,
              removedCount: removed,
              restoredCount: restored,
              includedCount: input.questions.filter((q) => q.isIncluded).length,
            },
          },
          tx,
        );
        return questionSetPayload(tx, updated, true, true);
      }
      return before;
    });
    res.json(GetAssessmentQuestionsResponse.parse(result));
  }),
);

router.post(
  "/assessments/:id/revisions",
  requireAuth,
  questionRoute(async (req, res) => {
    const user = await questionActor(req, true);
    const parsed = CreateAssessmentRevisionBody.strict().safeParse(req.body);
    if (!parsed.success || !parsed.data.name.trim())
      throw new QuestionError(
        400,
        "A revision name and current question version are required",
      );
    const result = await db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(assessmentCyclesTable)
        .where(eq(assessmentCyclesTable.id, idOf(req)))
        .for("update");
      const source = await authorizeQuestions(tx, record, user, true);
      checkQuestionsVersion(source, parsed.data.expectedQuestionsVersion);
      const questions = await tx
        .select()
        .from(assessmentQuestionsTable)
        .where(eq(assessmentQuestionsTable.assessmentId, source.id));
      const [cycle] = await tx
        .insert(assessmentCyclesTable)
        .values({
          companyId: source.companyId,
          name: parsed.data.name.trim(),
          description: source.description,
          questionsOrigin: source.questionsOrigin,
          questionsVersion: 1,
        })
        .returning();
      await createQuestionSnapshot(tx, cycle.id, questions);
      await recordAuditEvent(
        req,
        {
          currentUser: user,
          companyId: cycle.companyId,
          eventType: "assessment.revision_created",
          targetType: "assessment",
          targetId: cycle.id,
          metadata: {
            sourceAssessmentId: source.id,
            sourceVersion: source.questionsVersion,
          },
        },
        tx,
      );
      return {
        ...cycle,
        assignedUserIds: [],
        completedUserIds: [],
        createdAt: cycle.createdAt.toISOString(),
        updatedAt: cycle.updatedAt.toISOString(),
        startDate: null,
        endDate: null,
      };
    });
    res.status(201).json(GetAssessmentResponse.parse(result));
  }),
);

export default router;
