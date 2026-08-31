import {
  db,
  assessmentCyclesTable,
  assessmentAssigneesTable,
  scoresTable,
  criterionNotesTable,
  companiesTable,
  usersTable,
  loadAssessmentQuestions,
  questionSetSignature,
  type AssessmentQuestion,
  type QuestionDatabase,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

export class QuestionError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "INVALID_QUESTIONS",
  ) {
    super(message);
  }
}

export async function questionScoreContext(assessmentId: number) {
  const questions = (await loadAssessmentQuestions(db, assessmentId)).filter(
    (q) => q.isIncluded,
  );
  return {
    questions,
    signature: questionSetSignature(questions),
    domainByQuestionId: Object.fromEntries(
      questions.map((q) => [q.id, q.domainId]),
    ) as Record<number, number>,
  };
}

export async function questionActor(req: any, adminOnly = false) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!user?.isActive) throw new QuestionError(401, "Unauthorized");
  if (adminOnly && user.role !== "super_admin")
    throw new QuestionError(403, "Super Admin access is required");
  return user;
}

export async function authorizeQuestions(
  store: QuestionDatabase,
  cycle: typeof assessmentCyclesTable.$inferSelect | undefined,
  user: typeof usersTable.$inferSelect,
  write = false,
) {
  if (!cycle) throw new QuestionError(404, "Assessment not found");
  if (user.role !== "super_admin" && user.companyId !== cycle.companyId)
    throw new QuestionError(403, "Forbidden");
  if (user.role === "company_user") {
    const [assignment] = await store
      .select()
      .from(assessmentAssigneesTable)
      .where(
        and(
          eq(assessmentAssigneesTable.assessmentId, cycle.id),
          eq(assessmentAssigneesTable.userId, user.id),
        ),
      );
    if (!assignment) throw new QuestionError(403, "Forbidden");
  }
  if (write) {
    const [company] = await store
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, cycle.companyId));
    if (!company?.isActive)
      throw new QuestionError(
        409,
        "Archived company assessments are read-only",
        "COMPANY_ARCHIVED",
      );
  }
  return cycle;
}

export async function hasQuestionResponses(
  store: QuestionDatabase,
  assessmentId: number,
) {
  const scores = await store
    .select()
    .from(scoresTable)
    .where(eq(scoresTable.assessmentId, assessmentId));
  const notes = await store
    .select()
    .from(criterionNotesTable)
    .where(eq(criterionNotesTable.assessmentId, assessmentId));
  const assignees = await store
    .select()
    .from(assessmentAssigneesTable)
    .where(eq(assessmentAssigneesTable.assessmentId, assessmentId));
  return (
    scores.length > 0 ||
    notes.length > 0 ||
    assignees.some((a) => a.completedAt != null)
  );
}

export function checkQuestionsVersion(
  cycle: typeof assessmentCyclesTable.$inferSelect,
  version?: number,
) {
  if (
    version == null &&
    cycle.questionsVersion === 1 &&
    cycle.questionsOrigin !== "customised"
  )
    return;
  if (version !== cycle.questionsVersion)
    throw new QuestionError(
      409,
      "The assessment questions changed. Reload before saving.",
      "QUESTION_VERSION_CONFLICT",
    );
}

export function resolveQuestion(
  questions: AssessmentQuestion[],
  input: { assessmentQuestionId?: number; criterionId?: number },
) {
  const q =
    input.assessmentQuestionId != null
      ? questions.find((q) => q.id === input.assessmentQuestionId)
      : questions.find(
          (q) =>
            q.sourceCriterionId === input.criterionId &&
            input.criterionId != null,
        );
  if (
    !q?.isIncluded ||
    (input.criterionId != null && q.sourceCriterionId !== input.criterionId)
  )
    throw new QuestionError(
      400,
      "Select an included question from this assessment",
    );
  return q;
}

export async function questionSetPayload(
  store: QuestionDatabase,
  cycle: typeof assessmentCyclesTable.$inferSelect,
  isSuperAdmin = false,
  includeRemoved = false,
) {
  const questions = await loadAssessmentQuestions(store, cycle.id);
  const hasResponses = await hasQuestionResponses(store, cycle.id);
  const [company] = await store
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, cycle.companyId));
  const lockReason = !company?.isActive
    ? "Company is archived"
    : cycle.status !== "draft"
      ? "Questions are locked after activation"
      : hasResponses || cycle.questionsLockedAt
        ? "Questions have responses and cannot be edited"
        : null;
  return {
    assessmentId: cycle.id,
    companyId: cycle.companyId,
    version: cycle.questionsVersion,
    signature: questionSetSignature(questions),
    customised: cycle.questionsOrigin === "customised",
    canEdit: isSuperAdmin && !lockReason,
    lockReason,
    canReturnToDraft:
      isSuperAdmin &&
      !!company?.isActive &&
      cycle.status === "active" &&
      !hasResponses,
    includedCount: questions.filter((q) => q.isIncluded).length,
    questions: questions
      .filter((q) => includeRemoved || q.isIncluded)
      .sort(
        (a, b) =>
          a.domainOrder - b.domainOrder ||
          a.categoryOrder - b.categoryOrder ||
          a.orderIndex - b.orderIndex ||
          a.id - b.id,
      ),
  };
}

export function questionRoute(handler: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof QuestionError) {
        res
          .status(error.status)
          .json({ error: error.message, code: error.code });
        return;
      }
      // Driver errors can include SQL parameters containing company question text.
      req.log?.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Assessment operation failed");
      res.status(500).json({ error: "The assessment operation could not be completed. Try again or contact support." });
    }
  };
}
