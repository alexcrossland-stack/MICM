import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SmokeRole = "super_admin" | "company_admin" | "company_user";

const smokeState = vi.hoisted(() => ({
  path: "/",
  assessmentId: "101",
  currentUser: {
    isLoaded: true,
    isSignedIn: true,
    role: "company_admin" as SmokeRole,
    companyId: 1,
    companyName: "Acme Precision",
    userId: 2,
    isSuperAdmin: false,
    isCompanyAdmin: true,
    isCompanyUser: false,
    getToken: async () => "frontend-smoke-token",
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useCurrentUser: () => smokeState.currentUser,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: () => undefined }),
}));

vi.mock("@/lib/queryClient", () => ({
  getApiUrl: (path: string) => `/api${path}`,
}));

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({ theme: "light", setTheme: () => undefined }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { id: "test-user" }, isLoaded: true, isSignedIn: true }),
  UserButton: () => React.createElement("span", null, "User menu"),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: any) => React.createElement("a", { href, ...props }, children),
  useLocation: () => [smokeState.path, (path: string) => { smokeState.path = path; }],
  useRoute: () => [true, { id: smokeState.assessmentId }],
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: () => undefined }),
  };
});

vi.mock("recharts", () => {
  function Chart({ children }: { children?: React.ReactNode }) {
    return React.createElement("div", { "data-chart": true }, children);
  }
  function ChartPart() {
    return React.createElement("span", { "data-chart-part": true });
  }
  return {
    BarChart: Chart,
    Bar: Chart,
    Cell: ChartPart,
    CartesianGrid: ChartPart,
    Legend: ChartPart,
    Line: Chart,
    LineChart: Chart,
    Pie: Chart,
    PieChart: Chart,
    PolarAngleAxis: ChartPart,
    PolarGrid: ChartPart,
    PolarRadiusAxis: ChartPart,
    Radar: Chart,
    RadarChart: Chart,
    ResponsiveContainer: Chart,
    Tooltip: ChartPart,
    XAxis: ChartPart,
    YAxis: ChartPart,
  };
});

vi.mock("@/components/RadarOverlay", () => ({
  AssessmentMultiSelect: () => React.createElement("div", null, "Assessment selector"),
  CHART_COLORS: ["#6b8ef5", "#f5a97c", "#9cf5a4"],
  CompanyMultiSelect: () => React.createElement("div", null, "Company selector"),
  OverlayRadarAndTable: ({ emptyMessage }: { emptyMessage?: string }) =>
    React.createElement("div", null, emptyMessage ?? "Radar overlay"),
  ScoreBandText: ({ score }: { score: number }) => React.createElement("span", null, score.toFixed(1)),
}));

vi.mock("@/components/ScoreGuide", () => ({
  ScoreGuide: () => React.createElement("div", null, "Score guide"),
}));

vi.mock("@/components/TargetSetter", () => ({
  TargetSetter: () => React.createElement("div", null, "Target setter"),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
  SelectContent: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
  SelectItem: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => React.createElement("button", { type: "button" }, children),
  SelectValue: ({ placeholder }: { placeholder?: string }) => React.createElement("span", null, placeholder ?? ""),
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
  TabsContent: ({ children }: { children?: React.ReactNode }) => React.createElement("section", null, children),
  TabsList: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
  TabsTrigger: ({ children }: { children?: React.ReactNode }) => React.createElement("button", { type: "button" }, children),
}));

const companies = [
  {
    id: 1,
    name: "Acme Precision",
    sector: "Manufacturing",
    size: "51-200",
    contactEmail: "admin@acme.test",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: 2,
    name: "Beta Fabrication",
    sector: "Manufacturing",
    size: "11-50",
    contactEmail: "admin@beta.test",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const assessments = [
  {
    id: 101,
    companyId: 1,
    name: "Active shop-floor assessment",
    description: "Review cycle",
    status: "active",
    startDate: null,
    endDate: null,
    assignedUserIds: [3],
    completedUserIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: 102,
    companyId: 1,
    name: "Completed baseline",
    description: "Completed cycle",
    status: "completed",
    startDate: null,
    endDate: null,
    assignedUserIds: [3],
    completedUserIds: [3],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
];

const domains = [
  {
    id: 1,
    name: "Strategy",
    description: "Strategy domain",
    orderIndex: 1,
    categories: [
      {
        id: 1,
        domainId: 1,
        name: "Leadership",
        description: "Leadership category",
        orderIndex: 1,
        criteria: [
          {
            id: 1,
            categoryId: 1,
            name: "Daily management",
            description: "Daily management criterion",
            baselineDescription: "No standard routine",
            excellenceDescription: "Consistent routine",
            orderIndex: 1,
          },
        ],
      },
    ],
  },
];

const criterionNotes = [
  {
    id: 1,
    companyId: 1,
    assessmentId: 101,
    criterionId: 1,
    authorUserId: 2,
    authorName: "Admin A",
    note: "Evidence note from shop-floor review",
    createdAt: "2026-01-04T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
  },
];

const companyReport = {
  company: companies[0],
  assessmentCycles: assessments,
  latestResults: {
    assessmentId: 102,
    assessmentName: "Completed baseline",
    userScores: [
      {
        userId: 3,
        userName: "User A",
        domainScores: [{ domainId: 1, domainName: "Strategy", score: 3, band: "Developing" }],
        overallScore: 3,
        completedAt: "2026-01-03T00:00:00.000Z",
      },
    ],
    aggregateScores: [{ domainId: 1, domainName: "Strategy", score: 3, band: "Developing" }],
    criterionNotes,
  },
  progressData: {
    cycles: [
      {
        assessmentId: 102,
        assessmentName: "Completed baseline",
        completedAt: "2026-01-03T00:00:00.000Z",
        domainScores: [{ domainId: 1, domainName: "Strategy", score: 3, band: "Developing" }],
        overallScore: 3,
      },
    ],
  },
  actions: [
    {
      id: 1,
      companyId: 1,
      assessmentId: 101,
      domainId: 1,
      title: "Improve daily review cadence",
      description: "Action",
      status: "in_progress",
      priority: "high",
      assignedUserId: 3,
      dueDate: "2026-06-01T00:00:00.000Z",
      completedDate: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  criterionNotes,
};

const radarData = {
  domains: ["Strategy"],
  series: [{ label: "Completed baseline", scores: [3], color: "#6b8ef5" }],
};

const programmeData = {
  kpis: {
    participatingCompanies: 2,
    companiesWithCompletedAssessments: 2,
    averageMaturity: 2.4,
    actionCompletionRate: 40,
    assessmentCompletionRate: 80,
    weakestDomain: "Strategy",
    strongestDomain: "Operations",
  },
  heatmap: [
    {
      companyId: 1,
      companyName: "Acme Precision",
      sector: "Manufacturing",
      size: "51-200",
      latestCompletedAt: "2026-01-03T00:00:00.000Z",
      overallScore: 3,
      domainScores: [{ domainId: 1, domainName: "Strategy", score: 3, band: "Developing" }],
    },
  ],
  domainBenchmarks: [{ domainId: 1, domainName: "Strategy", averageScore: 3, minScore: 3, maxScore: 3, companiesScored: 1 }],
  riskCompanies: [{ companyId: 2, companyName: "Beta Fabrication", riskType: "low_action_completion", detail: "10% of actions completed" }],
  domains: ["Strategy"],
};

const auditLogs = [
  {
    id: 1,
    actorUserId: 1,
    actorClerkUserId: "clerk-super",
    actorRole: "super_admin",
    companyId: 1,
    eventType: "report.exported",
    targetType: "company_report",
    targetId: "1",
    metadata: { format: "pdf", template: "board_ready" },
    createdAt: "2026-01-04T00:00:00.000Z",
  },
];

vi.mock("@workspace/api-client-react", () => {
  const result = (data: unknown, extra: Record<string, unknown> = {}) => ({
    data,
    error: null,
    isLoading: false,
    isPending: false,
    mutateAsync: async () => undefined,
    ...extra,
  });

  return {
    GetCompanyReportExportFormat: { csv: "csv", pdf: "pdf", xlsx: "xlsx" },
    GetCompanyReportExportTemplate: {
      board_ready: "board_ready",
      operational_detail: "operational_detail",
      executive_summary: "executive_summary",
    },
    useAssignAssessment: () => result(undefined),
    useCreateCriterionNote: () => result(undefined),
    useGetAssessment: () => result(assessments[0]),
    useGetAssessmentResults: () => result(companyReport.latestResults),
    useGetCompanyDashboard: () => result({
      companyId: 1,
      totalUsers: 3,
      totalAssessments: 2,
      completedAssessments: 1,
      activeActions: 1,
    }),
    useGetCompanyReport: () => result(companyReport),
    useGetCrossCompanyRadar: () => result(radarData),
    useGetProgrammeIntelligence: () => result(programmeData),
    useGetProgressOverTime: () => result(companyReport.progressData),
    useGetRadarData: () => result(radarData),
    useGetSuperAdminReport: () => result({
      totalCompanies: 2,
      totalAssessments: 4,
      completedAssessments: 2,
      activeActions: 3,
      companySummaries: [
        {
          companyId: 1,
          companyName: "Acme Precision",
          latestOverallScore: 3,
          completedAssessments: 1,
          activeActions: 1,
          domainScores: [{ domainId: 1, domainName: "Strategy", score: 3, band: "Developing" }],
        },
      ],
    }),
    useListAuditLogs: () => result(auditLogs),
    useListAssessments: () => result(assessments),
    useListCompanies: () => result(companies),
    useListCompanyUsers: () => result([
      { id: 2, firstName: "Admin", lastName: "A", email: "admin@acme.test", role: "company_admin" },
      { id: 3, firstName: "User", lastName: "A", email: "user@acme.test", role: "company_user" },
    ]),
    useListCriterionNotes: () => result(criterionNotes),
    useListDomains: () => result(domains),
    useListScores: () => result([{ id: 1, assessmentId: 101, userId: 3, criterionId: 1, score: 3, notes: "", createdAt: "", updatedAt: "" }]),
    useListTargets: () => result([
      { id: 1, companyId: 1, domainId: 1, domainName: "Strategy", targetScore: 4, targetDate: "2026-12-31", notes: "Stretch target" },
    ]),
    useUpdateAssessment: () => result(undefined),
  };
});

import AppShell from "./components/AppShell";
import AnalyticsPage from "./pages/Analytics";
import AssessmentDetailPage from "./pages/AssessmentDetail";
import AuditLogsPage from "./pages/AuditLogs";
import Dashboard from "./pages/Dashboard";
import ProgrammePage from "./pages/Programme";
import ReportsPage from "./pages/Reports";

function setRole(role: SmokeRole, userId = role === "company_user" ? 3 : 2) {
  smokeState.currentUser = {
    isLoaded: true,
    isSignedIn: true,
    role,
    companyId: role === "super_admin" ? null : 1,
    companyName: role === "super_admin" ? null : "Acme Precision",
    userId,
    isSuperAdmin: role === "super_admin",
    isCompanyAdmin: role === "company_admin",
    isCompanyUser: role === "company_user",
    getToken: async () => "frontend-smoke-token",
  };
}

function render(element: React.ReactElement) {
  return renderToStaticMarkup(element);
}

describe("frontend smoke coverage", () => {
  beforeEach(() => {
    smokeState.path = "/";
    smokeState.assessmentId = "101";
    setRole("company_admin");
  });

  it("shows role-appropriate navigation for Super Admin, Company Admin, and Company User", () => {
    setRole("super_admin", 1);
    const superAdminShell = render(React.createElement(AppShell, null, React.createElement("main", null, "Content")));
    expect(superAdminShell).toContain("Dashboard");
    expect(superAdminShell).toContain("Reports");
    expect(superAdminShell).toContain("Companies");
    expect(superAdminShell).toContain("Programme");
    expect(superAdminShell).toContain("Audit Logs");

    setRole("company_admin", 2);
    const companyAdminShell = render(React.createElement(AppShell, null, React.createElement("main", null, "Content")));
    expect(companyAdminShell).toContain("Reports");
    expect(companyAdminShell).toContain("Users");
    expect(companyAdminShell).not.toContain("Companies");
    expect(companyAdminShell).not.toContain("Programme");
    expect(companyAdminShell).not.toContain("Audit Logs");

    setRole("company_user", 3);
    const companyUserShell = render(React.createElement(AppShell, null, React.createElement("main", null, "Content")));
    expect(companyUserShell).toContain("Assessments");
    expect(companyUserShell).toContain("Analytics");
    expect(companyUserShell).not.toContain("Reports");
    expect(companyUserShell).not.toContain("Users");
    expect(companyUserShell).not.toContain("Programme");
    expect(companyUserShell).not.toContain("Audit Logs");
  });

  it("smoke-renders dashboard views for company users and Super Admins", () => {
    setRole("company_user", 3);
    const companyDashboard = render(React.createElement(Dashboard));
    expect(companyDashboard).toContain("Your manufacturing maturity overview");
    expect(companyDashboard).toContain("Team Members");
    expect(companyDashboard).toContain("View Assessments");

    setRole("super_admin", 1);
    const superAdminDashboard = render(React.createElement(Dashboard));
    expect(superAdminDashboard).toContain("Super Admin Dashboard");
    expect(superAdminDashboard).toContain("Company Performance");
    expect(superAdminDashboard).toContain("Acme Precision");
  });

  it("smoke-renders reports and keeps export controls role-scoped", () => {
    setRole("company_admin", 2);
    const adminReports = render(React.createElement(ReportsPage));
    expect(adminReports).toContain("Reports");
    expect(adminReports).toContain("Export Report");
    expect(adminReports).toContain("Board-ready report");
    expect(adminReports).toContain("CSV");
    expect(adminReports).toContain("PDF");
    expect(adminReports).toContain("Excel");
    expect(adminReports).toContain("Evidence Notes");

    setRole("company_user", 3);
    const userReports = render(React.createElement(ReportsPage));
    expect(userReports).toContain("Reports");
    expect(userReports).not.toContain("Export Report");
    expect(userReports).not.toContain("Download");
  });

  it("smoke-renders analytics and Super Admin programme entry points", () => {
    setRole("company_admin", 2);
    const adminAnalytics = render(React.createElement(AnalyticsPage));
    expect(adminAnalytics).toContain("Analytics");
    expect(adminAnalytics).toContain("Current vs Target Scores");
    expect(adminAnalytics).toContain("Gap to Target");
    expect(adminAnalytics).toContain("Target setter");

    setRole("super_admin", 1);
    const superAdminAnalytics = render(React.createElement(AnalyticsPage));
    expect(superAdminAnalytics).toContain("Programme Intelligence Dashboard");
    expect(superAdminAnalytics).toContain("Open Programme Intelligence");
  });

  it("keeps Programme Intelligence UI restricted to Super Admins", () => {
    setRole("super_admin", 1);
    const superAdminProgramme = render(React.createElement(ProgrammePage));
    expect(superAdminProgramme).toContain("Programme Intelligence");
    expect(superAdminProgramme).toContain("Programme Filters");
    expect(superAdminProgramme).toContain("Maturity Heatmap");
    expect(superAdminProgramme).toContain("Systemic Programme Risks");

    setRole("company_admin", 2);
    const companyAdminProgramme = render(React.createElement(ProgrammePage));
    expect(companyAdminProgramme).toContain("Access Restricted");
    expect(companyAdminProgramme).not.toContain("Programme Filters");

    setRole("company_user", 3);
    const companyUserProgramme = render(React.createElement(ProgrammePage));
    expect(companyUserProgramme).toContain("Access Restricted");
    expect(companyUserProgramme).not.toContain("Maturity Heatmap");
  });

  it("smoke-renders audit logs for Super Admins only", () => {
    setRole("super_admin", 1);
    const superAdminAuditLogs = render(React.createElement(AuditLogsPage));
    expect(superAdminAuditLogs).toContain("Audit Logs");
    expect(superAdminAuditLogs).toContain("report.exported");
    expect(superAdminAuditLogs).toContain("company_report");

    setRole("company_admin", 2);
    const companyAdminAuditLogs = render(React.createElement(AuditLogsPage));
    expect(companyAdminAuditLogs).toContain("Access Restricted");
    expect(companyAdminAuditLogs).not.toContain("report.exported");
  });

  it("smoke-renders assessment review and evidence notes for permitted users only", () => {
    setRole("company_user", 3);
    const assignedUserAssessment = render(React.createElement(AssessmentDetailPage));
    expect(assignedUserAssessment).toContain("Active shop-floor assessment");
    expect(assignedUserAssessment).toContain("Evidence notes");
    expect(assignedUserAssessment).toContain("Evidence note from shop-floor review");
    expect(assignedUserAssessment).toContain("Add note");

    setRole("company_user", 99);
    const unassignedUserAssessment = render(React.createElement(AssessmentDetailPage));
    expect(unassignedUserAssessment).toContain("Active shop-floor assessment");
    expect(unassignedUserAssessment).not.toContain("Evidence notes");
    expect(unassignedUserAssessment).not.toContain("Add note");
  });
});
