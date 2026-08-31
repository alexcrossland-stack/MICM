/**
 * Safe DB-only staging/demo seed.
 *
 * This script creates fake non-production records for dashboards, reports,
 * exports, analytics, programme views, targets, actions, and evidence notes.
 * It does not create Clerk users or credentials.
 */

import { inArray } from "drizzle-orm";
import { assertStagingDemoSeedAllowed } from "./stagingDemoSeedGuards";
import {
  STAGING_DEMO_SUPER_ADMIN,
  stagingDemoClerkUserIds,
  stagingDemoUsersForCompany,
} from "./stagingDemoAccounts";

const COMPANY_DATA = [
  {
    key: "northstar",
    name: "MICM STAGING DEMO - Northstar Components Ltd",
    sector: "Precision Components",
    size: "51-200",
    contactEmail: "northstar.admin@example.test",
    baseScore: 2,
  },
  {
    key: "westbridge",
    name: "MICM STAGING DEMO - Westbridge Fabrication Ltd",
    sector: "Metal Fabrication",
    size: "201-500",
    contactEmail: "westbridge.admin@example.test",
    baseScore: 1,
  },
  {
    key: "helioworks",
    name: "MICM STAGING DEMO - HelioWorks Assembly Ltd",
    sector: "Electronics Assembly",
    size: "11-50",
    contactEmail: "helioworks.admin@example.test",
    baseScore: 3,
  },
] as const;

type DbModule = typeof import("@workspace/db");
type CompanyRow = { id: number };
type UserRow = { id: number; email: string };
type AssessmentCycleRow = { id: number };
type DomainRow = { id: number; name: string; orderIndex: number };
type CategoryRow = { id: number; domainId: number; name: string };
type CriterionRow = { id: number; categoryId: number; name: string };

function clampScore(value: number) {
  return Math.max(0, Math.min(4, value));
}

function scoreFor(
  companyIndex: number,
  criterionIndex: number,
  cycleOffset: number,
  userOffset: number,
) {
  const base = COMPANY_DATA[companyIndex]?.baseScore ?? 2;
  const variation =
    criterionIndex % 4 === 0 ? -1 : criterionIndex % 4 === 3 ? 1 : 0;
  return clampScore(base + cycleOffset + userOffset + variation);
}

function criterionIdsForDomain(
  domainName: string,
  domains: DomainRow[],
  categories: CategoryRow[],
  criteria: CriterionRow[],
) {
  const domain = domains.find((item) => item.name === domainName);
  if (!domain) return [];
  const categoryIds = categories
    .filter((item) => item.domainId === domain.id)
    .map((item) => item.id);
  return criteria
    .filter((item) => categoryIds.includes(item.categoryId))
    .map((item) => item.id);
}

async function deleteExistingDemoData(dbm: DbModule) {
  const {
    db,
    assessmentQuestionsTable,
    companiesTable,
    usersTable,
    assessmentCyclesTable,
    assessmentAssigneesTable,
    scoresTable,
    actionsTable,
    maturityTargetsTable,
    criterionNotesTable,
  } = dbm;

  const demoCompanies = await db
    .select()
    .from(companiesTable)
    .where(
      inArray(
        companiesTable.name,
        COMPANY_DATA.map((company) => company.name),
      ),
    );
  const companyIds = demoCompanies.map((company) => company.id);
  const allDemoClerkIds = stagingDemoClerkUserIds(
    COMPANY_DATA.map((company) => company.key),
  );

  if (companyIds.length > 0) {
    const demoCycles = await db
      .select()
      .from(assessmentCyclesTable)
      .where(inArray(assessmentCyclesTable.companyId, companyIds));
    const cycleIds = demoCycles.map((cycle) => cycle.id);

    if (cycleIds.length > 0) {
      await db
        .delete(criterionNotesTable)
        .where(inArray(criterionNotesTable.assessmentId, cycleIds));
      await db
        .delete(scoresTable)
        .where(inArray(scoresTable.assessmentId, cycleIds));
      await db
        .delete(assessmentAssigneesTable)
        .where(inArray(assessmentAssigneesTable.assessmentId, cycleIds));
      await db.delete(assessmentQuestionsTable).where(inArray(assessmentQuestionsTable.assessmentId, cycleIds));
      await db
        .delete(assessmentCyclesTable)
        .where(inArray(assessmentCyclesTable.id, cycleIds));
    }

    await db
      .delete(actionsTable)
      .where(inArray(actionsTable.companyId, companyIds));
    await db
      .delete(maturityTargetsTable)
      .where(inArray(maturityTargetsTable.companyId, companyIds));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.companyId, companyIds));
    await db
      .delete(companiesTable)
      .where(inArray(companiesTable.id, companyIds));
  }

  await db
    .delete(usersTable)
    .where(inArray(usersTable.clerkUserId, allDemoClerkIds));
}

async function seed() {
  assertStagingDemoSeedAllowed();

  const dbm = await import("@workspace/db");
  const {
    db,
    createQuestionSnapshot,
    attachQuestionReferences,
    companiesTable,
    usersTable,
    assessmentCyclesTable,
    assessmentAssigneesTable,
    scoresTable,
    actionsTable,
    maturityTargetsTable,
    criterionNotesTable,
    domainsTable,
    categoriesTable,
    criteriaTable,
  } = dbm;

  const domains = await db
    .select()
    .from(domainsTable)
    .orderBy(domainsTable.orderIndex);
  const categories = await db.select().from(categoriesTable);
  const criteria = await db.select().from(criteriaTable);
  if (domains.length === 0 || criteria.length === 0) {
    throw new Error(
      "No MICM domains/criteria found. Run seed-domains before seed-staging-demo-data.",
    );
  }

  console.log(
    "Seeding fake MICM staging/demo dataset. This is not production data.",
  );
  await deleteExistingDemoData(dbm);

  const [superAdmin] = await db
    .insert(usersTable)
    .values({
      clerkUserId: STAGING_DEMO_SUPER_ADMIN.clerkUserId,
      email: STAGING_DEMO_SUPER_ADMIN.email,
      firstName: STAGING_DEMO_SUPER_ADMIN.firstName,
      lastName: STAGING_DEMO_SUPER_ADMIN.lastName,
      role: STAGING_DEMO_SUPER_ADMIN.role,
      companyId: null,
      isActive: true,
    })
    .returning();

  const companyRows: CompanyRow[] = [];
  const usersByCompanyKey = new Map<
    string,
    { admin: UserRow; userA: UserRow; userB: UserRow }
  >();
  const cyclesByCompanyKey = new Map<
    string,
    {
      baseline: AssessmentCycleRow;
      latest: AssessmentCycleRow;
      active: AssessmentCycleRow;
      draft: AssessmentCycleRow;
    }
  >();

  for (const [companyIndex, companyData] of COMPANY_DATA.entries()) {
    const [company] = await db
      .insert(companiesTable)
      .values({
        name: companyData.name,
        sector: companyData.sector,
        size: companyData.size,
        contactEmail: companyData.contactEmail,
        isActive: true,
      })
      .returning();
    companyRows.push(company);
    const demoUsers = stagingDemoUsersForCompany(companyData.key);

    const [admin, userA, userB] = await db
      .insert(usersTable)
      .values([
        {
          clerkUserId: demoUsers.admin.clerkUserId,
          email: demoUsers.admin.email,
          firstName: demoUsers.admin.firstName,
          lastName: demoUsers.admin.lastName,
          role: demoUsers.admin.role,
          companyId: company.id,
          isActive: true,
        },
        {
          clerkUserId: demoUsers.userA.clerkUserId,
          email: demoUsers.userA.email,
          firstName: demoUsers.userA.firstName,
          lastName: demoUsers.userA.lastName,
          role: demoUsers.userA.role,
          companyId: company.id,
          isActive: true,
        },
        {
          clerkUserId: demoUsers.userB.clerkUserId,
          email: demoUsers.userB.email,
          firstName: demoUsers.userB.firstName,
          lastName: demoUsers.userB.lastName,
          role: demoUsers.userB.role,
          companyId: company.id,
          isActive: true,
        },
      ])
      .returning();
    usersByCompanyKey.set(companyData.key, { admin, userA, userB });

    const [baseline, latest, active, draft] = await db
      .insert(assessmentCyclesTable)
      .values([
        {
          companyId: company.id,
          name: "MICM Staging Demo - 2025 Baseline",
          description:
            "Fake completed baseline assessment for staging and demo validation.",
          status: "completed",
          startDate: new Date("2025-01-06T00:00:00.000Z"),
          endDate: new Date("2025-01-31T00:00:00.000Z"),
        },
        {
          companyId: company.id,
          name: "MICM Staging Demo - 2025 Improvement Review",
          description:
            "Fake completed follow-up assessment for progress and report comparisons.",
          status: "completed",
          startDate: new Date("2025-07-01T00:00:00.000Z"),
          endDate: new Date("2025-07-31T00:00:00.000Z"),
        },
        {
          companyId: company.id,
          name: "MICM Staging Demo - 2026 Active Review",
          description:
            "Fake incomplete active assessment for completion-validation testing.",
          status: "active",
          startDate: new Date("2026-02-02T00:00:00.000Z"),
          endDate: new Date("2026-03-31T00:00:00.000Z"),
        },
        {
          companyId: company.id,
          name: "MICM Staging Demo - 2026 Draft Planning",
          description: "Fake draft assessment for workflow testing.",
          status: "draft",
          startDate: null,
          endDate: null,
        },
      ])
      .returning();
    for (const cycle of [baseline, latest, active, draft]) await createQuestionSnapshot(db, cycle.id);
    cyclesByCompanyKey.set(companyData.key, {
      baseline,
      latest,
      active,
      draft,
    });

    await db.insert(assessmentAssigneesTable).values([
      {
        assessmentId: baseline.id,
        userId: admin.id,
        completedAt: new Date("2025-01-20T00:00:00.000Z"),
      },
      {
        assessmentId: baseline.id,
        userId: userA.id,
        completedAt: new Date("2025-01-22T00:00:00.000Z"),
      },
      {
        assessmentId: latest.id,
        userId: admin.id,
        completedAt: new Date("2025-07-18T00:00:00.000Z"),
      },
      {
        assessmentId: latest.id,
        userId: userA.id,
        completedAt: new Date("2025-07-21T00:00:00.000Z"),
      },
      { assessmentId: active.id, userId: userA.id, completedAt: null },
      { assessmentId: active.id, userId: userB.id, completedAt: null },
    ]);

    const completedScores = [];
    for (const [criterionIndex, criterion] of criteria.entries()) {
      completedScores.push(
        {
          assessmentId: baseline.id,
          userId: admin.id,
          criterionId: criterion.id,
          score: scoreFor(companyIndex, criterionIndex, 0, 0),
          notes: "Fake staging baseline score.",
        },
        {
          assessmentId: baseline.id,
          userId: userA.id,
          criterionId: criterion.id,
          score: scoreFor(companyIndex, criterionIndex, 0, -1),
          notes: "Fake staging operator baseline score.",
        },
        {
          assessmentId: latest.id,
          userId: admin.id,
          criterionId: criterion.id,
          score: scoreFor(companyIndex, criterionIndex, 1, 0),
          notes: "Fake staging improvement score.",
        },
        {
          assessmentId: latest.id,
          userId: userA.id,
          criterionId: criterion.id,
          score: scoreFor(companyIndex, criterionIndex, 1, -1),
          notes: "Fake staging operator improvement score.",
        },
      );
    }
    await db.insert(scoresTable).values(await attachQuestionReferences(db, completedScores));

    const activePartialCount = Math.max(2, Math.floor(criteria.length * 0.45));
    await db.insert(scoresTable).values(await attachQuestionReferences(db,
      criteria
        .slice(0, activePartialCount)
        .flatMap((criterion, criterionIndex) => [
          {
            assessmentId: active.id,
            userId: userA.id,
            criterionId: criterion.id,
            score: scoreFor(companyIndex, criterionIndex, 1, 0),
            notes: "Fake staging partial active score.",
          },
          ...(criterionIndex % 3 === 0
            ? [
                {
                  assessmentId: active.id,
                  userId: userB.id,
                  criterionId: criterion.id,
                  score: scoreFor(companyIndex, criterionIndex, 0, 0),
                  notes: "Fake staging second user partial active score.",
                },
              ]
            : []),
        ]),
    ));
  }

  const strategyCriterionIds = criterionIdsForDomain(
    "Strategy",
    domains,
    categories,
    criteria,
  );
  const operationsCriterionIds = criterionIdsForDomain(
    "Daily Management",
    domains,
    categories,
    criteria,
  );
  const processCriterionIds = criterionIdsForDomain(
    "Processes and Tools",
    domains,
    categories,
    criteria,
  );

  for (const [companyIndex, companyData] of COMPANY_DATA.entries()) {
    const company = companyRows[companyIndex]!;
    const users = usersByCompanyKey.get(companyData.key)!;
    const cycles = cyclesByCompanyKey.get(companyData.key)!;

    await db.insert(criterionNotesTable).values(await attachQuestionReferences(db, [
      {
        companyId: company.id,
        assessmentId: cycles.latest.id,
        criterionId: strategyCriterionIds[0] ?? criteria[0]!.id,
        authorUserId: users.admin.id,
        note: "Fake evidence note: board reviewed the staged strategy pack and KPI cascade.",
      },
      {
        companyId: company.id,
        assessmentId: cycles.latest.id,
        criterionId: operationsCriterionIds[0] ?? criteria[0]!.id,
        authorUserId: users.userA.id,
        note: "Fake improvement note: staged daily huddle board shows unresolved escalation items.",
      },
      {
        companyId: company.id,
        assessmentId: cycles.active.id,
        criterionId: processCriterionIds[0] ?? criteria[0]!.id,
        authorUserId: users.userB.id,
        note: "Fake active-review note: staged ERP process evidence is incomplete.",
      },
    ]));

    const strategyDomain = domains.find((domain) => domain.name === "Strategy");
    const dailyDomain = domains.find(
      (domain) => domain.name === "Daily Management",
    );
    const processDomain = domains.find(
      (domain) => domain.name === "Processes and Tools",
    );
    const innovationDomain = domains.find(
      (domain) => domain.name === "Innovation",
    );

    await db.insert(actionsTable).values([
      {
        companyId: company.id,
        assessmentId: cycles.latest.id,
        domainId: strategyDomain?.id ?? null,
        title: "MICM staging demo - refresh strategy deployment board",
        description:
          "Fake action for validating dashboards, reports and exports.",
        status: "in_progress",
        priority: "high",
        assignedUserId: users.admin.id,
        dueDate: new Date("2026-05-30T00:00:00.000Z"),
      },
      {
        companyId: company.id,
        assessmentId: cycles.latest.id,
        domainId: dailyDomain?.id ?? null,
        title: "MICM staging demo - stabilise tier meeting cadence",
        description: "Fake action for validating action summaries.",
        status: "not_started",
        priority: "medium",
        assignedUserId: users.userA.id,
        dueDate: new Date("2026-06-28T00:00:00.000Z"),
      },
      {
        companyId: company.id,
        assessmentId: cycles.latest.id,
        domainId: processDomain?.id ?? null,
        title: "MICM staging demo - complete process map review",
        description: "Fake completed action for validating status filters.",
        status: "completed",
        priority: "medium",
        assignedUserId: users.userB.id,
        dueDate: new Date("2026-04-15T00:00:00.000Z"),
        completedDate: new Date("2026-04-10T00:00:00.000Z"),
      },
      {
        companyId: company.id,
        assessmentId: cycles.active.id,
        domainId: innovationDomain?.id ?? null,
        title: "MICM staging demo - define innovation intake route",
        description: "Fake on-hold action for validating roadmap exports.",
        status: "on_hold",
        priority: "low",
        assignedUserId: users.admin.id,
        dueDate: new Date("2026-08-31T00:00:00.000Z"),
      },
    ]);

    await db.insert(maturityTargetsTable).values(
      domains.slice(0, 4).map((domain, domainIndex) => ({
        companyId: company.id,
        domainId: domain.id,
        targetScore: clampScore(
          (COMPANY_DATA[companyIndex]?.baseScore ?? 2) +
            1 +
            (domainIndex % 2) * 0.5,
        ),
        targetDate: new Date(
          `2026-${String(7 + domainIndex).padStart(2, "0")}-30T00:00:00.000Z`,
        ),
        notes:
          "Fake staging target for target-setting and radar overlay validation.",
      })),
    );
  }

  console.log(
    `Created fake staging/demo records for ${companyRows.length} companies.`,
  );
  console.log(`Created fake Super Admin DB user: ${superAdmin.email}`);
  console.log(
    "Created canonical staging demo DB users: superadmin.demo@micm.local, companyadmin.demo@micm.local, companyuser.demo@micm.local.",
  );
  console.log(
    "No Clerk users, passwords, secrets, or production identifiers were created.",
  );
}

seed().catch((error) => {
  console.error("Staging demo seed failed:", error);
  process.exit(1);
});
