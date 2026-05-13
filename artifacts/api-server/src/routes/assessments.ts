import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, assessmentCyclesTable, assessmentAssigneesTable, scoresTable, criteriaTable, categoriesTable, domainsTable, criterionNotesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  ListAssessmentsResponse,
  CreateAssessmentBody,
  GetAssessmentParams,
  GetAssessmentResponse,
  UpdateAssessmentParams,
  UpdateAssessmentBody,
  AssignAssessmentParams,
  AssignAssessmentBody,
  GetAssessmentResultsParams,
  GetAssessmentResultsResponse,
  ListAssessmentsQueryParams,
} from "@workspace/api-zod";
import { formatCriterionNote } from "../lib/criterionNotes";
import { requireAuth } from "./auth";
import { recordAuditEvent } from "../lib/audit";

const router: IRouter = Router();

type MissingScoreSection = {
  userId: number | null;
  userName: string;
  domainId: number | null;
  domainName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  missingCriteriaCount: number;
  missingCriteria: string[];
};

function formatUserName(user: any) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || `User ${user.id}`;
}

async function buildAssessmentCycle(cycle: any) {
  const assignees = await db.select().from(assessmentAssigneesTable).where(eq(assessmentAssigneesTable.assessmentId, cycle.id));
  return {
    id: cycle.id,
    companyId: cycle.companyId,
    name: cycle.name,
    description: cycle.description,
    status: cycle.status,
    startDate: cycle.startDate instanceof Date ? cycle.startDate.toISOString() : cycle.startDate,
    endDate: cycle.endDate instanceof Date ? cycle.endDate.toISOString() : cycle.endDate,
    assignedUserIds: assignees.map((a: any) => a.userId),
    completedUserIds: assignees.filter((a: any) => a.completedAt != null).map((a: any) => a.userId),
    createdAt: cycle.createdAt instanceof Date ? cycle.createdAt.toISOString() : cycle.createdAt,
    updatedAt: cycle.updatedAt instanceof Date ? cycle.updatedAt.toISOString() : cycle.updatedAt,
  };
}

async function getMissingScoreSections(assessmentId: number): Promise<MissingScoreSection[]> {
  const assignees = await db.select().from(assessmentAssigneesTable).where(eq(assessmentAssigneesTable.assessmentId, assessmentId));
  const allDomains = await db.select().from(domainsTable).orderBy(domainsTable.orderIndex);
  const allCategories = await db.select().from(categoriesTable);
  const allCriteria = await db.select().from(criteriaTable);
  const allScores = await db.select().from(scoresTable).where(eq(scoresTable.assessmentId, assessmentId));

  if (assignees.length === 0) {
    return [{
      userId: null,
      userName: "No assigned users",
      domainId: null,
      domainName: null,
      categoryId: null,
      categoryName: null,
      missingCriteriaCount: allCriteria.length,
      missingCriteria: allCriteria.map((criterion: any) => criterion.name),
    }];
  }

  const userIds = [...new Set(assignees.map((assignee: any) => assignee.userId))];
  const users = userIds.length > 0 ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : [];
  const userById = new Map(users.map((user: any) => [user.id, user]));
  const domainById = new Map(allDomains.map((domain: any) => [domain.id, domain]));
  const categoriesById = new Map(allCategories.map((category: any) => [category.id, category]));
  const criteriaByCategoryId = new Map<number, any[]>();

  for (const criterion of allCriteria) {
    const group = criteriaByCategoryId.get(criterion.categoryId) ?? [];
    group.push(criterion);
    criteriaByCategoryId.set(criterion.categoryId, group);
  }

  const missingSections: MissingScoreSection[] = [];
  for (const assignee of assignees) {
    const user = userById.get(assignee.userId);
    const scoredCriteria = new Set(
      allScores
        .filter((score: any) => score.userId === assignee.userId)
        .map((score: any) => score.criterionId),
    );

    for (const category of allCategories) {
      const categoryCriteria = criteriaByCategoryId.get(category.id) ?? [];
      const missingCriteria = categoryCriteria.filter((criterion: any) => !scoredCriteria.has(criterion.id));
      if (missingCriteria.length === 0) continue;

      const domain = domainById.get(category.domainId);
      missingSections.push({
        userId: assignee.userId,
        userName: user ? formatUserName(user) : `User ${assignee.userId}`,
        domainId: domain?.id ?? null,
        domainName: domain?.name ?? null,
        categoryId: category.id,
        categoryName: category.name,
        missingCriteriaCount: missingCriteria.length,
        missingCriteria: missingCriteria.map((criterion: any) => criterion.name),
      });
    }
  }

  return missingSections;
}

// GET /assessments
router.get("/assessments", requireAuth, async (req: any, res): Promise<void> => {
  const queryParams = ListAssessmentsQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  let cycles;
  if (currentUser.role === "super_admin") {
    cycles = queryParams.data.companyId
      ? await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.companyId, queryParams.data.companyId))
      : await db.select().from(assessmentCyclesTable);
  } else {
    if (!currentUser.companyId) { res.json([]); return; }
    cycles = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.companyId, currentUser.companyId));
  }

  const result = await Promise.all(cycles.map(buildAssessmentCycle));
  res.json(ListAssessmentsResponse.parse(result));
});

// POST /assessments
router.post("/assessments", requireAuth, async (req: any, res): Promise<void> => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "company_admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateAssessmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (currentUser.role === "company_admin" && currentUser.companyId !== parsed.data.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [cycle] = await db.insert(assessmentCyclesTable).values({
    companyId: parsed.data.companyId,
    name: parsed.data.name,
    description: parsed.data.description,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
    endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
  }).returning();

  res.status(201).json(GetAssessmentResponse.parse(await buildAssessmentCycle(cycle)));
});

// GET /assessments/:id
router.get("/assessments/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = GetAssessmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [cycle] = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, params.data.id));
  if (!cycle) { res.status(404).json({ error: "Assessment not found" }); return; }

  if (currentUser.role !== "super_admin" && currentUser.companyId !== cycle.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(GetAssessmentResponse.parse(await buildAssessmentCycle(cycle)));
});

// PATCH /assessments/:id
router.patch("/assessments/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = UpdateAssessmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "company_admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdateAssessmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existingCycle] = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, params.data.id));
  if (!existingCycle) { res.status(404).json({ error: "Assessment not found" }); return; }
  if (currentUser.role === "company_admin" && currentUser.companyId !== existingCycle.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (parsed.data.status === "completed") {
    const missingSections = await getMissingScoreSections(params.data.id);
    if (missingSections.length > 0) {
      res.status(400).json({
        error: "Assessment cannot be completed while required scores are missing.",
        missingSections,
      });
      return;
    }
  }

  const updates: any = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.status != null) updates.status = parsed.data.status;
  if (parsed.data.startDate !== undefined) updates.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
  if (parsed.data.endDate !== undefined) updates.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;

  const [cycle] = await db.update(assessmentCyclesTable).set(updates).where(eq(assessmentCyclesTable.id, params.data.id)).returning();
  if (!cycle) { res.status(404).json({ error: "Assessment not found" }); return; }
  if (updates.status != null && existingCycle.status !== cycle.status) {
    await recordAuditEvent(req, {
      currentUser,
      eventType: "assessment.status_changed",
      companyId: cycle.companyId,
      targetType: "assessment",
      targetId: cycle.id,
      metadata: {
        previousStatus: existingCycle.status,
        nextStatus: cycle.status,
      },
    });
  }
  res.json(GetAssessmentResponse.parse(await buildAssessmentCycle(cycle)));
});

// POST /assessments/:id/assign
router.post("/assessments/:id/assign", requireAuth, async (req: any, res): Promise<void> => {
  const params = AssignAssessmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "company_admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = AssignAssessmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [cycle] = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, params.data.id));
  if (!cycle) { res.status(404).json({ error: "Assessment not found" }); return; }
  if (currentUser.role === "company_admin" && currentUser.companyId !== cycle.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (parsed.data.userIds.length > 0) {
    const assignees = await db.select().from(usersTable).where(inArray(usersTable.id, parsed.data.userIds));
    const allAssigneesInCompany =
      assignees.length === parsed.data.userIds.length &&
      assignees.every((user: any) => user.companyId === cycle.companyId);
    if (!allAssigneesInCompany) {
      res.status(400).json({ error: "Assignees must belong to the assessment company" });
      return;
    }
  }

  // Remove all existing assignees and re-add
  await db.delete(assessmentAssigneesTable).where(eq(assessmentAssigneesTable.assessmentId, params.data.id));
  if (parsed.data.userIds.length > 0) {
    await db.insert(assessmentAssigneesTable).values(
      parsed.data.userIds.map((userId: number) => ({ assessmentId: params.data.id, userId }))
    );
  }

  res.json(GetAssessmentResponse.parse(await buildAssessmentCycle(cycle)));
});

// GET /assessments/:id/results
router.get("/assessments/:id/results", requireAuth, async (req: any, res): Promise<void> => {
  const params = GetAssessmentResultsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [cycle] = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, params.data.id));
  if (!cycle) { res.status(404).json({ error: "Assessment not found" }); return; }
  if (currentUser.role !== "super_admin" && currentUser.companyId !== cycle.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const assignees = await db.select().from(assessmentAssigneesTable).where(eq(assessmentAssigneesTable.assessmentId, params.data.id));
  const allDomains = await db.select().from(domainsTable).orderBy(domainsTable.orderIndex);
  const allCategories = await db.select().from(categoriesTable);
  const allCriteria = await db.select().from(criteriaTable);
  const allScores = await db.select().from(scoresTable).where(eq(scoresTable.assessmentId, params.data.id));
  const allCriterionNotes = await db.select().from(criterionNotesTable).where(eq(criterionNotesTable.assessmentId, params.data.id));

  const criterionToDomain: Record<number, { domainId: number; domainName: string }> = {};
  const categoryMap: Record<number, number> = {};
  for (const cat of allCategories) categoryMap[cat.id] = cat.domainId;
  for (const crit of allCriteria) {
    const domainId = categoryMap[crit.categoryId];
    const domain = allDomains.find(d => d.id === domainId);
    if (domain) criterionToDomain[crit.id] = { domainId: domain.id, domainName: domain.name };
  }

  const userIds = [...new Set(assignees.map((a: any) => a.userId))];
  const usersInAssessment = userIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const noteAuthorIds = [...new Set(allCriterionNotes.map((note: any) => note.authorUserId))];
  const noteAuthors = noteAuthorIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, noteAuthorIds))
    : [];
  const noteAuthorById = new Map(noteAuthors.map((author: any) => [author.id, author]));

  const userScores = usersInAssessment.map((u: any) => {
    const userScoreList = allScores.filter(s => s.userId === u.id);
    const domainScoreMap: Record<number, number[]> = {};
    for (const s of userScoreList) {
      const info = criterionToDomain[s.criterionId];
      if (info) {
        if (!domainScoreMap[info.domainId]) domainScoreMap[info.domainId] = [];
        domainScoreMap[info.domainId].push(s.score);
      }
    }
    const domainScores = allDomains.map(d => {
      const scores = domainScoreMap[d.id];
      const avg = scores && scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null;
      return {
        domainId: d.id,
        domainName: d.name,
        score: avg != null ? Math.round(avg * 100) / 100 : null,
        band: avg != null ? (avg <= 1 ? "Critical" : avg <= 2 ? "Weak" : avg <= 3 ? "Developing" : "Strong") : null,
      };
    });
    const validDomainScores = domainScores.filter(d => d.score != null).map(d => d.score as number);
    const overallScore = validDomainScores.length > 0 ? Math.round(validDomainScores.reduce((a, b) => a + b, 0) / validDomainScores.length * 100) / 100 : null;
    const assignee = assignees.find((a: any) => a.userId === u.id);
    return {
      userId: u.id,
      userName: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
      domainScores,
      overallScore,
      completedAt: assignee?.completedAt instanceof Date ? assignee.completedAt.toISOString() : assignee?.completedAt ?? null,
    };
  });

  // Aggregate across all users
  const aggregateMap: Record<number, number[]> = {};
  for (const us of userScores) {
    for (const ds of us.domainScores) {
      if (ds.score != null) {
        if (!aggregateMap[ds.domainId]) aggregateMap[ds.domainId] = [];
        aggregateMap[ds.domainId].push(ds.score);
      }
    }
  }
  const aggregateScores = allDomains.map(d => {
    const scores = aggregateMap[d.id];
    const avg = scores && scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null;
    return {
      domainId: d.id,
      domainName: d.name,
      score: avg != null ? Math.round(avg * 100) / 100 : null,
      band: avg != null ? (avg <= 1 ? "Critical" : avg <= 2 ? "Weak" : avg <= 3 ? "Developing" : "Strong") : null,
    };
  });

  res.json(GetAssessmentResultsResponse.parse({
    assessmentId: cycle.id,
    assessmentName: cycle.name,
    userScores,
    aggregateScores,
    criterionNotes: allCriterionNotes.map((note: any) => formatCriterionNote(note, noteAuthorById.get(note.authorUserId))),
  }));
});

export default router;
