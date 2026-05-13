import { useState } from "react";
import { useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { ChevronDown, ChevronUp, ShieldAlert, LogIn, Loader2 } from "lucide-react";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const isDemoAuthEnabled =
  import.meta.env.VITE_ENABLE_DEMO_AUTH === "true" && !import.meta.env.PROD;

const DEMO_ACCOUNTS = [
  {
    role: "super_admin",
    label: "Super Admin",
    email: "superadmin.demo@micm.local",
    description: "Global staging access — all seeded companies and reports",
    color: "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800",
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
    btnColor: "bg-purple-600 hover:bg-purple-700 text-white",
  },
  {
    role: "company_admin",
    label: "Company Admin",
    email: "companyadmin.demo@micm.local",
    description: "Northstar demo company — manage assessments and exports",
    color: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    btnColor: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  {
    role: "company_user",
    label: "Company User",
    email: "companyuser.demo@micm.local",
    description: "Northstar demo company — assigned assessments only",
    color: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
    badge: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
    btnColor: "bg-green-600 hover:bg-green-700 text-white",
  },
];

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
      title="Copy to clipboard"
    >
      {copied ? "✓" : "copy"}
    </button>
  );
}

function QuickSignInButton({ role, btnColor }: { role: string; btnColor: string }) {
  // Use the classic Clerk flow via useClerk() — it gives us the fully-loaded Clerk
  // instance with `client.signIn.create()` (returns a concrete SignInResource with
  // .status and .createdSessionId on the resolved promise) and `setActive()`.
  // This avoids the Signals-based `useSignIn().signIn` whose reactive `.status`
  // can be stale inside a closure right after `await ticket()`.
  const clerk = useClerk();
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      // Step 1 — get a short-lived Clerk sign-in token from the dev-only backend endpoint
      const res = await fetch(`${BASE}/api/demo/sign-in-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Server error ${res.status}`);
      }
      const { token } = (await res.json()) as { token: string };

      // Step 2 — get the sign-in resource off the Clerk client and create a sign-in
      // attempt with the ticket strategy. This bypasses the email-code first factor.
      const signInResource = clerk.client?.signIn;
      if (!signInResource) throw new Error("Clerk client not ready — please retry");

      const result = await signInResource.create({
        strategy: "ticket",
        ticket: token,
      });

      if (result.status !== "complete" || !result.createdSessionId) {
        throw new Error(
          `Sign-in did not complete (status=${result.status ?? "unknown"})`,
        );
      }

      // Step 3 — activate the new session on the Clerk instance. This sets the
      // session cookie and updates all reactive Clerk hooks.
      await clerk.setActive({ session: result.createdSessionId });

      // Step 4 — navigate to the dashboard.
      navigate("/");
    } catch (e: any) {
      // Surface the most informative message Clerk gives us.
      const errors = e?.errors as Array<{ message?: string; longMessage?: string }> | undefined;
      const detail =
        errors?.[0]?.longMessage ?? errors?.[0]?.message ?? e?.message ?? "Something went wrong";
      console.error("[demo sign-in] failed:", e);
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2">
      <button
        onClick={handleSignIn}
        disabled={loading}
        className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-60 ${btnColor}`}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <LogIn className="w-3 h-3" />
        )}
        {loading ? "Signing in…" : "Sign in instantly"}
      </button>
      {error && (
        <p className="text-xs text-red-600 mt-1 text-center leading-snug">{error}</p>
      )}
    </div>
  );
}

export default function DemoCredentials() {
  const [open, setOpen] = useState(false);

  if (!isDemoAuthEnabled) return null;

  return (
    <div className="w-full max-w-sm mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5" />
          Development / Staging Demo Access
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {DEMO_ACCOUNTS.map((account) => (
            <div
              key={account.email}
              className={`rounded-lg border p-3 text-xs ${account.color}`}
            >
              <div className="flex items-center justify-between mb-2 gap-2">
                <span
                  className={`font-semibold px-1.5 py-0.5 rounded text-xs shrink-0 ${account.badge}`}
                >
                  {account.label}
                </span>
                <span className="text-muted-foreground text-xs text-right leading-snug">
                  {account.description}
                </span>
              </div>
              <div className="space-y-0.5 mb-2">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground w-14 shrink-0">Email</span>
                  <code className="font-mono text-xs">{account.email}</code>
                  <CopyButton value={account.email} />
                </div>
              </div>
              <QuickSignInButton role={account.role} btnColor={account.btnColor} />
            </div>
          ))}
          <p className="text-xs text-muted-foreground text-center pt-1">
            One-click access is enabled only outside production when demo auth is explicitly enabled.
          </p>
        </div>
      )}
    </div>
  );
}
