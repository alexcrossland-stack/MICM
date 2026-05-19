import { type ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser, UserButton } from "@clerk/react";
import { useCurrentUser } from "@/hooks/useAuth";
import { useTheme } from "./ThemeProvider";
import {
  LayoutDashboard,
  ClipboardList,
  Zap,
  Users,
  Building2,
  BarChart3,
  TrendingUp,
  Brain,
  ShieldCheck,
  Menu,
  X,
  Sun,
  Moon,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/", roles: ["super_admin", "company_admin", "company_user"] },
  { label: "Assessments", icon: ClipboardList, href: "/assessments", roles: ["super_admin", "company_admin", "company_user"] },
  { label: "Actions", icon: Zap, href: "/actions", roles: ["super_admin", "company_admin", "company_user"] },
  { label: "Analytics", icon: TrendingUp, href: "/analytics", roles: ["super_admin", "company_admin", "company_user"] },
  { label: "Reports", icon: BarChart3, href: "/reports", roles: ["super_admin", "company_admin"] },
  { label: "Users", icon: Users, href: "/users", roles: ["super_admin", "company_admin"] },
  { label: "Companies", icon: Building2, href: "/companies", roles: ["super_admin"] },
  { label: "Programme", icon: Brain, href: "/programme", roles: ["super_admin"] },
  { label: "Audit Logs", icon: ShieldCheck, href: "/audit-logs", roles: ["super_admin"] },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { role, companyName, isSuperAdmin } = useCurrentUser();
  const { theme, setTheme } = useTheme();

  const visibleNav = navItems.filter(n => !role || n.roles.includes(role));

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">M</div>
          <div>
            <div className="text-sm font-semibold text-sidebar-foreground leading-tight">MICM</div>
            <div className="text-xs text-sidebar-foreground/60 leading-tight">Elevator UK</div>
          </div>
        </div>
        {companyName && !isSuperAdmin && (
          <div className="mt-3 px-2 py-1.5 rounded-md bg-sidebar-accent text-xs text-sidebar-foreground/80 truncate">
            {companyName}
          </div>
        )}
        {isSuperAdmin && (
          <div className="mt-3 px-2 py-1.5 rounded-md bg-primary/20 text-xs text-primary font-medium">
            Super Admin
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleNav.map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-white shadow-sm"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
              {isActive && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <UserButton />
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-sidebar flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-sidebar flex flex-col">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 text-sidebar-foreground/60 hover:text-sidebar-foreground"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-card border-b border-border flex-shrink-0">
          <button onClick={() => setMobileOpen(true)} className="text-foreground/70">
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold">MICM Platform</span>
          <div className="ml-auto">
            <UserButton />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
