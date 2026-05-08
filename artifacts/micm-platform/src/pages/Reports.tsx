import { useState } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import { useGetCompanyReport, useGetProgressOverTime, useListAssessments, useListCompanies } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { BarChart3, TrendingUp } from "lucide-react";

const DOMAIN_COLORS = ["#6b8ef5", "#f5a97c", "#9cf5a4", "#f5e97c", "#c47cf5", "#7cf5e5"];

function ScoreBand({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground text-xs">No data</span>;
  const band = score <= 1 ? "Critical" : score <= 2 ? "Weak" : score <= 3 ? "Developing" : "Strong";
  const color = score <= 1 ? "text-red-600 dark:text-red-400"
    : score <= 2 ? "text-orange-600 dark:text-orange-400"
    : score <= 3 ? "text-yellow-600 dark:text-yellow-400"
    : "text-green-600 dark:text-green-400";
  return <span className={`text-sm font-semibold ${color}`}>{band} ({score.toFixed(1)})</span>;
}

export default function ReportsPage() {
  const { companyId, isSuperAdmin } = useCurrentUser();
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(companyId ?? null);
  const [compareAssessment, setCompareAssessment] = useState<string>("");

  const { data: companies } = useListCompanies({ query: { enabled: isSuperAdmin } as any });
  const targetCompanyId = isSuperAdmin ? selectedCompanyId : companyId;

  const { data: report, isLoading } = useGetCompanyReport(
    targetCompanyId ?? 0,
    {},
    { query: { enabled: !!targetCompanyId } as any }
  );
  const { data: progress } = useGetProgressOverTime(
    { companyId: targetCompanyId ?? 0 },
    { query: { enabled: !!targetCompanyId } as any }
  );

  const assessments = report?.assessmentCycles ?? [];
  const completedAssessments = assessments.filter((a: any) => a.status === "completed");

  // Progress line chart data
  const progressData = progress?.cycles?.map((c: any) => {
    const point: any = { name: c.assessmentName };
    c.domainScores.forEach((d: any) => {
      point[d.domainName] = d.score;
    });
    point["Overall"] = c.overallScore;
    return point;
  }) ?? [];

  // Latest results radar
  const latestResults = report?.latestResults;
  const radarData = latestResults ? latestResults.aggregateScores.map((d: any) => ({
    domain: d.domainName,
    score: d.score ?? 0,
    fullMark: 4,
  })) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">Maturity analysis and progress tracking</p>
      </div>

      {isSuperAdmin && (
        <div className="w-64">
          <Label>Company</Label>
          <Select value={selectedCompanyId?.toString() ?? ""} onValueChange={v => setSelectedCompanyId(Number(v))}>
            <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
            <SelectContent>
              {companies?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading && <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}

      {!targetCompanyId && !isLoading && (
        <div className="text-muted-foreground text-sm">Select a company to view reports.</div>
      )}

      {report && (
        <>
          {/* Summary */}
          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="border-card-border">
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{report.assessmentCycles?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total Cycles</p>
              </CardContent>
            </Card>
            <Card className="border-card-border">
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{completedAssessments.length}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </CardContent>
            </Card>
            <Card className="border-card-border">
              <CardContent className="p-4">
                {latestResults ? (
                  <>
                    <ScoreBand score={latestResults.aggregateScores.reduce((a: number, b: any) => a + (b.score ?? 0), 0) / (latestResults.aggregateScores.filter((x: any) => x.score != null).length || 1)} />
                    <p className="text-xs text-muted-foreground mt-0.5">Latest Overall Score</p>
                  </>
                ) : (
                  <><p className="text-2xl font-bold">—</p><p className="text-xs text-muted-foreground">No completed assessments</p></>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Latest Radar */}
          {radarData.length > 0 && radarData.some((d: any) => d.score > 0) && (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4" />Latest Assessment Radar</CardTitle>
                <p className="text-xs text-muted-foreground">{latestResults?.assessmentName}</p>
              </CardHeader>
              <CardContent>
                <div className="grid lg:grid-cols-2 gap-6">
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <PolarRadiusAxis angle={30} domain={[0, 4]} tick={{ fontSize: 10 }} />
                      <Radar name="Score" dataKey="score" stroke="#6b8ef5" fill="#6b8ef5" fillOpacity={0.25} strokeWidth={2} />
                      <Tooltip formatter={(v: any) => [Number(v).toFixed(1), "Score"]} />
                    </RadarChart>
                  </ResponsiveContainer>

                  <div className="space-y-2">
                    {latestResults?.aggregateScores.map((d: any, i: number) => (
                      <div key={d.domainId} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DOMAIN_COLORS[i % DOMAIN_COLORS.length] }} />
                          <span className="text-sm">{d.domainName}</span>
                        </div>
                        <ScoreBand score={d.score} />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Progress over time */}
          {progressData.length > 1 && (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" />Progress Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={progressData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 4]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => Number(v).toFixed(1)} />
                    <Legend />
                    <Line type="monotone" dataKey="Overall" stroke="#6b8ef5" strokeWidth={2.5} dot={{ r: 4 }} />
                    {progress?.cycles?.[0]?.domainScores?.map((_: any, i: number) => {
                      const name = progress.cycles[0].domainScores[i].domainName;
                      return <Line key={name} type="monotone" dataKey={name} stroke={DOMAIN_COLORS[(i + 1) % DOMAIN_COLORS.length]} strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="4 2" />;
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Action summary */}
          {report.actions && report.actions.length > 0 && (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Actions Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {["not_started", "in_progress", "completed", "on_hold"].map(s => {
                    const count = report.actions.filter((a: any) => a.status === s).length;
                    const label = s === "not_started" ? "Not Started" : s === "in_progress" ? "In Progress" : s === "completed" ? "Completed" : "On Hold";
                    return (
                      <div key={s} className="text-center p-3 rounded-xl bg-muted/50">
                        <p className="text-2xl font-bold">{count}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
