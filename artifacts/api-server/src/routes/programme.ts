import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  usersTable, companiesTable, assessmentCyclesTable, actionsTable,
  scoresTable, criteriaTable, categoriesTable, domainsTable,
} from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { questionScoreContext } from "../lib/assessmentQuestions";
import { GetProgrammeIntelligenceQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

async function getDomainScoresForCycle(cycleId: number, allDomains: any[]) {
  const scoreContext = await questionScoreContext(cycleId);
  const scores = await db.select().from(scoresTable).where(eq(scoresTable.assessmentId, cycleId));


  const domainMap: Record<number, number[]> = {};
  for (const s of scores) {
    const dId = scoreContext.domainByQuestionId[s.assessmentQuestionId];
    if (dId) {
      if (!domainMap[dId]) domainMap[dId] = [];
      domainMap[dId].push(s.score);
    }
  }

  return allDomains.map((d) => {
    const arr = domainMap[d.id];
    const avg = arr && arr.length > 0
      ? Math.round((arr.reduce((a: number, b: number) => a + b, 0) / arr.length) * 100) / 100
      : null;
    return { domainId: d.id, domainName: d.name, score: avg, band: avg != null ? (avg <= 1 ? "Critical" : avg <= 2 ? "Weak" : avg <= 3 ? "Developing" : "Strong") : null };
  });
}

// GET /reports/programme
router.get("/reports/programme", requireAuth, async (req: any, res): Promise<void> => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || currentUser.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const allDomains = await db.select().from(domainsTable).orderBy(domainsTable.orderIndex);
  const allCompanies = await db.select().from(companiesTable).where(eq(companiesTable.isActive, true));
  const query = GetProgrammeIntelligenceQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid question-set filter" }); return; }
  const cyclesByCompany = new Map<number, any[]>();
  const contexts = new Map<number, Awaited<ReturnType<typeof questionScoreContext>>>();
  const cohortMap = new Map<string, { signature: string; questionCount: number; companiesScored: number }>();
  for (const company of allCompanies) {
    const cycles = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.companyId, company.id));
    cyclesByCompany.set(company.id, cycles);
    const latest = cycles.filter(c => c.status === "completed").sort((a,b) => new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime())[0];
    if (latest) {
      const context = await questionScoreContext(latest.id);
      contexts.set(company.id, context);
      const cohort = cohortMap.get(context.signature) ?? { signature: context.signature, questionCount: context.questions.length, companiesScored: 0 };
      cohort.companiesScored++;
      cohortMap.set(context.signature, cohort);
    }
  }
  const questionSetCohorts = [...cohortMap.values()].sort((a,b) => b.companiesScored-a.companiesScored || a.signature.localeCompare(b.signature));
  const selectedQuestionSetSignature = query.data.questionSetSignature ?? questionSetCohorts[0]?.signature ?? null;
  if (query.data.questionSetSignature && !cohortMap.has(query.data.questionSetSignature)) { res.status(400).json({ error: "Question-set cohort not found" }); return; }

  // Domain score accumulation for benchmarks
  const domainScoreAccum: Record<number, number[]> = {};
  for (const d of allDomains) domainScoreAccum[d.id] = [];

  const heatmap: any[] = [];
  const riskCompanies: any[] = [];

  let totalActions = 0;
  let completedActions = 0;
  let totalAssessments = 0;
  let completedAssessments = 0;
  let companiesWithCompletedAssessments = 0;

  const allScores: number[] = [];

  for (const company of allCompanies) {
    const cycles = cyclesByCompany.get(company.id) ?? [];
    totalAssessments += cycles.length;
    const completed = cycles.filter((c: any) => c.status === "completed");
    completedAssessments += completed.length;

    const companyActions = await db.select().from(actionsTable).where(eq(actionsTable.companyId, company.id));
    totalActions += companyActions.length;
    completedActions += companyActions.filter((a: any) => a.status === "completed").length;

    // Risk: no assessments at all
    if (cycles.length === 0) {
      riskCompanies.push({
        companyId: company.id,
        companyName: company.name,
        riskType: "no_assessments",
        detail: "No assessments have been started",
      });
    } else if (completed.length === 0) {
      riskCompanies.push({
        companyId: company.id,
        companyName: company.name,
        riskType: "no_completed_assessments",
        detail: `${cycles.length} assessment${cycles.length > 1 ? "s" : ""} started, none completed`,
      });
    }

    let domainScores: any[] = allDomains.map((d) => ({ domainId: d.id, domainName: d.name, score: null, band: null }));
    let overallScore: number | null = null;
    let latestCompletedAt: string | null = null;

    if (completed.length > 0) {
      companiesWithCompletedAssessments++;
      const latestCycle = completed.sort(
        (a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0];
      latestCompletedAt = latestCycle.updatedAt ? new Date(latestCycle.updatedAt).toISOString() : null;

      domainScores = await getDomainScoresForCycle(latestCycle.id, allDomains);

      const validScores = domainScores.filter((d) => d.score != null).map((d) => d.score as number);
      const comparable = contexts.get(company.id)?.signature === selectedQuestionSetSignature;
      if (validScores.length > 0) {
        overallScore = Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100;
        if (comparable) allScores.push(...validScores);
      }

      for (const d of domainScores) {
        if (comparable && d.score != null) domainScoreAccum[d.domainId].push(d.score);
      }

      // Risk: low action completion (>5 actions, <20% completed)
      if (companyActions.length > 5) {
        const compCompletedRatio = companyActions.filter((a: any) => a.status === "completed").length / companyActions.length;
        if (compCompletedRatio < 0.2) {
          riskCompanies.push({
            companyId: company.id,
            companyName: company.name,
            riskType: "low_action_completion",
            detail: `${Math.round(compCompletedRatio * 100)}% of ${companyActions.length} actions completed`,
          });
        }
      }
    }

    if (!contexts.has(company.id) || contexts.get(company.id)?.signature === selectedQuestionSetSignature) heatmap.push({
      companyId: company.id,
      companyName: company.name,
      sector: company.sector ?? null,
      size: company.size ?? null,
      latestCompletedAt,
      overallScore,
      domainScores,
    });
  }

  // Sort heatmap: companies with scores descending, then no-data at bottom
  heatmap.sort((a, b) => {
    if (a.overallScore == null && b.overallScore == null) return 0;
    if (a.overallScore == null) return 1;
    if (b.overallScore == null) return -1;
    return b.overallScore - a.overallScore;
  });

  // Domain benchmarks
  const domainBenchmarks = allDomains.map((d) => {
    const arr = domainScoreAccum[d.id];
    if (!arr || arr.length === 0) {
      return { domainId: d.id, domainName: d.name, averageScore: null, minScore: null, maxScore: null, companiesScored: 0 };
    }
    const avg = Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;
    const min = Math.round(Math.min(...arr) * 100) / 100;
    const max = Math.round(Math.max(...arr) * 100) / 100;
    return { domainId: d.id, domainName: d.name, averageScore: avg, minScore: min, maxScore: max, companiesScored: arr.length };
  });

  // KPIs
  const averageMaturity = allScores.length > 0
    ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100) / 100
    : null;

  const benchmarksWithScores = domainBenchmarks.filter((b) => b.averageScore != null);
  const weakestDomain = benchmarksWithScores.length > 0
    ? benchmarksWithScores.reduce((a, b) => (a.averageScore! < b.averageScore! ? a : b)).domainName
    : null;
  const strongestDomain = benchmarksWithScores.length > 0
    ? benchmarksWithScores.reduce((a, b) => (a.averageScore! > b.averageScore! ? a : b)).domainName
    : null;

  const actionCompletionRate = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : null;
  const assessmentCompletionRate = totalAssessments > 0
    ? Math.round((completedAssessments / totalAssessments) * 100)
    : null;

  res.json({
    selectedQuestionSetSignature,
    questionSetCohorts,
    comparisonNotice: questionSetCohorts.length > 1 ? "Different questions are not directly comparable. Maturity scores and heatmap use the selected question set; operational counts cover all companies." : "Maturity comparisons use matching question sets.",
    kpis: {
      participatingCompanies: allCompanies.length,
      companiesWithCompletedAssessments,
      averageMaturity,
      actionCompletionRate,
      assessmentCompletionRate,
      weakestDomain,
      strongestDomain,
    },
    heatmap,
    domainBenchmarks,
    riskCompanies,
    domains: allDomains.map((d) => d.name),
  });
});

export default router;
