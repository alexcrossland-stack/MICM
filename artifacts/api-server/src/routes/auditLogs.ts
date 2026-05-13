import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { auditLogsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListAuditLogsQueryParams,
  ListAuditLogsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "./auth";

const router: IRouter = Router();

function formatAuditLog(log: any) {
  return {
    id: log.id,
    actorUserId: log.actorUserId ?? null,
    actorClerkUserId: log.actorClerkUserId ?? null,
    actorRole: log.actorRole ?? null,
    companyId: log.companyId ?? null,
    eventType: log.eventType,
    targetType: log.targetType,
    targetId: log.targetId,
    metadata: log.metadata ?? {},
    createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
  };
}

// GET /audit-logs - Super Admin only
router.get("/audit-logs", requireAuth, async (req: any, res): Promise<void> => {
  const query = ListAuditLogsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || currentUser.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const rows = query.data.companyId != null
    ? await db.select().from(auditLogsTable).where(eq(auditLogsTable.companyId, query.data.companyId))
    : await db.select().from(auditLogsTable);

  const filtered = rows
    .filter((log: any) => !query.data.eventType || log.eventType === query.data.eventType)
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, query.data.limit ?? 100)
    .map(formatAuditLog);

  res.json(ListAuditLogsResponse.parse(filtered));
});

export default router;
