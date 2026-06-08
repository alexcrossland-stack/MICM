import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { invitationsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  ListInvitationsResponse,
  CreateInvitationBody,
  AcceptInvitationBody,
  AcceptInvitationResponse,
  ListInvitationsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "./auth";
import { recordAuditEvent } from "../lib/audit";

const router: IRouter = Router();

function formatInvitation(inv: any) {
  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    companyId: inv.companyId,
    token: inv.token,
    status: inv.status,
    createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : inv.createdAt,
    expiresAt: inv.expiresAt instanceof Date ? inv.expiresAt.toISOString() : inv.expiresAt,
  };
}

// GET /invitations
router.get("/invitations", requireAuth, async (req: any, res): Promise<void> => {
  const queryParams = ListInvitationsQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const companyId = queryParams.data.companyId;
  let invitations;
  if (currentUser.role === "super_admin") {
    invitations = companyId
      ? await db.select().from(invitationsTable).where(eq(invitationsTable.companyId, companyId))
      : await db.select().from(invitationsTable);
  } else {
    if (!currentUser.companyId) { res.status(403).json({ error: "Forbidden" }); return; }
    invitations = await db.select().from(invitationsTable).where(eq(invitationsTable.companyId, currentUser.companyId));
  }

  res.json(ListInvitationsResponse.parse(invitations.map(formatInvitation)));
});

// POST /invitations
router.post("/invitations", requireAuth, async (req: any, res): Promise<void> => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "company_admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = CreateInvitationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.role === "super_admin" && currentUser.role !== "super_admin") {
    res.status(403).json({ error: "Only Super Admins can invite Super Admin users" });
    return;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const companyId = parsed.data.role === "super_admin"
    ? null
    : currentUser.role === "super_admin"
      ? parsed.data.companyId ?? null
      : currentUser.companyId;

  if (parsed.data.role !== "super_admin" && companyId == null) {
    res.status(400).json({ error: "Company is required for Company Admin and Company User invitations" });
    return;
  }

  const [invitation] = await db.insert(invitationsTable).values({
    email: parsed.data.email,
    role: parsed.data.role,
    companyId,
    token,
    status: "pending",
    invitedById: currentUser.id,
    expiresAt,
  }).returning();

  await recordAuditEvent(req, {
    currentUser,
    eventType: "invitation.created",
    companyId,
    targetType: "invitation",
    targetId: invitation.id,
    metadata: {
      role: invitation.role,
      status: invitation.status,
      hasEmail: Boolean(invitation.email),
    },
  });

  res.status(201).json(formatInvitation(invitation));
});

// POST /invitations/accept
router.post("/invitations/accept", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = AcceptInvitationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [invitation] = await db.select().from(invitationsTable).where(eq(invitationsTable.token, parsed.data.token));
  if (!invitation) { res.status(404).json({ error: "Invitation not found" }); return; }
  if (invitation.status !== "pending") { res.status(400).json({ error: "Invitation already used or expired" }); return; }
  if (new Date(invitation.expiresAt) < new Date()) { res.status(400).json({ error: "Invitation has expired" }); return; }

  // Get Clerk user info
  const auth = req as any;
  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, auth.clerkUserId));

  let user;
  if (existingUser) {
    // Update role and company
    [user] = await db.update(usersTable)
      .set({ role: invitation.role, companyId: invitation.companyId })
      .where(eq(usersTable.id, existingUser.id))
      .returning();
  } else {
    [user] = await db.insert(usersTable).values({
      clerkUserId: auth.clerkUserId,
      email: invitation.email,
      role: invitation.role,
      companyId: invitation.companyId,
      isActive: true,
    }).returning();
  }

  // Mark invitation as accepted
  await db.update(invitationsTable).set({ status: "accepted" }).where(eq(invitationsTable.id, invitation.id));
  await recordAuditEvent(req, {
    currentUser: user,
    eventType: "invitation.accepted",
    companyId: invitation.companyId,
    targetType: "invitation",
    targetId: invitation.id,
    metadata: {
      role: invitation.role,
      createdUser: !existingUser,
    },
  });

  res.json(AcceptInvitationResponse.parse({
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    companyId: user.companyId,
    isActive: user.isActive,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
  }));
});

export default router;
