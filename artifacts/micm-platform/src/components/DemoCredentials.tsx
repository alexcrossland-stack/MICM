import { useState } from "react";
import { ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";

const DEMO_ACCOUNTS = [
  {
    label: "Super Admin",
    email: "superadmin@micm-demo.com",
    password: "MICMsuper1!",
    description: "Full platform access — all companies and reports",
    color: "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800",
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  },
  {
    label: "Company Admin",
    email: "companyadmin@micm-demo.com",
    password: "MICMadmin1!",
    description: "Acme Precision Mfg — manage users, assessments & actions",
    color: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  },
  {
    label: "Company User",
    email: "companyuser@micm-demo.com",
    password: "MICMuser1!",
    description: "Acme Precision Mfg — complete assessments and view actions",
    color: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
    badge: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
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
          Demo test accounts available
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
              <div className="flex items-center justify-between mb-1.5">
                <span className={`font-semibold px-1.5 py-0.5 rounded text-xs ${account.badge}`}>
                  {account.label}
                </span>
                <span className="text-muted-foreground text-xs">{account.description}</span>
              </div>
              <div className="space-y-0.5">
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
