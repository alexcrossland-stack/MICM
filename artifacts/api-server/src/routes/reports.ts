import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, companiesTable, assessmentCyclesTable, actionsTable, scoresTable, criteriaTable, categoriesTable, domainsTable, assessmentAssigneesTable, criterionNotesTable } from "@workspace/db";
import { eq, and, count, sql, inArray } from "drizzle-orm";
import {
  GetCompanyReportResponse,
  GetCompanyReportExportParams,
  GetCompanyReportExportQueryParams,
  GetSuperAdminReportResponse,
  GetCompanyReportParams,
  GetRadarDataResponse,
} from "@workspace/api-zod";
import { requireAuth } from "./auth";
import {
  generateCompanyReportExport,
  type CompanyReportExportFormat,
} from "../lib/reportExports";
import {
  composeCompanyReport,
  type ReportAudience,
  type ReportTemplate,
} from "../lib/reportComposition";
import { formatCriterionNote } from "../lib/criterionNotes";
import { recordAuditEvent } from "../lib/audit";

const router: IRouter = Router();

function formatCompany(c: any) {
  return {
    id: c.id, name: c.name, sector: c.sector, size: c.size, contactEmail: c.contactEmail,
    isActive: c.isActive,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  };
}

async function getDomainScoresForCycle(cycleId: number) {
  const allDomains = await db.select().from(domainsTable).orderBy(domainsTable.orderIndex);
  const allCategories = await db.select().from(categoriesTable);
  const allCriteria = await db.select().from(criteriaTable);
  const scores = await db.select().from(scoresTable).where(eq(scoresTable.assessmentId, cycleId));

  const catToDomain: Record<number, number> = {};
  for (const cat of allCategories) catToDomain[cat.id] = cat.domainId;
  const critToCategory: Record<number, number> = {};
  for (const crit of allCriteria) critToCategory[crit.id] = crit.categoryId;

  const domainMap: Record<number, number[]> = {};
  for (const s of scores) {
    const catId = critToCategory[s.criterionId];
    const dId = catId ? catToDomain[catId] : null;
    if (dId) { if (!domainMap[dId]) domainMap[dId] = []; domainMap[dId].push(s.score); }
  }

  return allDomains.map(d => {
    const arr = domainMap[d.id];
    const avg = arr && arr.length > 0 ? Math.round(arr.reduce((a: number, b: number) => a + b, 0) / arr.length * 100) / 100 : null;
    return {
      domainId: d.id,
      domainName: d.name,
      score: avg,
      band: avg != null ? (avg <= 1 ? "Critical" : avg <= 2 ? "Weak" : avg <= 3 ? "Developing" : "Strong") : null,
    };
  });
}

async function getCompanyReportAccess(req: any, companyId: number) {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "company_admin")) {
    return null;
  }
  if (currentUser.role !== "super_admin" && currentUser.companyId !== companyId) return null;
  return currentUser;
}

async function buildCompanyReport(companyId: number) {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
  if (!company) return null;

  const assessmentCycles = await db.select().from(assessmentCyclesTable).where(eq(assessmentCyclesTable.companyId, companyId)).orderBy(assessmentCyclesTable.createdAt);
  const companyActions = await db.select().from(actionsTable).where(eq(actionsTable.companyId, companyId));
  const companyNotes = await db.select().from(criterionNotesTable).where(eq(criterionNotesTable.companyId, companyId));
  const noteAuthorIds = [...new Set(companyNotes.map((note: any) => note.authorUserId))];
  const noteAuthors = noteAuthorIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, noteAuthorIds))
    : [];
  const noteAuthorById = new Map(noteAuthors.map((author: any) => [author.id, author]));
  const notesFormatted = companyNotes.map((note: any) => formatCriterionNote(note, noteAuthorById.get(note.authorUserId)));

  const cyclesFormatted = await Promise.all(assessmentCycles.map(async (cycle: any) => {
    const assignees = await db.select().from(assessmentAssigneesTable).where(eq(assessmentAssigneesTable.assessmentId, cycle.id));
    return {
      id: cycle.id, companyId: cycle.companyId, name: cycle.name, description: cycle.description,
      status: cycle.status,
      startDate: cycle.startDate instanceof Date ? cycle.startDate.toISOString() : cycle.startDate,
      endDate: cycle.endDate instanceof Date ? cycle.endDate.toISOString() : cycle.endDate,
      assignedUserIds: assignees.map((a: any) => a.userId),
      completedUserIds: assignees.filter((a: any) => a.completedAt).map((a: any) => a.userId),
      createdAt: cycle.createdAt instanceof Date ? cycle.createdAt.toISOString() : cycle.createdAt,
      updatedAt: cycle.updatedAt instanceof Date ? cycle.updatedAt.toISOString() : cycle.updatedAt,
    };
  }));

  const progressCycles = await Promise.all(assessmentCycles.map(async (cycle: any) => {
    const domainScores = await getDomainScoresForCycle(cycle.id);
    const validScores = domainScores.filter(d => d.score != null).map(d => d.score as number);
    const overallScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length * 100) / 100 : null;
    return {
      assessmentId: cycle.id,
      assessmentName: cycle.name,
      completedAt: cycle.updatedAt instanceof Date ? cycle.updatedAt.toISOString() : cycle.updatedAt,
      domainScores,
      overallScore,
    };
  }));

  const actionsFormatted = companyActions.map((a: any) => ({
    id: a.id, companyId: a.companyId, assessmentId: a.assessmentId, domainId: a.domainId,
    title: a.title, description: a.description, status: a.status, priority: a.priority,
    assignedUserId: a.assignedUserId,
    dueDate: a.dueDate instanceof Date ? a.dueDate.toISOString() : a.dueDate,
    completedDate: a.completedDate instanceof Date ? a.completedDate.toISOString() : a.completedDate,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    updatedAt: a.updatedAt instanceof Date ? a.updatedAt.toISOString() : a.updatedAt,
  }));

  let latestResults = null;
  const completedCycles = assessmentCycles.filter((c: any) => c.status === "completed");
  if (completedCycles.length > 0) {
    const latestCycle = completedCycles[completedCycles.length - 1];
    const domainScores = await getDomainScoresForCycle(latestCycle.id);
    latestResults = {
      assessmentId: latestCycle.id,
      assessmentName: latestCycle.name,
      userScores: [],
      aggregateScores: domainScores,
      criterionNotes: notesFormatted.filter((note: any) => note.assessmentId === latestCycle.id),
    };
  }

  return GetCompanyReportResponse.parse({
    company: formatCompany(company),
    assessmentCycles: cyclesFormatted,
    latestResults,
    progressData: { cycles: progressCycles },
    actions: actionsFormatted,
    criterionNotes: notesFormatted,
  });
}

// GET /reports/company/:id
router.get("/reports/company/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = GetCompanyReportParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  if (!(await getCompanyReportAccess(req, params.data.id))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const report = await buildCompanyReport(params.data.id);
  if (!report) { res.status(404).json({ error: "Company not found" }); return; }

  res.json(report);
});

// GET /reports/company/:id/export
router.get("/reports/company/:id/export", requireAuth, async (req: any, res): Promise<void> => {
  const params = GetCompanyReportExportParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const query = GetCompanyReportExportQueryParams.safeParse({
    ...req.query,
    format: req.query.format ?? "csv",
    template: req.query.template ?? "board_ready",
  });
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const currentUser = await getCompanyReportAccess(req, params.data.id);
  if (!currentUser) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const report = await buildCompanyReport(params.data.id);
  if (!report) { res.status(404).json({ error: "Company not found" }); return; }

  const audience: ReportAudience = currentUser.role === "super_admin" ? "super_admin" : "company_admin";
  const composition = composeCompanyReport(report, query.data.template as ReportTemplate, audience);
  const exportResult = generateCompanyReportExport(
    composition,
    query.data.format as CompanyReportExportFormat,
  );
  await recordAuditEvent(req, {
    currentUser,
    eventType: "report.exported",
    companyId: params.data.id,
    targetType: "company_report",
    targetId: params.data.id,
    metadata: {
      format: query.data.format,
      template: query.data.template,
      audience,
    },
  });
  res.setHeader("Content-Type", exportResult.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${exportResult.fileName}"`);
  res.status(200).send(exportResult.body);
});

// GET /reports/cross-company-radar  (Super Admin only)
router.get("/reports/cross-company-radar", requireAuth, async (req: any, res): Promise<void> => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || currentUser.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const companyIdsParam = (req.query.companyIds ?? "") as string;
  const companyIds = companyIdsParam.split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (companyIds.length === 0) {
    res.status(400).json({ error: "companyIds is required" });
    return;
  }

  const COLORS = ["#6b8ef5", "#f5a97c", "#9cf5a4", "#f5e97c", "#c47cf5", "#7cf5e5"];

  const allDomains = await db.select().from(domainsTable).orderBy(domainsTable.orderIndex);
  const allCategories = await db.select().from(categoriesTable);
  const allCriteria = await db.select().from(criteriaTable);

  const catToDomain: Record<number, number> = {};
  for (const cat of allCategories) catToDomain[cat.id] = cat.domainId;
  const critToCategory: Record<number, number> = {};
  for (const crit of allCriteria) critToCategory[crit.id] = crit.categoryId;

  const series: Array<{ label: string; scores: (number | null)[]; color: string }> = [];

  for (const [idx, companyId] of companyIds.entries()) {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!company) continue;

    // Find the latest completed cycle for this company
    const completedCycles = await db
      .select()
      .from(assessmentCyclesTable)
      .where(and(eq(assessmentCyclesTable.companyId, companyId), eq(assessmentCyclesTable.status, "completed")));

    if (completedCycles.length === 0) {
      series.push({
        label: company.name,
        scores: allDomains.map(() => null),
        color: COLORS[idx % COLORS.length],
      });
      continue;
    }

    const latestCycle = completedCycles.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0];

    const scores = await db.select().from(scoresTable).where(eq(scoresTable.assessmentId, latestCycle.id));

    const domainMap: Record<number, number[]> = {};
    for (const s of scores) {
      const catId = critToCategory[s.criterionId];
      const dId = catId != null ? catToDomain[catId] : null;
      if (dId) {
        if (!domainMap[dId]) domainMap[dId] = [];
        domainMap[dId].push(s.score);
      }
    }

    series.push({
      label: company.name,
      scores: allDomains.map((d) => {
        const arr = domainMap[d.id];
        return arr && arr.length > 0
          ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
          : null;
      }),
      color: COLORS[idx % COLORS.length],
    });
  }

  res.json(GetRadarDataResponse.parse({ domains: allDomains.map((d) => d.name), series }));
});

// GET /reports/superadmin
router.get("/reports/superadmin", requireAuth, async (req: any, res): Promise<void> => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || currentUser.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const allCompanies = await db.select().from(companiesTable);
  const [totalAssessmentsResult] = await db.select({ count: count() }).from(assessmentCyclesTable);
  const [totalUsersResult] = await db.select({ count: count() }).from(usersTable);

  const companySummaries = await Promise.all(allCompanies.map(async (company: any) => {
    const cycles = await db.select().from(assessmentCyclesTable).where(and(eq(assessmentCyclesTable.companyId, company.id), eq(assessmentCyclesTable.status, "completed")));
    const activeActionsResult = await db.select({ count: count() }).from(actionsTable).where(and(eq(actionsTable.companyId, company.id), sql`${actionsTable.status} != 'completed'`));
    let latestOverallScore = null;
    let domainScores: any[] = [];
    if (cycles.length > 0) {
      domainScores = await getDomainScoresForCycle(cycles[cycles.length - 1].id);
      const valid = domainScores.filter(d => d.score != null).map(d => d.score as number);
      latestOverallScore = valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length * 100) / 100 : null;
    }
    return {
      companyId: company.id,
      companyName: company.name,
      latestOverallScore,
      completedAssessments: cycles.length,
      activeActions: activeActionsResult[0].count,
      domainScores,
    };
  }));

  res.json(GetSuperAdminReportResponse.parse({
    totalCompanies: allCompanies.length,
    totalAssessments: totalAssessmentsResult.count,
    totalUsers: totalUsersResult.count,
    companySummaries,
  }));
});

export default router;
