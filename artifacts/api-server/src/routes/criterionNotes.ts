import { Router, type IRouter } from "express";
import { db, loadAssessmentQuestions } from "@workspace/db";
import { usersTable, assessmentCyclesTable, assessmentAssigneesTable, criteriaTable, criterionNotesTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  CreateCriterionNoteBody,
  ListCriterionNotesQueryParams,
  ListCriterionNotesResponse,
} from "@workspace/api-zod";
import { formatCriterionNote } from "../lib/criterionNotes";
import { requireAuth } from "./auth";
import { recordAuditEvent } from "../lib/audit";
import { authorizeQuestions, checkQuestionsVersion, QuestionError, questionRoute, resolveQuestion } from "../lib/assessmentQuestions";

const router: IRouter = Router();

async function getCurrentUser(req: any) {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  return currentUser;
}

async function getAssessmentForNotesAccess(currentUser: any, assessmentId: number) {
  const [cycle] = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, assessmentId));
  if (!cycle) return { status: 404, error: "Assessment not found" } as const;

  if (currentUser.role === "super_admin") return { cycle } as const;
  if (currentUser.companyId !== cycle.companyId) return { status: 403, error: "Forbidden" } as const;
  if (currentUser.role === "company_admin") return { cycle } as const;

  const [assignee] = await db.select().from(assessmentAssigneesTable).where(
    and(eq(assessmentAssigneesTable.assessmentId, assessmentId), eq(assessmentAssigneesTable.userId, currentUser.id)),
  );
  if (!assignee) return { status: 403, error: "Forbidden" } as const;

  return { cycle } as const;
}

async function getFormattedCriterionNotes(assessmentId: number, criterionId?: number | null, questionId?: number) {
  const questions = await loadAssessmentQuestions(db, assessmentId);
  const rows = criterionId
    ? await db.select().from(criterionNotesTable).where(
        and(eq(criterionNotesTable.assessmentId, assessmentId), eq(criterionNotesTable.criterionId, criterionId)),
      )
    : await db.select().from(criterionNotesTable).where(eq(criterionNotesTable.assessmentId, assessmentId));
  const notes = questionId ? rows.filter(note => note.assessmentQuestionId === questionId) : rows;
  const authorIds = [...new Set(notes.map((note: any) => note.authorUserId))];
  const authors = authorIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, authorIds))
    : [];
  const authorById = new Map(authors.map((author: any) => [author.id, author]));

  return notes.map((note: any) => formatCriterionNote(note, authorById.get(note.authorUserId), questions.find(q => q.id === note.assessmentQuestionId)));
}

// GET /assessment-criterion-notes
router.get("/assessment-criterion-notes", requireAuth, async (req: any, res): Promise<void> => {
  const query = ListCriterionNotesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const currentUser = await getCurrentUser(req);
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const access = await getAssessmentForNotesAccess(currentUser, query.data.assessmentId);
  if ("error" in access) { res.status(access.status ?? 403).json({ error: access.error }); return; }

  const result = await getFormattedCriterionNotes(query.data.assessmentId, query.data.criterionId, query.data.assessmentQuestionId);
  res.json(ListCriterionNotesResponse.parse(result));
});

// POST /assessment-criterion-notes
router.post("/assessment-criterion-notes", requireAuth, questionRoute(async (req: any, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateCriterionNoteBody.strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const note = parsed.data.note.trim();
  if (note.length === 0) { res.status(400).json({ error: "Note is required" }); return; }

  const result = await db.transaction(async tx => {
  const [record] = await tx.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, parsed.data.assessmentId)).for("update");
  const cycle = await authorizeQuestions(tx, record, currentUser, true);
  checkQuestionsVersion(cycle, parsed.data.questionsVersion);
  const question = resolveQuestion(await loadAssessmentQuestions(tx, cycle.id), parsed.data);
  const [saved] = await tx.insert(criterionNotesTable).values({
    companyId: cycle.companyId,
    assessmentId: parsed.data.assessmentId,
    criterionId: question.sourceCriterionId,
    assessmentQuestionId: question.id,
    authorUserId: currentUser.id,
    note,
  }).returning();

  await recordAuditEvent(req, {
    currentUser,
    eventType: "criterion_note.created",
    companyId: cycle.companyId,
    targetType: "criterion_note",
    targetId: saved.id,
    metadata: {
      assessmentId: saved.assessmentId,
      criterionId: saved.criterionId,
      authorUserId: saved.authorUserId,
    },
  }, tx);
  if (!cycle.questionsLockedAt) await tx.update(assessmentCyclesTable).set({ questionsLockedAt: new Date() }).where(eq(assessmentCyclesTable.id, cycle.id));
  return formatCriterionNote(saved, currentUser, question);
  });
  res.status(201).json(ListCriterionNotesResponse.parse([result])[0]);
}));

export default router;
