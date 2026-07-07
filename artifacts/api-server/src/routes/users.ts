import { Router, type IRouter } from "express";
import { createClerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { companiesTable, usersTable } from "@workspace/db";
import { and, count, eq } from "drizzle-orm";
import {
  ListUsersResponse,
  ListUsersQueryParams,
  ListCompanyUsersResponse,
  GetUserResponse,
  UpdateUserBody,
  GetUserParams,
  UpdateUserParams,
  ListCompanyUsersParams,
  TriggerUserPasswordResetParams,
} from "@workspace/api-zod";
import { requireAuth } from "./auth";
import { recordAuditEvent } from "../lib/audit";

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

async function getCurrentUser(req: any) {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  return currentUser;
}

async function hasAnotherActiveSuperAdmin(targetUserId: number) {
  const [result] = await db.select({ count: count() }).from(usersTable).where(and(
    eq(usersTable.role, "super_admin"),
    eq(usersTable.isActive, true),
  ));
  if (result.count > 1) return true;

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));
  return !(targetUser?.role === "super_admin" && targetUser.isActive);
}

async function companyExists(companyId: number) {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
  return Boolean(company);
}

function isRemovingSuperAdminAccess(targetUser: any, updates: Record<string, unknown>) {
  if (targetUser.role !== "super_admin" || !targetUser.isActive) return false;
  if (updates.isActive === false) return true;
  if (typeof updates.role === "string" && updates.role !== "super_admin") return true;
  if (updates.companyId != null) return true;
  return false;
}

// GET /users
router.get("/users", requireAuth, async (req: any, res): Promise<void> => {
  const queryParams = ListUsersQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }

  const currentUser = await getCurrentUser(req);
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "company_admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const filters = [];
  if (currentUser.role === "company_admin") {
    if (!currentUser.companyId) { res.status(403).json({ error: "Forbidden" }); return; }
    filters.push(eq(usersTable.companyId, currentUser.companyId));
  } else if (queryParams.data.companyId != null) {
    filters.push(eq(usersTable.companyId, queryParams.data.companyId));
  }
  if (queryParams.data.role != null) filters.push(eq(usersTable.role, queryParams.data.role));
  if (queryParams.data.isActive != null) filters.push(eq(usersTable.isActive, queryParams.data.isActive));

  const users = filters.length > 0
    ? await db.select().from(usersTable).where(and(...filters)).orderBy(usersTable.email)
    : await db.select().from(usersTable).orderBy(usersTable.email);

  res.json(ListUsersResponse.parse(users.map(formatUser)));
});

// GET /companies/:id/users
router.get("/companies/:id/users", requireAuth, async (req: any, res): Promise<void> => {
  const params = ListCompanyUsersParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const currentUser = await getCurrentUser(req);
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

  const currentUser = await getCurrentUser(req);
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

  const currentUser = await getCurrentUser(req);
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
  if (currentUser.role === "super_admin") {
    if (parsed.data.role != null) updates.role = parsed.data.role;
    if (Object.prototype.hasOwnProperty.call(parsed.data, "companyId")) updates.companyId = parsed.data.companyId ?? null;
    if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
  } else if (currentUser.role === "company_admin") {
    if (parsed.data.isActive != null && targetUser.role !== "super_admin" && targetUser.id !== currentUser.id) {
      updates.isActive = parsed.data.isActive;
    }
  }

  const effectiveRole = updates.role ?? targetUser.role;
  const effectiveCompanyId = Object.prototype.hasOwnProperty.call(updates, "companyId")
    ? updates.companyId
    : targetUser.companyId;

  if (effectiveRole === "super_admin") {
    updates.companyId = null;
  } else if (currentUser.role === "super_admin") {
    if (effectiveCompanyId == null) {
      res.status(400).json({ error: "companyId is required for company-scoped users" });
      return;
    }
    if (!(await companyExists(effectiveCompanyId))) {
      res.status(400).json({ error: "Company not found" });
      return;
    }
  }

  if (isRemovingSuperAdminAccess(targetUser, updates) && !(await hasAnotherActiveSuperAdmin(targetUser.id))) {
    res.status(400).json({ error: "Cannot remove the final active Super Admin" });
    return;
  }

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, params.data.id)).returning();
  if (updates.role != null && targetUser.role !== user.role) {
    await recordAuditEvent(req, {
      currentUser,
      eventType: "user.role_changed",
      companyId: user.companyId ?? targetUser.companyId ?? null,
      targetType: "user",
      targetId: user.id,
      metadata: {
        previousRole: targetUser.role,
        nextRole: user.role,
      },
    });
  }
  if (Object.prototype.hasOwnProperty.call(updates, "companyId") && targetUser.companyId !== user.companyId) {
    await recordAuditEvent(req, {
      currentUser,
      eventType: "user.company_changed",
      companyId: user.companyId ?? targetUser.companyId ?? null,
      targetType: "user",
      targetId: user.id,
      metadata: {
        previousCompanyId: targetUser.companyId,
        nextCompanyId: user.companyId,
      },
    });
  }
  if (Object.prototype.hasOwnProperty.call(updates, "isActive") && targetUser.isActive !== user.isActive) {
    await recordAuditEvent(req, {
      currentUser,
      eventType: user.isActive ? "user.activated" : "user.deactivated",
      companyId: user.companyId ?? targetUser.companyId ?? null,
      targetType: "user",
      targetId: user.id,
      metadata: {
        previousIsActive: targetUser.isActive,
        nextIsActive: user.isActive,
      },
    });
  }
  res.json(GetUserResponse.parse(formatUser(user)));
});

router.post("/users/:id/password-reset", requireAuth, async (req: any, res): Promise<void> => {
  const params = TriggerUserPasswordResetParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const currentUser = await getCurrentUser(req);
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "company_admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!targetUser) { res.status(404).json({ error: "User not found" }); return; }
  if (currentUser.role !== "super_admin" && currentUser.companyId !== targetUser.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (targetUser.role === "super_admin" && currentUser.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const clerkSecretKey = process.env["CLERK_SECRET_KEY"];
  if (!clerkSecretKey) {
    res.status(503).json({ error: "Clerk secret key is not configured" });
    return;
  }

  const baseUrl = process.env["PUBLIC_APP_URL"] || process.env["APP_URL"] || process.env["BASE_URL"];
  const redirectUrl = baseUrl ? new URL("/sign-in", baseUrl).toString() : undefined;
  const clerk = createClerkClient({ secretKey: clerkSecretKey });
  try {
    await clerk.invitations.createInvitation({
      emailAddress: targetUser.email,
      ignoreExisting: true,
      notify: true,
      redirectUrl,
    });
  } catch (error) {
    req.log?.warn({ err: error, targetUserId: targetUser.id }, "Failed to request Clerk password setup email");
    res.status(502).json({ error: "Failed to request password setup email" });
    return;
  }

  await recordAuditEvent(req, {
    currentUser,
    eventType: "user.password_setup_requested",
    companyId: targetUser.companyId ?? null,
    targetType: "user",
    targetId: targetUser.id,
    metadata: {
      provider: "clerk",
      hasEmail: Boolean(targetUser.email),
    },
  });

  res.status(202).json({
    userId: targetUser.id,
    email: targetUser.email,
    provider: "clerk",
    status: "requested",
  });
});

export default router;
