import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, useAuth, useUser } from "@clerk/react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import CompanyInfoPage from "@/pages/CompanyInfo";
import AssessmentsPage from "@/pages/Assessments";
import AssessmentDetailPage from "@/pages/AssessmentDetail";
import TakeAssessmentPage from "@/pages/TakeAssessment";
import ActionsPage from "@/pages/Actions";
import UsersPage from "@/pages/Users";
import CompaniesPage from "@/pages/Companies";
import ReportsPage from "@/pages/Reports";
import OnboardingPage from "@/pages/Onboarding";
import AnalyticsPage from "@/pages/Analytics";
import ProgrammePage from "@/pages/Programme";
import AuditLogsPage from "@/pages/AuditLogs";
import AppShell from "@/components/AppShell";
import DemoCredentials from "@/components/DemoCredentials";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

// In production, VITE_CLERK_PROXY_URL is set automatically; in dev it's empty (Clerk loads from CDN)
const clerkProxyUrl = (import.meta.env.VITE_CLERK_PROXY_URL as string) || undefined;

// Configure the API client base URL.
// Generated hooks already have /api hardcoded in their paths (from orval baseUrl config),
// so we only pass the sub-path prefix if the app is mounted at a non-root path.
// Passing /api here would double-prefix every request → /api/api/…
setBaseUrl(BASE || null);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
    },
  },
});

function stripBase(path: string): string {
  return BASE && path.startsWith(BASE)
    ? path.slice(BASE.length) || "/"
    : path;
}

function TokenSync() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}

function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-0">
      <SignIn routing="path" path={`${BASE}/sign-in`} signUpUrl={`${BASE}/sign-up`} />
      <DemoCredentials />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <SignUp routing="path" path={`${BASE}/sign-up`} signInUrl={`${BASE}/sign-in`} />
    </div>
  );
}

function ProtectedRoutes() {
  const { isSignedIn, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Redirect to="/sign-in" />;
  }

  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/info" component={CompanyInfoPage} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/assessments" component={AssessmentsPage} />
        <Route path="/assessments/:id/take" component={TakeAssessmentPage} />
        <Route path="/assessments/:id" component={AssessmentDetailPage} />
        <Route path="/actions" component={ActionsPage} />
        <Route path="/users" component={UsersPage} />
        <Route path="/companies" component={CompaniesPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/programme" component={ProgrammePage} />
        <Route path="/audit-logs" component={AuditLogsPage} />
        <Route path="/onboarding" component={OnboardingPage} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route component={ProtectedRoutes} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${BASE}/sign-in`}
      signUpUrl={`${BASE}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <TokenSync />
            <AppRoutes />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={BASE}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
