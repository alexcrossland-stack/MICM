import { useCurrentUser } from "@/hooks/useAuth";
import { useGetCompanyDashboard, useGetSuperAdminReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, PolarRadiusAxis } from "recharts";
import { ClipboardList, Users, Zap, TrendingUp, Building2, CheckCircle2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

const DOMAIN_COLORS = ["#6b8ef5", "#f5a97c", "#9cf5a4", "#f5e97c", "#c47cf5", "#7cf5e5"];

function ScoreBand({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground text-sm">No data</span>;
  const band = score <= 1 ? "Critical" : score <= 2 ? "Weak" : score <= 3 ? "Developing" : "Strong";
  const color = score <= 1 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
    : score <= 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
    : score <= 3 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
    : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{band} ({score.toFixed(1)})</span>;
}

function CompanyDashboard({ companyId }: { companyId: number }) {
  const { data, isLoading } = useGetCompanyDashboard(companyId);

  if (isLoading) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!data) return null;

  const radarData = data.domainSummaries.map((d: any) => ({
    domain: d.domainName,
    score: d.averageScore ?? 0,
    fullMark: 4,
  }));

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

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
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

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Radar chart */}
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Maturity Radar</CardTitle>
            {data.latestCycleScore != null && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Overall score:</span>
                <ScoreBand score={data.latestCycleScore} />
              </div>
            )}
          </CardHeader>
          <CardContent>
            {radarData.some((d: any) => d.score > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <PolarRadiusAxis angle={30} domain={[0, 4]} tick={{ fontSize: 10 }} />
                  <Radar name="Score" dataKey="score" stroke="#6b8ef5" fill="#6b8ef5" fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip formatter={(v: any) => [Number(v).toFixed(1), "Score"]} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                Complete an assessment to see your radar chart
              </div>
            )}
          </CardContent>
        </Card>

        {/* Domain table */}
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Domain Scores</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {data.domainSummaries.map((d: any, idx: number) => (
                <div key={d.domainId} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DOMAIN_COLORS[idx % DOMAIN_COLORS.length] }} />
                    <span className="text-sm font-medium">{d.domainName}</span>
                  </div>
                  <ScoreBand score={d.averageScore} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card className="border-card-border">
        <CardContent className="p-4 flex flex-wrap gap-3">
          <Link href="/assessments">
            <Button variant="outline" size="sm" className="gap-2"><ClipboardList className="w-4 h-4" />View Assessments</Button>
          </Link>
          <Link href="/actions">
            <Button variant="outline" size="sm" className="gap-2"><Zap className="w-4 h-4" />Manage Actions</Button>
          </Link>
          <Link href="/reports">
            <Button variant="outline" size="sm" className="gap-2"><BarChart3 className="w-4 h-4" />View Reports</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function SuperAdminDashboard() {
  const { data, isLoading } = useGetSuperAdminReport();

  if (isLoading) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

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

      <div className="grid grid-cols-3 gap-4">
        {stats.map(s => (
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

      {data?.companySummaries && data.companySummaries.length > 0 && (
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Company Performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {data.companySummaries.map((co: any) => (
                <Link key={co.companyId} href={`/companies`}>
                  <div className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 cursor-pointer transition-colors">
                    <div>
                      <p className="text-sm font-medium">{co.companyName}</p>
                      <p className="text-xs text-muted-foreground">{co.completedAssessments} completed assessments · {co.activeActions} active actions</p>
                    </div>
                    <ScoreBand score={co.latestOverallScore} />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Link href="/companies">
          <Button variant="outline" size="sm" className="gap-2"><Building2 className="w-4 h-4" />Manage Companies</Button>
        </Link>
        <Link href="/reports">
          <Button variant="outline" size="sm" className="gap-2"><BarChart3 className="w-4 h-4" />View Reports</Button>
        </Link>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { isSuperAdmin, companyId, isLoaded } = useCurrentUser();

  if (!isLoaded) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

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
