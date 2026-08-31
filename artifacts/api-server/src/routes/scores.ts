import { Router, type IRouter } from "express";
import { db, loadAssessmentQuestions, questionSetSignature } from "@workspace/db";
import { usersTable, scoresTable, assessmentCyclesTable, criteriaTable, categoriesTable, domainsTable, assessmentAssigneesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  ListScoresResponse,
  SubmitScoresBody,
  SubmitScoresResponse,
  GetRadarDataResponse,
  GetProgressOverTimeResponse,
  ListScoresQueryParams,
  GetRadarDataQueryParams,
  GetProgressOverTimeQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "./auth";
import { authorizeQuestions, checkQuestionsVersion, QuestionError, questionScoreContext, questionRoute, resolveQuestion } from "../lib/assessmentQuestions";

const router: IRouter = Router();

function formatScore(s: any) {
  return {
    id: s.id,
    assessmentId: s.assessmentId,
    userId: s.userId,
    criterionId: s.criterionId,
    assessmentQuestionId: s.assessmentQuestionId,
    score: s.score,
    notes: s.notes,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
  };
}

// GET /scores
router.get("/scores", requireAuth, async (req: any, res): Promise<void> => {
  const queryParams = ListScoresQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const assessmentId = queryParams.data.assessmentId;
  const userId = queryParams.data.userId;

  // Verify access
  const [cycle] = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, assessmentId));
  if (!cycle) { res.status(404).json({ error: "Assessment not found" }); return; }
  if (currentUser.role !== "super_admin" && currentUser.companyId !== cycle.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let scores;
  if (userId) {
    scores = await db.select().from(scoresTable).where(and(eq(scoresTable.assessmentId, assessmentId), eq(scoresTable.userId, userId)));
  } else {
    scores = await db.select().from(scoresTable).where(eq(scoresTable.assessmentId, assessmentId));
  }

  res.json(ListScoresResponse.parse(scores.map(formatScore)));
});

// POST /scores
router.post("/scores", requireAuth, questionRoute(async (req: any, res): Promise<void> => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = SubmitScoresBody.strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { assessmentId, scores } = parsed.data;

  const results = await db.transaction(async tx => {
  const [record] = await tx.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, assessmentId)).for("update");
  const cycle = await authorizeQuestions(tx, record, currentUser, true);
  if (cycle.status !== "active") throw new QuestionError(400, "Assessment is not active");
  checkQuestionsVersion(cycle, parsed.data.questionsVersion);
  const questions = await loadAssessmentQuestions(tx, assessmentId);
  const resolved = scores.map(input => ({ input, question: resolveQuestion(questions, input) }));
  if (new Set(resolved.map(item => item.question.id)).size !== resolved.length || scores.some(s => !Number.isInteger(s.score))) throw new QuestionError(400, "Submit one whole-number score from 0 to 4 per included question");
  let [assignee] = await tx.select().from(assessmentAssigneesTable).where(
    and(eq(assessmentAssigneesTable.assessmentId, assessmentId), eq(assessmentAssigneesTable.userId, currentUser.id)),
  );
  if (!assignee) {
    if (currentUser.role !== "super_admin") {
      throw new QuestionError(403, "Forbidden");
    }
    [assignee] = await tx.insert(assessmentAssigneesTable).values({
      assessmentId,
      userId: currentUser.id,
    }).returning();
  }

  const results = [];
  for (const { input: scoreInput, question } of resolved) {
    const [existing] = await tx.select().from(scoresTable).where(and(eq(scoresTable.assessmentId, assessmentId), eq(scoresTable.userId, currentUser.id), eq(scoresTable.assessmentQuestionId, question.id)));
    const value = {
      assessmentId,
      userId: currentUser.id,
      criterionId: question.sourceCriterionId,
      assessmentQuestionId: question.id,
      score: scoreInput.score,
      notes: scoreInput.notes,
    };
    const [saved] = existing
      ? await tx.update(scoresTable).set(value).where(eq(scoresTable.id, existing.id)).returning()
      : await tx.insert(scoresTable).values(value).returning();
    results.push(saved);
  }

  // Mark assignee as completed if all criteria scored
  const allCriteria = questions.filter(q => q.isIncluded);
  const allScores = await tx.select().from(scoresTable).where(
    and(eq(scoresTable.assessmentId, assessmentId), eq(scoresTable.userId, currentUser.id))
  );
  if (allCriteria.length > 0 && allCriteria.every(q => allScores.some(s => s.assessmentQuestionId === q.id))) {
    await tx.update(assessmentAssigneesTable)
      .set({ completedAt: new Date() })
      .where(and(
        eq(assessmentAssigneesTable.assessmentId, assessmentId),
        eq(assessmentAssigneesTable.userId, currentUser.id)
      ));
  }
  return results;
  });
  res.json(SubmitScoresResponse.parse(results.map(formatScore)));
}));

// GET /scores/radar
router.get("/scores/radar", requireAuth, async (req: any, res): Promise<void> => {
  const queryParams = GetRadarDataQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const assessmentId = queryParams.data.assessmentId;
  const allDomains = await db.select().from(domainsTable).orderBy(domainsTable.orderIndex);

  const COLORS = ["#7c9cf5", "#f5a97c", "#9cf5a4", "#f5e97c", "#c47cf5", "#7cf5e5"];

  const series: any[] = [];

  // Multi-user overlay for current assessment
  const requestedUserIds = queryParams.data.userIds ? queryParams.data.userIds.split(",").map(Number).filter(Boolean) : null;
  const compareAssessmentIds = queryParams.data.compareAssessmentIds ? queryParams.data.compareAssessmentIds.split(",").map(Number).filter(Boolean) : null;

  // Helper: check a cycle is accessible to this user (super_admin bypasses)
  const canAccessCycle = (cycle: { companyId: number }) =>
    currentUser.role === "super_admin" || currentUser.companyId === cycle.companyId;

  if (compareAssessmentIds && compareAssessmentIds.length > 0) {
    // Multi-cycle comparison — overlay each requested cycle as its own series
    const allCycleIds = [assessmentId, ...compareAssessmentIds];
    for (const [idx, cycleId] of allCycleIds.entries()) {
      const [cycle] = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, cycleId));
      if (!cycle || !canAccessCycle(cycle)) continue;
      const scoreContext = await questionScoreContext(cycleId);
      const scores = await db.select().from(scoresTable).where(eq(scoresTable.assessmentId, cycleId));
      const domainMap: Record<number, number[]> = {};
      for (const s of scores) {
        const dId = scoreContext.domainByQuestionId[s.assessmentQuestionId];
        if (dId) { if (!domainMap[dId]) domainMap[dId] = []; domainMap[dId].push(s.score); }
      }
      series.push({
        label: cycle.name,
        questionSetSignature: scoreContext.signature,
        scores: allDomains.map(d => {
          const arr = domainMap[d.id];
          return arr && arr.length > 0 ? Math.round(arr.reduce((a: number, b: number) => a + b, 0) / arr.length * 100) / 100 : null;
        }),
        color: COLORS[idx % COLORS.length],
      });
    }
  } else if (requestedUserIds && requestedUserIds.length > 0) {
    // Multi-user overlay within a single cycle
    const [primaryCycle] = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, assessmentId));
    if (!primaryCycle || !canAccessCycle(primaryCycle)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const usersToShow = await db.select().from(usersTable).where(inArray(usersTable.id, requestedUserIds));
    const scoreContext = await questionScoreContext(assessmentId);
    for (const [idx, u] of usersToShow.entries()) {
      const scores = await db.select().from(scoresTable).where(and(eq(scoresTable.assessmentId, assessmentId), eq(scoresTable.userId, u.id)));
      const domainMap: Record<number, number[]> = {};
      for (const s of scores) {
        const dId = scoreContext.domainByQuestionId[s.assessmentQuestionId];
        if (dId) { if (!domainMap[dId]) domainMap[dId] = []; domainMap[dId].push(s.score); }
      }
      series.push({
        label: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
        questionSetSignature: scoreContext.signature,
        scores: allDomains.map(d => {
          const arr = domainMap[d.id];
          return arr && arr.length > 0 ? Math.round(arr.reduce((a: number, b: number) => a + b, 0) / arr.length * 100) / 100 : null;
        }),
        color: COLORS[idx % COLORS.length],
      });
    }
  } else {
    // Single aggregate view
    const [primaryCycle] = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, assessmentId));
    if (!primaryCycle || !canAccessCycle(primaryCycle)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const scoreContext = await questionScoreContext(assessmentId);
    const scores = await db.select().from(scoresTable).where(eq(scoresTable.assessmentId, assessmentId));
    const domainMap: Record<number, number[]> = {};
    for (const s of scores) {
      const dId = scoreContext.domainByQuestionId[s.assessmentQuestionId];
      if (dId) { if (!domainMap[dId]) domainMap[dId] = []; domainMap[dId].push(s.score); }
    }
    series.push({
      label: primaryCycle.name,
      questionSetSignature: scoreContext.signature,
      scores: allDomains.map(d => {
        const arr = domainMap[d.id];
        return arr && arr.length > 0 ? Math.round(arr.reduce((a: number, b: number) => a + b, 0) / arr.length * 100) / 100 : null;
      }),
      color: COLORS[0],
    });
  }

  res.json(GetRadarDataResponse.parse({ domains: allDomains.map(d => d.name), series }));
});

// GET /scores/progress
router.get("/scores/progress", requireAuth, async (req: any, res): Promise<void> => {
  const queryParams = GetProgressOverTimeQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const companyId = queryParams.data.companyId;
  if (currentUser.role !== "super_admin" && currentUser.companyId !== companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const cycles = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.companyId, companyId)).orderBy(assessmentCyclesTable.createdAt);
  const allDomains = await db.select().from(domainsTable).orderBy(domainsTable.orderIndex);

  const cycleProgressData = [];
  for (const cycle of cycles) {
    const scoreContext = await questionScoreContext(cycle.id);
    const scores = await db.select().from(scoresTable).where(eq(scoresTable.assessmentId, cycle.id));
    const domainMap: Record<number, number[]> = {};
    for (const s of scores) {
      const dId = scoreContext.domainByQuestionId[s.assessmentQuestionId];
      if (dId) { if (!domainMap[dId]) domainMap[dId] = []; domainMap[dId].push(s.score); }
    }
    const domainScores = allDomains.map(d => {
      const arr = domainMap[d.id];
      const avg = arr && arr.length > 0 ? Math.round(arr.reduce((a: number, b: number) => a + b, 0) / arr.length * 100) / 100 : null;
      return {
        domainId: d.id,
        domainName: d.name,
        score: avg,
        band: avg != null ? (avg <= 1 ? "Critical" : avg <= 2 ? "Weak" : avg <= 3 ? "Developing" : "Strong") : null,
      };
    });
    const validScores = domainScores.filter(d => d.score != null).map(d => d.score as number);
    const overallScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length * 100) / 100 : null;
    cycleProgressData.push({
      assessmentId: cycle.id,
      assessmentName: cycle.name,
      questionSetSignature: scoreContext.signature,
      completedAt: cycle.updatedAt instanceof Date ? cycle.updatedAt.toISOString() : cycle.updatedAt,
      domainScores,
      overallScore,
    });
  }

  res.json(GetProgressOverTimeResponse.parse({ cycles: cycleProgressData }));
});

export default router;
