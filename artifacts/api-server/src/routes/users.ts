import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListCompanyUsersResponse,
  GetUserResponse,
  UpdateUserBody,
  GetUserParams,
  UpdateUserParams,
  ListCompanyUsersParams,
} from "@workspace/api-zod";
import { requireAuth } from "./auth";

const router: IRouter = Router();

function formatUser(u: any) {
  return {
    id: u.id,
    clerkUserId: u.clerkUserId,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    companyId: u.companyId,
    isActive: u.isActive,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
  };
}

// GET /companies/:id/users
router.get("/companies/:id/users", requireAuth, async (req: any, res): Promise<void> => {
  const params = ListCompanyUsersParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.companyId !== params.data.id)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.companyId, params.data.id)).orderBy(usersTable.email);
  res.json(ListCompanyUsersResponse.parse(users.map(formatUser)));
});

// GET /users/:id
router.get("/users/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Can only view if super_admin, same company admin, or self
  if (currentUser.role !== "super_admin" && currentUser.companyId !== user.companyId && currentUser.id !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(GetUserResponse.parse(formatUser(user)));
});

// PATCH /users/:id
router.patch("/users/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!targetUser) { res.status(404).json({ error: "User not found" }); return; }

  if (currentUser.role !== "super_admin" && !(currentUser.role === "company_admin" && currentUser.companyId === targetUser.companyId) && currentUser.id !== targetUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: any = {};
  if (parsed.data.firstName !== undefined) updates.firstName = parsed.data.firstName;
  if (parsed.data.lastName !== undefined) updates.lastName = parsed.data.lastName;
  if (parsed.data.role != null && currentUser.role === "super_admin") updates.role = parsed.data.role;
  if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, params.data.id)).returning();
  res.json(GetUserResponse.parse(formatUser(user)));
});

export default router;
