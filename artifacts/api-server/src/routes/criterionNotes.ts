import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, assessmentCyclesTable, assessmentAssigneesTable, criteriaTable, criterionNotesTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  CreateCriterionNoteBody,
  ListCriterionNotesQueryParams,
  ListCriterionNotesResponse,
} from "@workspace/api-zod";
import { formatCriterionNote } from "../lib/criterionNotes";
import { requireAuth } from "./auth";

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

async function getFormattedCriterionNotes(assessmentId: number, criterionId?: number | null) {
  const notes = criterionId
    ? await db.select().from(criterionNotesTable).where(
        and(eq(criterionNotesTable.assessmentId, assessmentId), eq(criterionNotesTable.criterionId, criterionId)),
      )
    : await db.select().from(criterionNotesTable).where(eq(criterionNotesTable.assessmentId, assessmentId));
  const authorIds = [...new Set(notes.map((note: any) => note.authorUserId))];
  const authors = authorIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, authorIds))
    : [];
  const authorById = new Map(authors.map((author: any) => [author.id, author]));

  return notes.map((note: any) => formatCriterionNote(note, authorById.get(note.authorUserId)));
}

// GET /assessment-criterion-notes
router.get("/assessment-criterion-notes", requireAuth, async (req: any, res): Promise<void> => {
  const query = ListCriterionNotesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const currentUser = await getCurrentUser(req);
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const access = await getAssessmentForNotesAccess(currentUser, query.data.assessmentId);
  if ("error" in access) { res.status(access.status ?? 403).json({ error: access.error }); return; }

  const result = await getFormattedCriterionNotes(query.data.assessmentId, query.data.criterionId);
  res.json(ListCriterionNotesResponse.parse(result));
});

// POST /assessment-criterion-notes
router.post("/assessment-criterion-notes", requireAuth, async (req: any, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateCriterionNoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const note = parsed.data.note.trim();
  if (note.length === 0) { res.status(400).json({ error: "Note is required" }); return; }

  const access = await getAssessmentForNotesAccess(currentUser, parsed.data.assessmentId);
  if ("error" in access) { res.status(access.status ?? 403).json({ error: access.error }); return; }

  const [criterion] = await db.select().from(criteriaTable).where(eq(criteriaTable.id, parsed.data.criterionId));
  if (!criterion) { res.status(404).json({ error: "Criterion not found" }); return; }

  const [saved] = await db.insert(criterionNotesTable).values({
    companyId: access.cycle.companyId,
    assessmentId: parsed.data.assessmentId,
    criterionId: parsed.data.criterionId,
    authorUserId: currentUser.id,
    note,
  }).returning();

  res.status(201).json(ListCriterionNotesResponse.parse([formatCriterionNote(saved, currentUser)])[0]);
});

export default router;
