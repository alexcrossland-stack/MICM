/**
 * Seed script: creates 3 demo Clerk users + matching DB records + sample company + data.
 * Safe to re-run: skips Clerk users that already exist, skips company if already present.
 * Usage: pnpm --filter @workspace/scripts run seed-demo-users
 */

import { db, createQuestionSnapshot, attachQuestionReferences } from "@workspace/db";
import {
  companiesTable,
  usersTable,
  assessmentCyclesTable,
  assessmentAssigneesTable,
  scoresTable,
  actionsTable,
  criteriaTable,
  categoriesTable,
  domainsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const CLERK_SECRET_KEY = process.env["CLERK_SECRET_KEY"];
if (!CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY env var is required");

const CLERK_API = "https://api.clerk.com/v1";

// ─── Demo credentials ────────────────────────────────────────────────────────
const DEMO_USERS = [
  {
    email: "superadmin@micm-demo.com",
    password: "MICMsuper1!",
    firstName: "Sarah",
    lastName: "Admin",
    role: "super_admin" as const,
    label: "Super Admin",
  },
  {
    email: "companyadmin@micm-demo.com",
    password: "MICMadmin1!",
    firstName: "James",
    lastName: "Manager",
    role: "company_admin" as const,
    label: "Company Admin",
  },
  {
    email: "companyuser@micm-demo.com",
    password: "MICMuser1!",
    firstName: "Emily",
    lastName: "Engineer",
    role: "company_user" as const,
    label: "Company User",
  },
] as const;

const DEMO_COMPANY_NAME = "Acme Precision Manufacturing Ltd";

// ─── Clerk helpers ────────────────────────────────────────────────────────────
async function clerkRequest(method: string, path: string, body?: object) {
  const res = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Clerk ${method} ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function findClerkUserByEmail(email: string): Promise<string | null> {
  const data = await clerkRequest("GET", `/users?email_address=${encodeURIComponent(email)}&limit=1`);
  if (Array.isArray(data) && data.length > 0) return data[0].id as string;
  return null;
}

async function createOrGetClerkUser(
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<string> {
  const existing = await findClerkUserByEmail(email);
  if (existing) {
    console.log(`  ↩  Clerk user exists: ${email} → ${existing}`);
    return existing;
  }
  const user = await clerkRequest("POST", "/users", {
    email_address: [email],
    password,
    first_name: firstName,
    last_name: lastName,
    skip_password_checks: false,
  });
  console.log(`  ✓  Created Clerk user: ${email} → ${user.id}`);
  return user.id as string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log("\n━━━ MICM Demo User Seeder ━━━\n");

  // 1. Ensure domains are seeded
  const domainCount = await db.select().from(domainsTable);
  if (domainCount.length === 0) {
    console.error("No domains found. Run seed-domains first:\n  pnpm --filter @workspace/scripts run seed-domains");
    process.exit(1);
  }

  // 2. Get all criteria for score generation
  const allDomains = await db.select().from(domainsTable).orderBy(domainsTable.orderIndex);
  const allCategories = await db.select().from(categoriesTable);
  const allCriteria = await db.select().from(criteriaTable);
  console.log(`Loaded ${allDomains.length} domains, ${allCriteria.length} criteria`);

  // 3. Create or find demo company
  console.log(`\n── Company ──`);
  let [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.name, DEMO_COMPANY_NAME));

  if (!company) {
    [company] = await db
      .insert(companiesTable)
      .values({
        name: DEMO_COMPANY_NAME,
        sector: "Precision Engineering",
        size: "51-200",
        contactEmail: "info@acme-precision.demo",
        isActive: true,
      })
      .returning();
    console.log(`  ✓  Created company: ${company.name} (id=${company.id})`);
  } else {
    console.log(`  ↩  Company exists: ${company.name} (id=${company.id})`);
  }

  // 4. Create Clerk + DB users
  console.log(`\n── Users ──`);
  const createdDbUsers: Array<{ id: number; role: string; email: string }> = [];

  for (const demo of DEMO_USERS) {
    const clerkId = await createOrGetClerkUser(
      demo.email,
      demo.password,
      demo.firstName,
      demo.lastName
    );

    let [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkId));

    if (!dbUser) {
      [dbUser] = await db
        .insert(usersTable)
        .values({
          clerkUserId: clerkId,
          email: demo.email,
          firstName: demo.firstName,
          lastName: demo.lastName,
          role: demo.role,
          companyId: demo.role === "super_admin" ? null : company.id,
          isActive: true,
        })
        .returning();
      console.log(`  ✓  DB user created: ${demo.email} (role=${demo.role}, dbId=${dbUser.id})`);
    } else {
      // Ensure role and company are correct
      [dbUser] = await db
        .update(usersTable)
        .set({
          role: demo.role,
          companyId: demo.role === "super_admin" ? null : company.id,
          firstName: demo.firstName,
          lastName: demo.lastName,
        })
        .where(eq(usersTable.id, dbUser.id))
        .returning();
      console.log(`  ↩  DB user updated: ${demo.email} (role=${demo.role}, dbId=${dbUser.id})`);
    }
    createdDbUsers.push({ id: dbUser.id, role: demo.role, email: demo.email });
  }

  const adminUser = createdDbUsers.find((u) => u.role === "company_admin")!;
  const regularUser = createdDbUsers.find((u) => u.role === "company_user")!;

  // 5. Assessment cycles
  console.log(`\n── Assessment Cycles ──`);

  // Check if demo assessments already exist
  const existingCycles = await db
    .select()
    .from(assessmentCyclesTable)
    .where(eq(assessmentCyclesTable.companyId, company.id));

  if (existingCycles.length > 0) {
    console.log(`  ↩  ${existingCycles.length} assessment cycle(s) already exist – skipping data seed`);
    printCredentials();
    process.exit(0);
  }

  // Completed cycle – 2024 baseline
  const [cycle2024] = await db
    .insert(assessmentCyclesTable)
    .values({
      companyId: company.id,
      name: "2024 Baseline Assessment",
      description:
        "Initial MICM maturity baseline for Acme Precision Manufacturing. Covers all six domains.",
      status: "completed",
      startDate: new Date("2024-03-01"),
      endDate: new Date("2024-03-31"),
    })
    .returning();
  console.log(`  ✓  Created cycle: ${cycle2024.name} (completed)`);

  // Active cycle – 2025 Q1 review
  const [cycle2025] = await db
    .insert(assessmentCyclesTable)
    .values({
      companyId: company.id,
      name: "2025 Q1 Progress Review",
      description: "Six-month follow-up to measure progress against 2024 improvement actions.",
      status: "active",
      startDate: new Date("2025-01-06"),
      endDate: new Date("2025-03-28"),
    })
    .returning();
  console.log(`  ✓  Created cycle: ${cycle2025.name} (active)`);

  // Draft cycle
  const [cycleDraft] = await db
    .insert(assessmentCyclesTable)
    .values({
      companyId: company.id,
      name: "2025 Mid-Year Check",
      description: "Planned mid-year review – not yet started.",
      status: "draft",
    })
    .returning();
  console.log(`  ✓  Created cycle: ${cycleDraft.name} (draft)`);

  for (const cycle of [cycle2024, cycle2025, cycleDraft]) await createQuestionSnapshot(db, cycle.id);

  // 6. Assignees
  console.log(`\n── Assignees ──`);
  // Both company admin and user are assigned to the 2024 cycle (completed)
  await db.insert(assessmentAssigneesTable).values([
    {
      assessmentId: cycle2024.id,
      userId: adminUser.id,
      completedAt: new Date("2024-03-15"),
    },
    {
      assessmentId: cycle2024.id,
      userId: regularUser.id,
      completedAt: new Date("2024-03-18"),
    },
  ]);
  // Both assigned to active 2025 cycle
  await db.insert(assessmentAssigneesTable).values([
    { assessmentId: cycle2025.id, userId: adminUser.id },
    { assessmentId: cycle2025.id, userId: regularUser.id },
  ]);
  console.log(`  ✓  Assigned both users to 2024 (completed) and 2025 Q1 (active) cycles`);

  // 7. Scores for the completed 2024 cycle
  console.log(`\n── Scores (2024 Baseline) ──`);

  // Realistic scores per domain (0-4):
  // Strategy: developing (2.4), Control: weak (1.8), Leadership: developing (2.6)
  // Daily Mgmt: weak (2.0), Processes: developing (2.2), Innovation: critical (1.4)
  const domainScoreProfiles: Record<string, number[]> = {
    Strategy: [2, 3, 2, 2, 3],
    "Control and Compliance": [2, 1, 2, 2, 1],
    "Leadership and Culture": [3, 2, 3, 2, 3, 2],
    "Daily Management": [2, 2, 2, 2, 2],
    "Processes and Tools": [2, 2, 2, 1, 2, 2],
    Innovation: [1, 1, 2, 1, 1, 2],
  };

  const catToDomain: Record<number, number> = {};
  for (const cat of allCategories) catToDomain[cat.id] = cat.domainId;

  const domainNameMap: Record<number, string> = {};
  for (const d of allDomains) domainNameMap[d.id] = d.name;

  const scoreInserts = [];
  let scoreIdx = 0;
  for (const criterion of allCriteria) {
    const domainId = catToDomain[criterion.categoryId];
    const domainName = domainNameMap[domainId] ?? "Unknown";
    const profile = domainScoreProfiles[domainName] ?? [2, 2, 2, 2, 2];

    // Admin scores: match profile
    const adminScore = profile[scoreIdx % profile.length] ?? 2;
    // User scores: ±1 variation for realism
    const userScore = Math.max(0, Math.min(4, adminScore + (scoreIdx % 3 === 0 ? 1 : scoreIdx % 3 === 1 ? -1 : 0)));
    scoreIdx++;

    scoreInserts.push(
      { assessmentId: cycle2024.id, userId: adminUser.id, criterionId: criterion.id, score: adminScore, notes: null },
      { assessmentId: cycle2024.id, userId: regularUser.id, criterionId: criterion.id, score: userScore, notes: null }
    );
  }
  await db.insert(scoresTable).values(await attachQuestionReferences(db, scoreInserts));
  console.log(`  ✓  Inserted ${scoreInserts.length} scores for 2024 baseline`);

  // Partial scores for the active 2025 cycle (first 40% of criteria)
  const partial2025 = [];
  const partialCount = Math.floor(allCriteria.length * 0.4);
  for (let i = 0; i < partialCount; i++) {
    const criterion = allCriteria[i]!;
    const domainId = catToDomain[criterion.categoryId];
    const domainName = domainNameMap[domainId] ?? "Unknown";
    const profile = domainScoreProfiles[domainName] ?? [2, 2, 2, 2, 2];
    const baseScore = profile[i % profile.length] ?? 2;
    // Scores show slight improvement
    const improvedScore = Math.min(4, baseScore + 1);
    partial2025.push(
      { assessmentId: cycle2025.id, userId: adminUser.id, criterionId: criterion.id, score: improvedScore, notes: null }
    );
  }
  await db.insert(scoresTable).values(await attachQuestionReferences(db, partial2025));
  console.log(`  ✓  Inserted ${partial2025.length} partial scores for 2025 Q1 (in progress)`);

  // 8. Actions
  console.log(`\n── Actions ──`);

  const strategyDomain = allDomains.find((d) => d.name === "Strategy");
  const controlDomain = allDomains.find((d) => d.name === "Control and Compliance");
  const innovationDomain = allDomains.find((d) => d.name === "Innovation");
  const processDomain = allDomains.find((d) => d.name === "Processes and Tools");

  const sampleActions = [
    {
      title: "Define and document the 3-year business strategy",
      description: "Facilitate a leadership workshop to define vision, strategic goals and KPIs. Produce a one-page strategy document shared with all staff.",
      status: "in_progress",
      priority: "high",
      domainId: strategyDomain?.id,
      dueDate: new Date("2025-06-30"),
      assignedUserId: adminUser.id,
    },
    {
      title: "Implement ISO 9001 Quality Management System",
      description: "Engage a QMS consultant, conduct gap analysis and begin implementation towards certification.",
      status: "not_started",
      priority: "high",
      domainId: controlDomain?.id,
      dueDate: new Date("2025-12-31"),
      assignedUserId: adminUser.id,
    },
    {
      title: "Launch employee engagement survey",
      description: "Design and deploy a quarterly pulse survey using an online tool. Share results with all staff within 2 weeks.",
      status: "completed",
      priority: "medium",
      domainId: allDomains.find((d) => d.name === "Leadership and Culture")?.id,
      dueDate: new Date("2025-02-28"),
      assignedUserId: regularUser.id,
    },
    {
      title: "Introduce daily tier 1 huddle meetings on shop floor",
      description: "Establish a 15-minute daily meeting for each production team covering safety, quality, delivery and cost.",
      status: "in_progress",
      priority: "medium",
      domainId: allDomains.find((d) => d.name === "Daily Management")?.id,
      dueDate: new Date("2025-04-30"),
      assignedUserId: regularUser.id,
    },
    {
      title: "Map top 5 core business processes",
      description: "Conduct value stream mapping workshops for order-to-cash, procurement, and production planning.",
      status: "not_started",
      priority: "high",
      domainId: processDomain?.id,
      dueDate: new Date("2025-07-31"),
      assignedUserId: adminUser.id,
    },
    {
      title: "Develop an innovation ideas register",
      description: "Create a simple ideas log accessible to all staff. Review monthly at management meetings.",
      status: "not_started",
      priority: "low",
      domainId: innovationDomain?.id,
      dueDate: new Date("2025-05-31"),
      assignedUserId: regularUser.id,
    },
    {
      title: "Implement ERP system for production planning",
      description: "Evaluate 3 ERP solutions suitable for a 100-person precision engineering company. Present business case to board.",
      status: "on_hold",
      priority: "high",
      domainId: processDomain?.id,
      dueDate: new Date("2026-03-31"),
      assignedUserId: adminUser.id,
    },
  ] as const;

  for (const action of sampleActions) {
    await db.insert(actionsTable).values({
      companyId: company.id,
      assessmentId: cycle2024.id,
      domainId: action.domainId ?? null,
      title: action.title,
      description: action.description,
      status: action.status,
      priority: action.priority,
      assignedUserId: action.assignedUserId,
      dueDate: action.dueDate,
    });
  }
  console.log(`  ✓  Inserted ${sampleActions.length} improvement actions`);

  // 9. Summary
  printCredentials();
  process.exit(0);
}

function printCredentials() {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  MICM MATURITY HUB — DEMO CREDENTIALS
  ⚠  For testing only. Not suitable for production use.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Super Admin
  Email:    superadmin@micm-demo.com
  Password: MICMsuper1!
  Access:   Full platform — all companies, users, reports

  Company Admin  (Acme Precision Manufacturing Ltd)
  Email:    companyadmin@micm-demo.com
  Password: MICMadmin1!
  Access:   Manage company users, assessments, actions, reports

  Company User  (Acme Precision Manufacturing Ltd)
  Email:    companyuser@micm-demo.com
  Password: MICMuser1!
  Access:   Complete assigned assessments, view own actions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
