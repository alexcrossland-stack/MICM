import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetMeResponse, GetMyRoleResponse } from "@workspace/api-zod";

const router: IRouter = Router();

export const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.clerkUserId = userId;
  next();
};

router.get("/users/me", requireAuth, async (req: any, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, req.clerkUserId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(GetMeResponse.parse({
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    companyId: user.companyId,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  }));
});

router.get("/users/me/role", requireAuth, async (req: any, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, req.clerkUserId));

  if (!user) {
    // Auto-create user if not in DB (first login)
    res.status(404).json({ error: "User not found. Please complete onboarding." });
    return;
  }

  let companyName: string | null = null;
  if (user.companyId) {
    const { companiesTable } = await import("@workspace/db");
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, user.companyId));
    companyName = company?.name ?? null;
  }

  res.json(GetMyRoleResponse.parse({
    userId: user.id,
    role: user.role,
    companyId: user.companyId,
    companyName,
  }));
});

export default router;
