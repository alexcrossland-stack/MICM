import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, actionsTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import {
  ListActionsResponse,
  CreateActionBody,
  GetActionParams,
  GetActionResponse,
  UpdateActionParams,
  UpdateActionBody,
  DeleteActionParams,
  GetActionsSummaryResponse,
  ListActionsQueryParams,
  GetActionsSummaryQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "./auth";

const router: IRouter = Router();

function formatAction(a: any) {
  return {
    id: a.id,
    companyId: a.companyId,
    assessmentId: a.assessmentId,
    domainId: a.domainId,
    title: a.title,
    description: a.description,
    status: a.status,
    priority: a.priority,
    assignedUserId: a.assignedUserId,
    dueDate: a.dueDate instanceof Date ? a.dueDate.toISOString() : a.dueDate,
    completedDate: a.completedDate instanceof Date ? a.completedDate.toISOString() : a.completedDate,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    updatedAt: a.updatedAt instanceof Date ? a.updatedAt.toISOString() : a.updatedAt,
  };
}

// GET /actions/summary
router.get("/actions/summary", requireAuth, async (req: any, res): Promise<void> => {
  const queryParams = GetActionsSummaryQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const companyId = queryParams.data.companyId;
  const actions = await db.select().from(actionsTable).where(eq(actionsTable.companyId, companyId));

  const summary = {
    companyId,
    notStarted: actions.filter(a => a.status === "not_started").length,
    inProgress: actions.filter(a => a.status === "in_progress").length,
    completed: actions.filter(a => a.status === "completed").length,
    onHold: actions.filter(a => a.status === "on_hold").length,
    total: actions.length,
  };

  res.json(GetActionsSummaryResponse.parse(summary));
});

// GET /actions
router.get("/actions", requireAuth, async (req: any, res): Promise<void> => {
  const queryParams = ListActionsQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  let actions;
  if (currentUser.role === "super_admin" && queryParams.data.companyId) {
    actions = await db.select().from(actionsTable).where(eq(actionsTable.companyId, queryParams.data.companyId));
  } else if (currentUser.companyId) {
    actions = await db.select().from(actionsTable).where(eq(actionsTable.companyId, currentUser.companyId));
  } else {
    actions = [];
  }

  if (queryParams.data.assignedUserId) {
    actions = (actions as any[]).filter((a: any) => a.assignedUserId === queryParams.data.assignedUserId);
  }
  if (queryParams.data.status) {
    actions = (actions as any[]).filter((a: any) => a.status === queryParams.data.status);
  }

  res.json(ListActionsResponse.parse((actions as any[]).map(formatAction)));
});

// POST /actions
router.post("/actions", requireAuth, async (req: any, res): Promise<void> => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "company_admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateActionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [action] = await db.insert(actionsTable).values({
    companyId: parsed.data.companyId,
    assessmentId: parsed.data.assessmentId,
    domainId: parsed.data.domainId,
    title: parsed.data.title,
    description: parsed.data.description,
    priority: parsed.data.priority,
    assignedUserId: parsed.data.assignedUserId,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
  }).returning();

  res.status(201).json(GetActionResponse.parse(formatAction(action)));
});

// GET /actions/:id
router.get("/actions/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = GetActionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [action] = await db.select().from(actionsTable).where(eq(actionsTable.id, params.data.id));
  if (!action) { res.status(404).json({ error: "Action not found" }); return; }

  res.json(GetActionResponse.parse(formatAction(action)));
});

// PATCH /actions/:id
router.patch("/actions/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = UpdateActionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = UpdateActionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: any = {};
  if (parsed.data.title != null) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.status != null) updates.status = parsed.data.status;
  if (parsed.data.priority != null) updates.priority = parsed.data.priority;
  if (parsed.data.assignedUserId !== undefined) updates.assignedUserId = parsed.data.assignedUserId;
  if (parsed.data.dueDate !== undefined) updates.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  if (parsed.data.completedDate !== undefined) updates.completedDate = parsed.data.completedDate ? new Date(parsed.data.completedDate) : null;

  const [action] = await db.update(actionsTable).set(updates).where(eq(actionsTable.id, params.data.id)).returning();
  if (!action) { res.status(404).json({ error: "Action not found" }); return; }
  res.json(GetActionResponse.parse(formatAction(action)));
});

// DELETE /actions/:id
router.delete("/actions/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = DeleteActionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "company_admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(actionsTable).where(eq(actionsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
