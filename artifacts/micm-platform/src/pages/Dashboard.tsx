import { useState, useEffect } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import {
  useGetCompanyDashboard,
  useGetSuperAdminReport,
  useListAssessments,
  useGetRadarData,
  useListCompanies,
  useGetCrossCompanyRadar,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { ClipboardList, Users, Zap, TrendingUp, Building2, CheckCircle2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AssessmentMultiSelect,
  CompanyMultiSelect,
  OverlayRadarAndTable,
  ScoreBandText,
} from "@/components/RadarOverlay";
import { ScoreGuide } from "@/components/ScoreGuide";

// ─── Company / non-admin dashboard ───────────────────────────────────────────

function CompanyDashboard({ companyId }: { companyId: number }) {
  const { data, isLoading: dashLoading } = useGetCompanyDashboard(companyId);
  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState<number[]>([]);

  const { data: assessments } = useListAssessments(undefined, {
    query: { enabled: !!companyId } as any,
  });

  const sortedAssessments = assessments
    ? [...assessments].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    : [];

  // Auto-select the most recent completed assessment on first load
  useEffect(() => {
    if (!assessments) return;
    const completed = [...assessments]
      .filter((a) => a.status === "completed")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setSelectedAssessmentIds(completed.length > 0 ? [completed[0].id] : []);
  }, [assessments]);

  const [primaryId, ...compareIds] = selectedAssessmentIds;

  const { data: radarData, isLoading: radarLoading } = useGetRadarData(
    {
      assessmentId: primaryId ?? 0,
      compareAssessmentIds: compareIds.length > 0 ? compareIds.join(",") : undefined,
    },
    { query: { enabled: selectedAssessmentIds.length > 0 } as any },
  );

  if (dashLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!data) return null;

  const stats = [
    { label: "Team Members", value: data.totalUsers, icon: Users, color: "text-blue-500" },
    { label: "Assessments", value: data.totalAssessments, icon: ClipboardList, color: "text-purple-500" },
    { label: "Completed", value: data.completedAssessments, icon: CheckCircle2, color: "text-green-500" },
    { label: "Active Actions", value: data.activeActions, icon: Zap, color: "text-orange-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Your manufacturing maturity overview</p>
      </div>

      {/* KPI stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="border-card-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Radar with multi-assessment overlay */}
      <Card className="border-card-border">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Maturity Radar
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select assessments to overlay and compare your scores over time
              </p>
            </div>
            {sortedAssessments.length > 0 && (
              <div className="w-full sm:w-80">
                <AssessmentMultiSelect
                  assessments={sortedAssessments}
                  selectedIds={selectedAssessmentIds}
                  onChange={setSelectedAssessmentIds}
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <OverlayRadarAndTable
            radarData={radarData}
            isLoading={radarLoading}
            chartHeight={300}
            emptyMessage="Complete an assessment to see your maturity radar chart."
          />
          <ScoreGuide variant="compact" />
        </CardContent>
      </Card>

      {/* Quick actions */}
      <Card className="border-card-border">
        <CardContent className="p-4 flex flex-wrap gap-3">
          <Link href="/assessments">
            <Button variant="outline" size="sm" className="gap-2">
              <ClipboardList className="w-4 h-4" />View Assessments
            </Button>
          </Link>
          <Link href="/actions">
            <Button variant="outline" size="sm" className="gap-2">
              <Zap className="w-4 h-4" />Manage Actions
            </Button>
          </Link>
          <Link href="/reports">
            <Button variant="outline" size="sm" className="gap-2">
              <BarChart3 className="w-4 h-4" />View Reports
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Super Admin dashboard ────────────────────────────────────────────────────

function SuperAdminDashboard() {
  const { data, isLoading } = useGetSuperAdminReport();
  const { data: companies } = useListCompanies({ isActive: true });
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<number[]>([]);

  const scoreByCompanyId: Record<number, number | null> = Object.fromEntries(
    (data?.companySummaries ?? []).map((c) => [c.companyId, c.latestOverallScore ?? null]),
  );

  const { data: crossRadarData, isLoading: crossRadarLoading } = useGetCrossCompanyRadar(
    { companyIds: selectedCompanyIds.join(",") },
    { query: { enabled: selectedCompanyIds.length > 0 } as any },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const stats = [
    { label: "Companies", value: data?.totalCompanies ?? 0, icon: Building2, color: "text-blue-500" },
    { label: "Total Assessments", value: data?.totalAssessments ?? 0, icon: ClipboardList, color: "text-purple-500" },
    { label: "Total Users", value: data?.totalUsers ?? 0, icon: Users, color: "text-green-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Super Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Platform-wide overview</p>
      </div>

      {/* Platform KPI stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="border-card-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Company performance list */}
      {data?.companySummaries && data.companySummaries.length > 0 && (
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Company Performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {data.companySummaries.map((co: any) => (
                <Link key={co.companyId} href="/companies">
                  <div className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 cursor-pointer transition-colors">
                    <div>
                      <p className="text-sm font-medium">{co.companyName}</p>
                      <p className="text-xs text-muted-foreground">
                        {co.completedAssessments} completed assessment{co.completedAssessments !== 1 ? "s" : ""} · {co.activeActions} active action{co.activeActions !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <ScoreBandText score={co.latestOverallScore} />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cross-company radar comparison */}
      <Card className="border-card-border">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Cross-Company Maturity Comparison
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select up to 6 companies to overlay their latest completed assessment scores on the same radar
              </p>
            </div>
            {(companies?.length ?? 0) > 0 && (
              <div className="w-full sm:w-80">
                <CompanyMultiSelect
                  companies={companies ?? []}
                  selectedIds={selectedCompanyIds}
                  onChange={setSelectedCompanyIds}
                  scoreByCompanyId={scoreByCompanyId}
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <OverlayRadarAndTable
            radarData={crossRadarData}
            isLoading={crossRadarLoading}
            chartHeight={320}
            emptyMessage="Select companies above to compare their latest maturity scores on the same radar chart."
          />
          <ScoreGuide variant="compact" />
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/companies">
          <Button variant="outline" size="sm" className="gap-2">
            <Building2 className="w-4 h-4" />Manage Companies
          </Button>
        </Link>
        <Link href="/reports">
          <Button variant="outline" size="sm" className="gap-2">
            <BarChart3 className="w-4 h-4" />View Reports
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Root export ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { isSuperAdmin, companyId, isLoaded } = useCurrentUser();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isSuperAdmin) return <SuperAdminDashboard />;
  if (companyId) return <CompanyDashboard companyId={companyId} />;

  return (
    <div className="flex flex-col items-center justify-center h-40 gap-4">
      <p className="text-muted-foreground">You don't belong to a company yet.</p>
      <Link href="/onboarding">
        <Button>Accept an Invitation</Button>
      </Link>
    </div>
  );
}
