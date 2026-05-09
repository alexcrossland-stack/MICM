import { useState } from "react";
import { ChevronDown, ChevronUp, ShieldAlert, LogIn, Loader2 } from "lucide-react";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

const DEMO_ACCOUNTS = [
  {
    role: "super_admin",
    label: "Super Admin",
    email: "superadmin@micm-demo.com",
    password: "MICMsuper1!",
    description: "Full platform access — all companies and reports",
    color: "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800",
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
    btnColor: "bg-purple-600 hover:bg-purple-700 text-white",
  },
  {
    role: "company_admin",
    label: "Company Admin",
    email: "companyadmin@micm-demo.com",
    password: "MICMadmin1!",
    description: "Acme Precision Mfg — manage users, assessments & actions",
    color: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    btnColor: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  {
    role: "company_user",
    label: "Company User",
    email: "companyuser@micm-demo.com",
    password: "MICMuser1!",
    description: "Acme Precision Mfg — complete assessments and view actions",
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/demo/sign-in-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to create sign-in token");
      }
      const { token } = await res.json() as { token: string };
      // Navigate to /sign-in with the Clerk ticket — Clerk's SDK
      // detects __clerk_ticket in the URL and completes sign-in automatically.
      window.location.href = `${window.location.origin}${BASE}/sign-in?__clerk_ticket=${token}`;
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
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
      {error && <p className="text-xs text-red-600 mt-1 text-center">{error}</p>}
    </div>
  );
}

export default function DemoCredentials() {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full max-w-sm mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5" />
          Demo test accounts — click to expand
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
              <div className="flex items-center justify-between mb-2">
                <span className={`font-semibold px-1.5 py-0.5 rounded text-xs ${account.badge}`}>
                  {account.label}
                </span>
                <span className="text-muted-foreground text-xs">{account.description}</span>
              </div>
              <div className="space-y-0.5 mb-2">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground w-14">Email</span>
                  <code className="font-mono">{account.email}</code>
                  <CopyButton value={account.email} />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground w-14">Password</span>
                  <code className="font-mono">{account.password}</code>
                  <CopyButton value={account.password} />
                </div>
              </div>
              <QuickSignInButton role={account.role} btnColor={account.btnColor} />
            </div>
          ))}
          <p className="text-xs text-muted-foreground text-center pt-1">
            For testing only — not for production use
          </p>
        </div>
      )}
    </div>
  );
}
