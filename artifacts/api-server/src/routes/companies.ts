import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { companiesTable, usersTable, assessmentCyclesTable, actionsTable, scoresTable, criteriaTable, categoriesTable, domainsTable, assessmentAssigneesTable } from "@workspace/db";
import { eq, and, count, sql, inArray } from "drizzle-orm";
import {
  ListCompaniesResponse,
  ListCompaniesQueryParams,
  GetCompanyResponse,
  CreateCompanyBody,
  UpdateCompanyBody,
  GetCompanyParams,
  UpdateCompanyParams,
  GetCompanyDashboardParams,
  GetCompanyDashboardResponse,
  GetMyCompanyResponse,
} from "@workspace/api-zod";
import { requireAuth } from "./auth";
import { recordAuditEvent } from "../lib/audit";
import {
  companyChallengeDiff,
  normalizeCompanyChallenges,
  normalizeStakeholderEngagement,
  sameCompanyChallenges,
  sameStakeholderEngagement,
} from "../lib/companyInfo";

const router: IRouter = Router();

function formatCompany(c: any) {
  return {
    id: c.id,
    name: c.name,
    sector: c.sector,
    size: c.size,
    contactEmail: c.contactEmail,
    currentStatusDescription: c.currentStatusDescription ?? null,
    currentChallenges: normalizeCompanyChallenges(c.currentChallenges),
    stakeholderEngagement: normalizeStakeholderEngagement(c.stakeholderEngagement),
    isActive: c.isActive,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  };
}

function parseOptionalBooleanQuery(value: unknown): { success: true; value?: boolean } | { success: false } {
  if (value === undefined) return { success: true };
  if (typeof value === "boolean") return { success: true, value };
  if (typeof value !== "string") return { success: false };
  if (value === "true") return { success: true, value: true };
  if (value === "false") return { success: true, value: false };
  return { success: false };
}

// GET /companies - Super Admin only
router.get("/companies", requireAuth, async (req: any, res): Promise<void> => {
  const isActiveQuery = parseOptionalBooleanQuery(req.query.isActive);
  if (!isActiveQuery.success) {
    res.status(400).json({ error: "isActive must be true or false" });
    return;
  }
  const queryParams = ListCompaniesQueryParams.safeParse({ ...req.query, isActive: isActiveQuery.value });
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || currentUser.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const isActiveFilter = queryParams.data.isActive ?? true;
  const companies = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.isActive, isActiveFilter))
    .orderBy(companiesTable.name);
  res.json(ListCompaniesResponse.parse(companies.map(formatCompany)));
});

// POST /companies
router.post("/companies", requireAuth, async (req: any, res): Promise<void> => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || currentUser.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!parsed.data.name.trim()) {
    res.status(400).json({ error: "Company name is required" });
    return;
  }
  const companyInput = {
    ...parsed.data,
    name: parsed.data.name.trim(),
    currentStatusDescription: parsed.data.currentStatusDescription?.trim() || null,
    currentChallenges: normalizeCompanyChallenges(parsed.data.currentChallenges),
    stakeholderEngagement: normalizeStakeholderEngagement(parsed.data.stakeholderEngagement),
  };
  const [company] = await db.insert(companiesTable).values(companyInput).returning();
  await recordAuditEvent(req, {
    currentUser,
    eventType: "company.created",
    companyId: company.id,
    targetType: "company",
    targetId: company.id,
    metadata: {
      sector: company.sector,
      size: company.size,
      isActive: company.isActive,
      hasContactEmail: Boolean(company.contactEmail),
    },
  });
  res.status(201).json(GetCompanyResponse.parse(formatCompany(company)));
});

// GET /companies/me
router.get("/companies/me", requireAuth, async (req: any, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!user || !user.companyId) {
    res.status(404).json({ error: "No company associated" });
    return;
  }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, user.companyId));
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(GetMyCompanyResponse.parse(formatCompany(company)));
});

// GET /companies/:id
router.get("/companies/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = GetCompanyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Super admin can see all, others can only see their own company
  if (currentUser.role !== "super_admin" && currentUser.companyId !== params.data.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, params.data.id));
  if (!company) { res.status(404).json({ error: "Company not found" }); return; }
  res.json(GetCompanyResponse.parse(formatCompany(company)));
});

// PATCH /companies/:id
router.patch("/companies/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = UpdateCompanyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || (currentUser.role !== "super_admin" && !(currentUser.role === "company_admin" && currentUser.companyId === params.data.id))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdateCompanyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: any = {};
  if (parsed.data.name != null) {
    const trimmedName = parsed.data.name.trim();
    if (!trimmedName) {
      res.status(400).json({ error: "Company name is required" });
      return;
    }
    updates.name = trimmedName;
  }
  if (parsed.data.sector !== undefined) updates.sector = parsed.data.sector;
  if (parsed.data.size !== undefined) updates.size = parsed.data.size;
  if (parsed.data.contactEmail !== undefined) updates.contactEmail = parsed.data.contactEmail;
  if (parsed.data.currentStatusDescription !== undefined) {
    const trimmed = parsed.data.currentStatusDescription?.trim() ?? null;
    updates.currentStatusDescription = trimmed === "" ? null : trimmed;
  }
  if (parsed.data.currentChallenges !== undefined) {
    updates.currentChallenges = normalizeCompanyChallenges(parsed.data.currentChallenges);
  }
  if (parsed.data.stakeholderEngagement !== undefined) {
    updates.stakeholderEngagement = normalizeStakeholderEngagement(parsed.data.stakeholderEngagement);
  }
  if (parsed.data.isActive != null) {
    if (currentUser.role !== "super_admin") {
      res.status(403).json({ error: "Only Super Admins can archive or reactivate companies" });
      return;
    }
    updates.isActive = parsed.data.isActive;
  }

  const [existingCompany] = await db.select().from(companiesTable).where(eq(companiesTable.id, params.data.id));
  if (!existingCompany) { res.status(404).json({ error: "Company not found" }); return; }
  const previousStatusDescription = existingCompany.currentStatusDescription ?? null;
  const previousChallenges = normalizeCompanyChallenges(existingCompany.currentChallenges);
  const previousStakeholderEngagement = normalizeStakeholderEngagement(existingCompany.stakeholderEngagement);

  const [company] = await db.update(companiesTable).set(updates).where(eq(companiesTable.id, params.data.id)).returning();
  if (!company) { res.status(404).json({ error: "Company not found" }); return; }
  const currentChallenges = normalizeCompanyChallenges(company.currentChallenges);
  const currentStakeholderEngagement = normalizeStakeholderEngagement(company.stakeholderEngagement);
  const companyActiveChanged =
    Object.prototype.hasOwnProperty.call(updates, "isActive")
    && existingCompany.isActive !== company.isActive;
  const statusDescriptionChanged =
    Object.prototype.hasOwnProperty.call(updates, "currentStatusDescription")
    && previousStatusDescription !== (company.currentStatusDescription ?? null);
  const challengesChanged =
    Object.prototype.hasOwnProperty.call(updates, "currentChallenges")
    && !sameCompanyChallenges(previousChallenges, currentChallenges);
  const stakeholderEngagementChanged =
    Object.prototype.hasOwnProperty.call(updates, "stakeholderEngagement")
    && !sameStakeholderEngagement(previousStakeholderEngagement, currentStakeholderEngagement);
  await recordAuditEvent(req, {
    currentUser,
    eventType: "company.updated",
    companyId: company.id,
    targetType: "company",
    targetId: company.id,
    metadata: {
      changedFields: Object.keys(updates).filter((field) => field !== "contactEmail"),
      contactEmailChanged: Object.prototype.hasOwnProperty.call(updates, "contactEmail"),
    },
  });
  if (statusDescriptionChanged) {
    await recordAuditEvent(req, {
      currentUser,
      eventType: "company_info.status_description_updated",
      companyId: company.id,
      targetType: "company",
      targetId: company.id,
      metadata: {
        previousLength: previousStatusDescription?.length ?? 0,
        newLength: company.currentStatusDescription?.length ?? 0,
      },
    });
  }
  if (challengesChanged) {
    await recordAuditEvent(req, {
      currentUser,
      eventType: "company_info.challenges_updated",
      companyId: company.id,
      targetType: "company",
      targetId: company.id,
      metadata: {
        previousChallengeCount: previousChallenges.length,
        newChallengeCount: currentChallenges.length,
        ...companyChallengeDiff(previousChallenges, currentChallenges),
      },
    });
  }
  if (stakeholderEngagementChanged) {
    await recordAuditEvent(req, {
      currentUser,
      eventType: "company_info.stakeholder_engagement_updated",
      companyId: company.id,
      targetType: "company",
      targetId: company.id,
      metadata: {
        previousCompletedRows: previousStakeholderEngagement.filter((row) => Object.values(row).some(Boolean)).length,
        newCompletedRows: currentStakeholderEngagement.filter((row) => Object.values(row).some(Boolean)).length,
      },
    });
  }
  if (companyActiveChanged) {
    await recordAuditEvent(req, {
      currentUser,
      eventType: company.isActive ? "company.reactivated" : "company.archived",
      companyId: company.id,
      targetType: "company",
      targetId: company.id,
      metadata: {
        previousIsActive: existingCompany.isActive,
        nextIsActive: company.isActive,
      },
    });
  }
  res.json(GetCompanyResponse.parse(formatCompany(company)));
});

// GET /companies/:id/dashboard
router.get("/companies/:id/dashboard", requireAuth, async (req: any, res): Promise<void> => {
  const params = GetCompanyDashboardParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.companyId !== params.data.id)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const companyId = params.data.id;

  const [totalUsersResult] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.companyId, companyId));
  const [totalAssessmentsResult] = await db.select({ count: count() }).from(assessmentCyclesTable).where(eq(assessmentCyclesTable.companyId, companyId));
  const [completedAssessmentsResult] = await db.select({ count: count() }).from(assessmentCyclesTable).where(and(eq(assessmentCyclesTable.companyId, companyId), eq(assessmentCyclesTable.status, "completed")));
  const [activeActionsResult] = await db.select({ count: count() }).from(actionsTable).where(and(eq(actionsTable.companyId, companyId), sql`${actionsTable.status} != 'completed'`));
  const [completedActionsResult] = await db.select({ count: count() }).from(actionsTable).where(and(eq(actionsTable.companyId, companyId), eq(actionsTable.status, "completed")));

  // Domain summaries from latest completed assessment
  const allDomains = await db.select().from(domainsTable).orderBy(domainsTable.orderIndex);
  const domainSummaries: { domainId: number; domainName: string; averageScore: number | null; band: string | null }[] = allDomains.map(d => ({ domainId: d.id, domainName: d.name, averageScore: null, band: null }));

  const latestCycle = await db.select().from(assessmentCyclesTable)
    .where(and(eq(assessmentCyclesTable.companyId, companyId), eq(assessmentCyclesTable.status, "completed")))
    .orderBy(sql`${assessmentCyclesTable.updatedAt} desc`)
    .limit(1);

  if (latestCycle.length > 0) {
    const cycleId = latestCycle[0].id;
    const allCriteria = await db.select({ id: criteriaTable.id, categoryId: criteriaTable.categoryId }).from(criteriaTable);
    const allCategories = await db.select({ id: categoriesTable.id, domainId: categoriesTable.domainId }).from(categoriesTable);
    const criterionToDomain: Record<number, number> = {};
    for (const cat of allCategories) {
      for (const crit of allCriteria) {
        if (crit.categoryId === cat.id) criterionToDomain[crit.id] = cat.domainId;
      }
    }
    const scores = await db.select().from(scoresTable).where(eq(scoresTable.assessmentId, cycleId));
    const domainScoreMap: Record<number, number[]> = {};
    for (const s of scores) {
      const domainId = criterionToDomain[s.criterionId];
      if (domainId) {
        if (!domainScoreMap[domainId]) domainScoreMap[domainId] = [];
        domainScoreMap[domainId].push(s.score);
      }
    }
    for (const ds of domainSummaries) {
      const domainScores = domainScoreMap[ds.domainId];
      if (domainScores && domainScores.length > 0) {
        const avg = domainScores.reduce((a, b) => a + b, 0) / domainScores.length;
        ds.averageScore = Math.round(avg * 100) / 100;
        ds.band = avg <= 1 ? "Critical" : avg <= 2 ? "Weak" : avg <= 3 ? "Developing" : "Strong";
      }
    }
  }

  const allScores = domainSummaries.flatMap(d => d.averageScore != null ? [d.averageScore] : []);
  const latestCycleScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length * 100) / 100 : null;

  res.json(GetCompanyDashboardResponse.parse({
    companyId,
    totalUsers: totalUsersResult.count,
    totalAssessments: totalAssessmentsResult.count,
    completedAssessments: completedAssessmentsResult.count,
    activeActions: activeActionsResult.count,
    completedActions: completedActionsResult.count,
    latestCycleScore,
    domainSummaries,
  }));
});

export default router;
