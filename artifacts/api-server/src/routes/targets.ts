import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { maturityTargetsTable, domainsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "./auth";
import { ListTargetsQueryParams, UpsertTargetParams, UpsertTargetBody } from "@workspace/api-zod";

const router: IRouter = Router();

function formatTarget(t: any, domainName: string) {
  return {
    id: t.id,
    companyId: t.companyId,
    domainId: t.domainId,
    domainName,
    targetScore: t.targetScore,
    targetDate: t.targetDate instanceof Date ? t.targetDate.toISOString() : (t.targetDate ?? null),
    notes: t.notes ?? null,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
  };
}

// GET /targets
router.get("/targets", requireAuth, async (req: any, res): Promise<void> => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(403).json({ error: "Forbidden" }); return; }

  const query = ListTargetsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }

  let companyId: number | undefined = query.data.companyId;
  if (currentUser.role !== "super_admin") {
    companyId = currentUser.companyId ?? undefined;
  }
  if (!companyId) { res.status(400).json({ error: "companyId is required" }); return; }

  const targets = await db.select().from(maturityTargetsTable).where(eq(maturityTargetsTable.companyId, companyId));
  const domains = await db.select().from(domainsTable);
  const domainMap: Record<number, string> = Object.fromEntries(domains.map((d) => [d.id, d.name]));

  res.json(targets.map((t) => formatTarget(t, domainMap[t.domainId] ?? "Unknown")));
});

// PUT /targets/:companyId/:domainId
router.put("/targets/:companyId/:domainId", requireAuth, async (req: any, res): Promise<void> => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(403).json({ error: "Forbidden" }); return; }

  const path = UpsertTargetParams.safeParse(req.params);
  if (!path.success) { res.status(400).json({ error: "Invalid path params" }); return; }

  const body = UpsertTargetBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { companyId, domainId } = path.data;

  if (currentUser.role !== "super_admin") {
    if (currentUser.role !== "company_admin" || currentUser.companyId !== companyId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  const [domain] = await db.select().from(domainsTable).where(eq(domainsTable.id, domainId));
  if (!domain) { res.status(404).json({ error: "Domain not found" }); return; }

  const targetDate = body.data.targetDate ? new Date(body.data.targetDate) : null;

  const [result] = await db
    .insert(maturityTargetsTable)
    .values({
      companyId,
      domainId,
      targetScore: body.data.targetScore,
      targetDate: targetDate ?? undefined,
      notes: body.data.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [maturityTargetsTable.companyId, maturityTargetsTable.domainId],
      set: {
        targetScore: body.data.targetScore,
        targetDate: targetDate ?? undefined,
        notes: body.data.notes ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(formatTarget(result, domain.name));
});

export default router;
