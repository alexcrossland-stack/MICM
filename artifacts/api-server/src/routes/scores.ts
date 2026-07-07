import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
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

const router: IRouter = Router();

function formatScore(s: any) {
  return {
    id: s.id,
    assessmentId: s.assessmentId,
    userId: s.userId,
    criterionId: s.criterionId,
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
router.post("/scores", requireAuth, async (req: any, res): Promise<void> => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = SubmitScoresBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { assessmentId, scores } = parsed.data;

  const [cycle] = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.id, assessmentId));
  if (!cycle) { res.status(404).json({ error: "Assessment not found" }); return; }
  if (currentUser.role !== "super_admin" && currentUser.companyId !== cycle.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (cycle.status !== "active") {
    res.status(400).json({ error: "Assessment is not active" });
    return;
  }

  let [assignee] = await db.select().from(assessmentAssigneesTable).where(
    and(eq(assessmentAssigneesTable.assessmentId, assessmentId), eq(assessmentAssigneesTable.userId, currentUser.id)),
  );
  if (!assignee) {
    if (currentUser.role !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    [assignee] = await db.insert(assessmentAssigneesTable).values({
      assessmentId,
      userId: currentUser.id,
    }).returning();
  }

  const results = [];
  for (const scoreInput of scores) {
    // Upsert: delete existing and re-insert
    await db.delete(scoresTable).where(and(
      eq(scoresTable.assessmentId, assessmentId),
      eq(scoresTable.userId, currentUser.id),
      eq(scoresTable.criterionId, scoreInput.criterionId)
    ));
    const [saved] = await db.insert(scoresTable).values({
      assessmentId,
      userId: currentUser.id,
      criterionId: scoreInput.criterionId,
      score: scoreInput.score,
      notes: scoreInput.notes,
    }).returning();
    results.push(saved);
  }

  // Mark assignee as completed if all criteria scored
  const allCriteria = await db.select().from(criteriaTable);
  const allScores = await db.select().from(scoresTable).where(
    and(eq(scoresTable.assessmentId, assessmentId), eq(scoresTable.userId, currentUser.id))
  );
  if (allScores.length >= allCriteria.length) {
    await db.update(assessmentAssigneesTable)
      .set({ completedAt: new Date() })
      .where(and(
        eq(assessmentAssigneesTable.assessmentId, assessmentId),
        eq(assessmentAssigneesTable.userId, currentUser.id)
      ));
  }

  res.json(SubmitScoresResponse.parse(results.map(formatScore)));
});

// GET /scores/radar
router.get("/scores/radar", requireAuth, async (req: any, res): Promise<void> => {
  const queryParams = GetRadarDataQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const assessmentId = queryParams.data.assessmentId;
  const allDomains = await db.select().from(domainsTable).orderBy(domainsTable.orderIndex);
  const allCategories = await db.select().from(categoriesTable);
  const allCriteria = await db.select().from(criteriaTable);

  const criterionToDomainId: Record<number, number> = {};
  const categoryToDomainId: Record<number, number> = {};
  for (const cat of allCategories) categoryToDomainId[cat.id] = cat.domainId;
  for (const crit of allCriteria) criterionToDomainId[crit.id] = categoryToDomainId[crit.categoryId];

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
      const scores = await db.select().from(scoresTable).where(eq(scoresTable.assessmentId, cycleId));
      const domainMap: Record<number, number[]> = {};
      for (const s of scores) {
        const dId = criterionToDomainId[s.criterionId];
        if (dId) { if (!domainMap[dId]) domainMap[dId] = []; domainMap[dId].push(s.score); }
      }
      series.push({
        label: cycle.name,
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
    for (const [idx, u] of usersToShow.entries()) {
      const scores = await db.select().from(scoresTable).where(and(eq(scoresTable.assessmentId, assessmentId), eq(scoresTable.userId, u.id)));
      const domainMap: Record<number, number[]> = {};
      for (const s of scores) {
        const dId = criterionToDomainId[s.criterionId];
        if (dId) { if (!domainMap[dId]) domainMap[dId] = []; domainMap[dId].push(s.score); }
      }
      series.push({
        label: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
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
    const scores = await db.select().from(scoresTable).where(eq(scoresTable.assessmentId, assessmentId));
    const domainMap: Record<number, number[]> = {};
    for (const s of scores) {
      const dId = criterionToDomainId[s.criterionId];
      if (dId) { if (!domainMap[dId]) domainMap[dId] = []; domainMap[dId].push(s.score); }
    }
    series.push({
      label: primaryCycle.name,
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
  const allCategories = await db.select().from(categoriesTable);
  const allCriteria = await db.select().from(criteriaTable);

  const criterionToDomainId: Record<number, number> = {};
  for (const cat of allCategories) {
    for (const crit of allCriteria) {
      if (crit.categoryId === cat.id) criterionToDomainId[crit.id] = cat.domainId;
    }
  }

  const cycleProgressData = [];
  for (const cycle of cycles) {
    const scores = await db.select().from(scoresTable).where(eq(scoresTable.assessmentId, cycle.id));
    const domainMap: Record<number, number[]> = {};
    for (const s of scores) {
      const dId = criterionToDomainId[s.criterionId];
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
      completedAt: cycle.updatedAt instanceof Date ? cycle.updatedAt.toISOString() : cycle.updatedAt,
      domainScores,
      overallScore,
    });
  }

  res.json(GetProgressOverTimeResponse.parse({ cycles: cycleProgressData }));
});

export default router;
