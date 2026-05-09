/**
 * Demo-only routes — disabled entirely in production.
 * Provides one-click sign-in tokens for the three pre-seeded demo accounts,
 * allowing testers to bypass the email-verification step that Clerk enforces
 * in development mode.  These endpoints must NEVER be reachable in production.
 */

import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Hard-coded allowlist: only the three known demo Clerk user IDs are accepted.
// A tester cannot escalate to any other account by guessing IDs.
const DEMO_USERS: Record<string, { clerkId: string; label: string }> = {
  super_admin: {
    clerkId: "user_3DTlXz9MsUN7QBW4nYYamjVGtpa",
    label: "Super Admin",
  },
  company_admin: {
    clerkId: "user_3DTlXu13Gzwq1WFbHomw76u0Dqm",
    label: "Company Admin",
  },
  company_user: {
    clerkId: "user_3DTlXx3xjPlE7QMPnyFQYm8QFe0",
    label: "Company User",
  },
};

const IS_PRODUCTION = process.env["NODE_ENV"] === "production";

// POST /api/demo/sign-in-token
// Returns a short-lived Clerk sign-in token for a demo account.
// The client redirects to /sign-in?__clerk_ticket=<token> and Clerk's
// frontend SDK completes the session without any further verification.
router.post("/demo/sign-in-token", async (req: any, res): Promise<void> => {
  if (IS_PRODUCTION) {
    // Return a generic 404 so the endpoint is invisible in production.
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
      user_id: demo.clerkId,
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
