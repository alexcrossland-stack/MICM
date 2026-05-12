import { useState, useEffect } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import {
  useGetCompanyReport,
  useGetProgressOverTime,
  useListAssessments,
  useListCompanies,
  useListTargets,
  useGetRadarData,
  useGetSuperAdminReport,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, Cell, PieChart, Pie, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, Zap, Target, Activity, CheckCircle2, Clock, AlertCircle, BarChart3, Brain,
} from "lucide-react";
import { ScoreBandText, CHART_COLORS, OverlayRadarAndTable } from "@/components/RadarOverlay";
import { TargetSetter } from "@/components/TargetSetter";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  not_started: { label: "Not Started", color: "#94a3b8", icon: Clock },
  in_progress: { label: "In Progress", color: "#60a5fa", icon: Activity },
  completed: { label: "Completed", color: "#4ade80", icon: CheckCircle2 },
  on_hold: { label: "On Hold", color: "#fb923c", icon: AlertCircle },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#86efac",
  medium: "#fde68a",
  high: "#f87171",
};

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = "text-muted-foreground",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <Card className="border-card-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            {sub && <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-muted/50 shrink-0 ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { companyId, isSuperAdmin, isCompanyAdmin, role } = useCurrentUser();
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(companyId ?? null);
  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState<number[]>([]);

  const targetCompanyId = isSuperAdmin ? selectedCompanyId : companyId;

  useEffect(() => {
    if (companyId && !isSuperAdmin) setSelectedCompanyId(companyId);
  }, [companyId, isSuperAdmin]);

  const { data: companies } = useListCompanies({ query: { enabled: isSuperAdmin } as any });

  const { data: report, isLoading: reportLoading } = useGetCompanyReport(
    targetCompanyId ?? 0,
    {},
    { query: { enabled: !!targetCompanyId } as any },
  );

  const { data: assessments } = useListAssessments(
    isSuperAdmin && targetCompanyId ? { companyId: targetCompanyId } : undefined,
    { query: { enabled: !!targetCompanyId } as any },
  );

  const { data: progress } = useGetProgressOverTime(
    { companyId: targetCompanyId ?? 0 },
    { query: { enabled: !!targetCompanyId } as any },
  );

  const { data: targets } = useListTargets(
    { companyId: targetCompanyId ?? 0 },
    { query: { enabled: !!targetCompanyId } as any },
  );

  const { data: superAdminReport } = useGetSuperAdminReport({
    query: { enabled: isSuperAdmin } as any,
  });

  // Auto-select latest completed assessment
  useEffect(() => {
    if (!assessments) return;
    const completed = [...assessments]
      .filter((a) => a.status === "completed")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setSelectedAssessmentIds(completed.length > 0 ? [completed[0].id] : []);
  }, [assessments, targetCompanyId]);

  const [primaryId, ...compareIds] = selectedAssessmentIds;

  const { data: radarData, isLoading: radarLoading } = useGetRadarData(
    { assessmentId: primaryId ?? 0, compareAssessmentIds: compareIds.length > 0 ? compareIds.join(",") : undefined },
    { query: { enabled: selectedAssessmentIds.length > 0 } as any },
  );

  // ── Derived data ──────────────────────────────────────────────────────────────

  const actions = report?.actions ?? [];
  const completedAssessments = (assessments ?? []).filter((a) => a.status === "completed");

  const actionsByStatus = Object.entries(STATUS_CONFIG).map(([status, cfg]) => ({
    status,
    label: cfg.label,
    count: actions.filter((a: any) => a.status === status).length,
    color: cfg.color,
  }));

  const actionsByPriority = ["low", "medium", "high"].map((priority) => ({
    priority,
    count: actions.filter((a: any) => a.priority === priority).length,
    color: PRIORITY_COLORS[priority],
  }));

  const overdueActions = actions.filter((a: any) => {
    if (!a.dueDate || a.status === "completed") return false;
    return new Date(a.dueDate) < new Date();
  });

  // Progress chart data
  const progressData = (progress?.cycles ?? []).map((c: any) => {
    const point: any = { name: c.assessmentName };
    c.domainScores.forEach((d: any) => { point[d.domainName] = d.score; });
    point["Overall"] = c.overallScore;
    return point;
  });

  // Target overlay for radar chart
  const targetRadarData = radarData && targets && targets.length > 0
    ? {
        ...radarData,
        series: [
          ...radarData.series,
          {
            label: "Targets",
            color: "#a78bfa",
            scores: radarData.domains.map((domainName) => {
              const t = targets.find((t) => t.domainName === domainName);
              return t?.targetScore ?? null;
            }),
          },
        ],
      }
    : radarData;

  // SA: company scores distribution
  const companySummaries = superAdminReport?.companySummaries ?? [];
  const scoreDistribution = [
    { label: "No data", count: 0, color: "#e5e7eb" },
    { label: "Critical (0–1)", count: 0, color: "#f87171" },
    { label: "Weak (1–2)", count: 0, color: "#fb923c" },
    { label: "Developing (2–3)", count: 0, color: "#facc15" },
    { label: "Strong (3–4)", count: 0, color: "#4ade80" },
  ];
  for (const c of companySummaries) {
    if (c.latestOverallScore == null) scoreDistribution[0].count++;
    else if (c.latestOverallScore <= 1) scoreDistribution[1].count++;
    else if (c.latestOverallScore <= 2) scoreDistribution[2].count++;
    else if (c.latestOverallScore <= 3) scoreDistribution[3].count++;
    else scoreDistribution[4].count++;
  }

  const canSetTargets = isCompanyAdmin || isSuperAdmin;
  const domainScoreByDomainName: Record<string, number | null> = Object.fromEntries(
    (radarData?.series?.[0]?.scores ?? []).map((s, i) => [radarData?.domains?.[i] ?? "", s ?? null]),
  );
  const currentScoreByDomainId: Record<number, number | null> = Object.fromEntries(
    (targets ?? []).map((t) => [t.domainId, domainScoreByDomainName[t.domainName] ?? null]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Trends, benchmarks and improvement tracking</p>
        </div>
        {isSuperAdmin && (
          <div className="flex items-center gap-3 flex-wrap">
            {companies && companies.length > 0 && (
              <div className="w-56">
                <Select
                  value={selectedCompanyId?.toString() ?? ""}
                  onValueChange={(v) => { setSelectedCompanyId(Number(v)); setSelectedAssessmentIds([]); }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Link href="/programme">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                Programme Intelligence
              </Button>
            </Link>
          </div>
        )}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-9 flex-wrap gap-1">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="trends" className="text-xs">Trends</TabsTrigger>
          <TabsTrigger value="actions" className="text-xs">Actions</TabsTrigger>
          <TabsTrigger value="targets" className="text-xs">Targets</TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="programme" className="text-xs">Programme</TabsTrigger>
          )}
        </TabsList>

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Assessments"
              value={report?.assessmentCycles?.length ?? 0}
              icon={BarChart3}
            />
            <StatCard
              label="Completed"
              value={completedAssessments.length}
              icon={CheckCircle2}
              color="text-green-500"
            />
            <StatCard
              label="Active Actions"
              value={actions.filter((a: any) => a.status !== "completed").length}
              icon={Zap}
              color="text-orange-500"
            />
            <StatCard
              label="Overdue Actions"
              value={overdueActions.length}
              sub={overdueActions.length > 0 ? "Past due date" : "All on track"}
              icon={AlertCircle}
              color={overdueActions.length > 0 ? "text-red-500" : "text-green-500"}
            />
          </div>

          {/* Radar chart with optional target overlay */}
          {radarData && (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Latest Maturity Profile
                  {targets && targets.length > 0 && (
                    <Badge variant="outline" className="text-xs ml-auto font-normal gap-1">
                      <Target className="w-3 h-3" />
                      Targets overlaid
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <OverlayRadarAndTable
                  radarData={targetRadarData}
                  isLoading={radarLoading}
                  chartHeight={280}
                />
              </CardContent>
            </Card>
          )}

          {/* SA score distribution */}
          {isSuperAdmin && companySummaries.length > 0 && (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Company Score Distribution</CardTitle>
                <p className="text-xs text-muted-foreground">Overall maturity bands across all companies</p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex-1 min-w-48" style={{ height: 180 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={scoreDistribution.filter((d) => d.count > 0)}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          label={({ label, count }) => `${count}`}
                          labelLine={false}
                        >
                          {scoreDistribution.filter((d) => d.count > 0).map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, name) => [v, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {scoreDistribution.map((b) => (
                      b.count > 0 && (
                        <div key={b.label} className="flex items-center gap-2 text-xs">
                          <span className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: b.color }} />
                          <span className="text-muted-foreground">{b.label}</span>
                          <span className="font-semibold ml-1">{b.count}</span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Trends ───────────────────────────────────────────────────────── */}
        <TabsContent value="trends" className="space-y-4">
          {progressData.length >= 2 ? (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Maturity Progress Over Time
                </CardTitle>
                <p className="text-xs text-muted-foreground">Score trends across assessment cycles</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={progressData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 4]} tick={{ fontSize: 11 }} tickCount={5} />
                    <Tooltip formatter={(v: any) => Number(v).toFixed(2)} />
                    <Legend />
                    <Line type="monotone" dataKey="Overall" stroke="#6b8ef5" strokeWidth={2.5} dot={{ r: 4 }} />
                    {(progress?.cycles?.[0]?.domainScores ?? []).map((_: any, i: number) => {
                      const name = progress!.cycles[0].domainScores[i].domainName;
                      return (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={CHART_COLORS[(i + 1) % CHART_COLORS.length]}
                          strokeWidth={1.5}
                          dot={{ r: 3 }}
                          strokeDasharray="4 2"
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-card-border">
              <CardContent className="py-12 text-center">
                <TrendingUp className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Trends require at least 2 completed assessments.{" "}
                  {completedAssessments.length < 2 && `${completedAssessments.length} completed so far.`}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Target comparison if targets are set */}
          {targets && targets.length > 0 && radarData && (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Current vs Target Scores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={radarData.domains.map((d, i) => {
                      const t = targets.find((t) => t.domainName === d);
                      return {
                        domain: d.split(" ").slice(0, 2).join(" "),
                        current: radarData.series[0]?.scores[i] ?? null,
                        target: t?.targetScore ?? null,
                      };
                    })}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="domain" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 4]} tick={{ fontSize: 11 }} tickCount={5} />
                    <Tooltip formatter={(v: any) => Number(v).toFixed(2)} />
                    <Legend />
                    <Bar dataKey="current" name="Current" fill="#6b8ef5" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="target" name="Target" fill="#a78bfa" radius={[3, 3, 0, 0]} fillOpacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <TabsContent value="actions" className="space-y-4">
          {actions.length === 0 ? (
            <Card className="border-card-border">
              <CardContent className="py-12 text-center">
                <Zap className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No improvement actions recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Status breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {actionsByStatus.map(({ status, label, count, color }) => {
                  const Cfg = STATUS_CONFIG[status];
                  return (
                    <Card key={status} className="border-card-border">
                      <CardContent className="p-4 flex items-center gap-3">
                        <Cfg.icon className="w-5 h-5 shrink-0" style={{ color }} />
                        <div>
                          <p className="text-lg font-bold">{count}</p>
                          <p className="text-xs text-muted-foreground">{label}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {/* By priority */}
                <Card className="border-card-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">By Priority</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={actionsByPriority} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="priority" tick={{ fontSize: 11 }} width={48} />
                        <Tooltip />
                        <Bar dataKey="count" name="Actions" radius={[0, 4, 4, 0]}>
                          {actionsByPriority.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Action completion progress */}
                <Card className="border-card-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Completion Rate</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center h-40 gap-3">
                    {(() => {
                      const total = actions.length;
                      const done = actions.filter((a: any) => a.status === "completed").length;
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                      return (
                        <>
                          <div className="relative w-24 h-24">
                            <svg className="w-24 h-24 -rotate-90">
                              <circle cx="48" cy="48" r="40" stroke="hsl(var(--border))" strokeWidth="8" fill="none" />
                              <circle
                                cx="48" cy="48" r="40"
                                stroke="#4ade80"
                                strokeWidth="8"
                                fill="none"
                                strokeDasharray={`${pct * 2.51} 251`}
                                strokeLinecap="round"
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-xl font-bold">
                              {pct}%
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{done} of {total} completed</p>
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>

              {/* Overdue list */}
              {overdueActions.length > 0 && (
                <Card className="border-card-border border-l-4 border-l-red-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      Overdue Actions ({overdueActions.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {overdueActions.slice(0, 5).map((a: any) => (
                        <div key={a.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded bg-muted/30">
                          <Badge variant="outline" className={`text-xs shrink-0 ${a.priority === "high" ? "border-red-300 text-red-700 dark:text-red-300" : ""}`}>
                            {a.priority}
                          </Badge>
                          <span className="flex-1 truncate">{a.title}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            Due {new Date(a.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </span>
                        </div>
                      ))}
                      {overdueActions.length > 5 && (
                        <p className="text-xs text-muted-foreground pl-2">+{overdueActions.length - 5} more</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Targets ──────────────────────────────────────────────────────── */}
        <TabsContent value="targets" className="space-y-4">
          {!targetCompanyId ? (
            <Card className="border-card-border">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Select a company to manage targets.
              </CardContent>
            </Card>
          ) : !canSetTargets ? (
            <Card className="border-card-border">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Target setting is available to Company Admins and Super Admins.
              </CardContent>
            </Card>
          ) : (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Maturity Targets
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Set target scores for each domain. Targets appear as an overlay on the radar chart.
                </p>
              </CardHeader>
              <CardContent>
                <TargetSetter companyId={targetCompanyId} currentScoreByDomainId={currentScoreByDomainId} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Programme (Super Admin only) ──────────────────────────────────── */}
        {isSuperAdmin && (
          <TabsContent value="programme" className="space-y-4">
            <Card className="border-card-border">
              <CardContent className="py-10 text-center space-y-3">
                <Brain className="w-10 h-10 text-primary/60 mx-auto" />
                <p className="text-base font-semibold">Programme Intelligence Dashboard</p>
                <p className="text-sm text-muted-foreground">
                  Full cross-company heatmap, risk analysis, and domain benchmarks.
                </p>
                <Link href="/programme">
                  <Button className="mt-1">Open Programme Intelligence</Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
