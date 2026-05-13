/**
 * Demo-only routes — disabled unless explicitly enabled outside production.
 * Provides one-click sign-in tokens for the three pre-seeded demo accounts,
 * allowing testers to bypass the email-verification step that Clerk enforces
 * in development mode.  These endpoints must NEVER be reachable in production.
 */

import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router: IRouter = Router();

const DEMO_USERS: Record<string, { email: string; label: string; role: string }> = {
  super_admin: {
    email: "superadmin.demo@micm.local",
    label: "Super Admin",
    role: "super_admin",
  },
  company_admin: {
    email: "companyadmin.demo@micm.local",
    label: "Company Admin",
    role: "company_admin",
  },
  company_user: {
    email: "companyuser.demo@micm.local",
    label: "Company User",
    role: "company_user",
  },
};

function isDemoAuthEnabled() {
  return process.env["NODE_ENV"] !== "production" && process.env["ENABLE_DEMO_AUTH"] === "true";
}

router.get("/demo/status", (_req, res): void => {
  if (!isDemoAuthEnabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    enabled: true,
    label: "Development / Staging Demo Access",
    roles: Object.keys(DEMO_USERS),
  });
});

// POST /api/demo/sign-in-token
// Returns a short-lived Clerk sign-in token for a demo account.
// The client redirects to /sign-in?__clerk_ticket=<token> and Clerk's
// frontend SDK completes the session without any further verification.
router.post("/demo/sign-in-token", async (req: any, res): Promise<void> => {
  if (!isDemoAuthEnabled()) {
    // Return a generic 404 so the endpoint is invisible when disabled.
    res.status(404).json({ error: "Not found" });
    return;
  }

  const role = req.body?.role as string | undefined;
  const demo = role ? DEMO_USERS[role] : undefined;

  if (!demo) {
    res.status(400).json({
      error: "Invalid role. Must be super_admin, company_admin, or company_user.",
    });
    return;
  }

  const [demoUser] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.email, demo.email),
        eq(usersTable.role, demo.role),
        eq(usersTable.isActive, true),
      ),
    );

  if (!demoUser) {
    res.status(404).json({ error: "Demo user not found. Run staging demo seed first." });
    return;
  }

  const clerkSecret = process.env["CLERK_SECRET_KEY"];
  if (!clerkSecret) {
    req.log.error("CLERK_SECRET_KEY not set — cannot create demo sign-in token");
    res.status(500).json({ error: "Server configuration error" });
    return;
  }

  const tokenRes = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clerkSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: demoUser.clerkUserId,
      expires_in_seconds: 300, // 5 minutes — short window for demo use
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    req.log.error({ status: tokenRes.status, err: errText }, "Clerk sign-in token creation failed");
    res.status(502).json({ error: "Failed to create sign-in token" });
    return;
  }

  const tokenData = (await tokenRes.json()) as { token: string; url: string };

  // Return the raw token — the client appends it to the local /sign-in URL
  // so the user stays on the app domain throughout the flow.
  res.json({ token: tokenData.token, label: demo.label });
});

export default router;
