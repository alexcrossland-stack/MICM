import { Router, type IRouter } from "express";
import { db, companiesTable, createQuestionSnapshot, loadAssessmentQuestions, questionTree, type QuestionDatabase } from "@workspace/db";
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
import { authorizeQuestions, checkQuestionsVersion, hasQuestionResponses, QuestionError, questionRoute, questionSetPayload } from "../lib/assessmentQuestions";

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
    questionsVersion: cycle.questionsVersion,
    startDate: cycle.startDate instanceof Date ? cycle.startDate.toISOString() : cycle.startDate,
    endDate: cycle.endDate instanceof Date ? cycle.endDate.toISOString() : cycle.endDate,
    assignedUserIds: assignees.map((a: any) => a.userId),
    completedUserIds: assignees.filter((a: any) => a.completedAt != null).map((a: any) => a.userId),
    createdAt: cycle.createdAt instanceof Date ? cycle.createdAt.toISOString() : cycle.createdAt,
    updatedAt: cycle.updatedAt instanceof Date ? cycle.updatedAt.toISOString() : cycle.updatedAt,
  };
}

async function getMissingScoreSections(assessmentId: number, store: QuestionDatabase = db): Promise<MissingScoreSection[]> {
  const assignees = await store.select().from(assessmentAssigneesTable).where(eq(assessmentAssigneesTable.assessmentId, assessmentId));
  const allCriteria = (await loadAssessmentQuestions(store, assessmentId)).filter(q => q.isIncluded);
  const allDomains = questionTree(allCriteria);
  const allCategories = allDomains.flatMap(d => d.categories);
  const allScores = await store.select().from(scoresTable).where(eq(scoresTable.assessmentId, assessmentId));

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
  const users = userIds.length > 0 ? await store.select().from(usersTable).where(inArray(usersTable.id, userIds)) : [];
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
        .map((score: any) => score.assessmentQuestionId),
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
router.post("/assessments", requireAuth, questionRoute(async (req: any, res): Promise<void> => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "company_admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateAssessmentBody.strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (currentUser.role === "company_admin" && currentUser.companyId !== parsed.data.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const cycle = await db.transaction(async tx => {
  const [company] = await tx.select().from(companiesTable).where(eq(companiesTable.id, parsed.data.companyId));
  if (!company?.isActive) throw new QuestionError(400, "Select an active company");
  const [created] = await tx.insert(assessmentCyclesTable).values({
    companyId: parsed.data.companyId,
    name: parsed.data.name,
    description: parsed.data.description,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
    endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
    questionsVersion: 1,
    questionsOrigin: "catalogue_copy",
  }).returning();
  await createQuestionSnapshot(tx, created.id);
  await recordAuditEvent(req, { currentUser, companyId: created.companyId, eventType: "assessment.questions_created", targetType: "assessment", targetId: created.id, metadata: { nextVersion: 1, source: "catalogue_copy" } }, tx);
  return created;
  });

  res.status(201).json(GetAssessmentResponse.parse(await buildAssessmentCycle(cycle)));
}));

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
router.patch("/assessments/:id", requireAuth, questionRoute(async (req: any, res): Promise<void> => {
  const params = UpdateAssessmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "company_admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdateAssessmentBody.strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const outcome = await db.transaction(async tx => {
  const [record] = await tx.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, params.data.id)).for("update");
  const existingCycle = await authorizeQuestions(tx, record, currentUser, true);
  const updates: any = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.status != null) updates.status = parsed.data.status;
  if (parsed.data.startDate !== undefined) updates.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
  if (parsed.data.endDate !== undefined) updates.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
  if (updates.status && updates.status !== existingCycle.status) {
    checkQuestionsVersion(existingCycle, parsed.data.expectedQuestionsVersion);
    if (existingCycle.status === "completed") throw new QuestionError(409, "Completed assessments are locked; create a revised assessment");
    const questions = (await loadAssessmentQuestions(tx, existingCycle.id)).filter(q => q.isIncluded);
    if (updates.status === "active" || updates.status === "completed") {
      if (!questions.length) throw new QuestionError(400, "Include at least one question before activation or completion");
      updates.questionsLockedAt = existingCycle.questionsLockedAt ?? new Date();
    }
    if (updates.status === "draft") {
      if (currentUser.role !== "super_admin" || await hasQuestionResponses(tx, existingCycle.id)) throw new QuestionError(409, "Only an unanswered assessment can return to draft");
      updates.questionsLockedAt = null;
      updates.questionsVersion = existingCycle.questionsVersion + 1;
    }
    if (updates.status === "completed") {
      if (existingCycle.status !== "active") throw new QuestionError(400, "Activate the assessment before completion");
      const missingSections = await getMissingScoreSections(existingCycle.id, tx);
      if (missingSections.length) return { missingSections };
    }
  }
  const [cycle] = await tx.update(assessmentCyclesTable).set(updates).where(eq(assessmentCyclesTable.id, params.data.id)).returning();
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
        previousVersion: existingCycle.questionsVersion,
        nextVersion: cycle.questionsVersion,
      },
    }, tx);
  }
  return { cycle };
  });
  if (outcome.missingSections) { res.status(400).json({ error: "Assessment cannot be completed while required scores are missing.", missingSections: outcome.missingSections }); return; }
  res.json(GetAssessmentResponse.parse(await buildAssessmentCycle(outcome.cycle)));
}));

// POST /assessments/:id/assign
router.post("/assessments/:id/assign", requireAuth, questionRoute(async (req: any, res): Promise<void> => {
  const params = AssignAssessmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "company_admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = AssignAssessmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const cycle = await db.transaction(async tx => {
  const [cycle] = await tx.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, params.data.id)).for("update");
  await authorizeQuestions(tx, cycle, currentUser, true);
  if (cycle.status === "completed") throw new QuestionError(409, "Completed assessment participants cannot be changed");
  if (parsed.data.userIds.length > 0) {
    const assignees = await tx.select().from(usersTable).where(inArray(usersTable.id, parsed.data.userIds));
    const allAssigneesInCompany =
      assignees.length === parsed.data.userIds.length &&
      assignees.every((user: any) => user.isActive && user.companyId === cycle.companyId);
    if (!allAssigneesInCompany) {
      throw new QuestionError(400, "Assignees must be active and belong to the assessment company");
    }
  }

  const existing = await tx.select().from(assessmentAssigneesTable).where(eq(assessmentAssigneesTable.assessmentId, cycle.id));
  const removed = existing.filter(a => !parsed.data.userIds.includes(a.userId));
  const responses = await tx.select().from(scoresTable).where(eq(scoresTable.assessmentId, cycle.id));
  if (removed.some(a => a.completedAt || responses.some(s => s.userId === a.userId))) throw new QuestionError(409, "Participants with saved answers cannot be removed");
  for (const a of removed) await tx.delete(assessmentAssigneesTable).where(eq(assessmentAssigneesTable.id, a.id));
  const added = parsed.data.userIds.filter(userId => !existing.some(a => a.userId === userId));
  if (added.length) await tx.insert(assessmentAssigneesTable).values(added.map(userId => ({ assessmentId: cycle.id, userId })));
  return cycle;
  });

  res.json(GetAssessmentResponse.parse(await buildAssessmentCycle(cycle)));
}));

// GET /assessments/:id/results
router.get("/assessments/:id/results", requireAuth, questionRoute(async (req: any, res): Promise<void> => {
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

  await authorizeQuestions(db, cycle, currentUser);
  const assignees = await db.select().from(assessmentAssigneesTable).where(eq(assessmentAssigneesTable.assessmentId, params.data.id));
  const allDomains = await db.select().from(domainsTable).orderBy(domainsTable.orderIndex);
  const allCriteria = (await loadAssessmentQuestions(db, cycle.id)).filter(q => q.isIncluded);
  const allCategories = questionTree(allCriteria).flatMap(d => d.categories);
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
      const info = criterionToDomain[s.assessmentQuestionId];
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
    criterionNotes: allCriterionNotes.map((note: any) => formatCriterionNote(note, noteAuthorById.get(note.authorUserId), allCriteria.find(q => q.id === note.assessmentQuestionId))),
    questionSet: await questionSetPayload(db, cycle),
  }));
}));

export default router;
