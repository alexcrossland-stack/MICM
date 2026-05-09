import { useState, useEffect } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import {
  useGetRadarData,
  useGetProgressOverTime,
  useListAssessments,
  useListCompanies,
  useGetCompanyReport,
} from "@workspace/api-client-react";
import type { AssessmentCycle } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { BarChart3, TrendingUp, ChevronDown } from "lucide-react";

const CHART_COLORS = ["#6b8ef5", "#f5a97c", "#9cf5a4", "#f5e97c", "#c47cf5", "#7cf5e5"];
const MAX_OVERLAYS = 6;

function ScoreBand({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground text-xs">No data</span>;
  const band =
    score <= 1 ? "Critical" : score <= 2 ? "Weak" : score <= 3 ? "Developing" : "Strong";
  const color =
    score <= 1 ? "text-red-600 dark:text-red-400"
    : score <= 2 ? "text-orange-600 dark:text-orange-400"
    : score <= 3 ? "text-yellow-600 dark:text-yellow-400"
    : "text-green-600 dark:text-green-400";
  return <span className={`text-sm font-semibold ${color}`}>{band} ({score.toFixed(1)})</span>;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return (
      <Badge variant="outline" className="text-xs py-0 bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
        Completed
      </Badge>
    );
  if (status === "active")
    return (
      <Badge variant="outline" className="text-xs py-0 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
        Active
      </Badge>
    );
  return <Badge variant="outline" className="text-xs py-0 text-muted-foreground">Draft</Badge>;
}

function AssessmentMultiSelect({
  assessments,
  selectedIds,
  onChange,
}: {
  assessments: AssessmentCycle[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else if (selectedIds.length < MAX_OVERLAYS) {
      onChange([...selectedIds, id]);
    }
  };

  const label =
    selectedIds.length === 0
      ? "Select assessments to compare"
      : `${selectedIds.length} assessment${selectedIds.length > 1 ? "s" : ""} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between h-auto min-h-9 py-1.5 px-3 font-normal"
        >
          <span className="text-sm truncate">{label}</span>
          <ChevronDown className="w-4 h-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[460px] p-0" align="start">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <span className="text-xs text-muted-foreground">
            {selectedIds.length}/{MAX_OVERLAYS} selected — tick to overlay on radar
          </span>
          {selectedIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onChange([])}
            >
              Clear all
            </Button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {assessments.length === 0 && (
            <p className="px-3 py-6 text-sm text-muted-foreground text-center">
              No assessments found
            </p>
          )}
          {assessments.map((a) => {
            const checked = selectedIds.includes(a.id);
            const disabled = !checked && selectedIds.length >= MAX_OVERLAYS;
            const colorIdx = selectedIds.indexOf(a.id);
            return (
              <div
                key={a.id}
                onClick={() => !disabled && toggle(a.id)}
                className={`flex items-start gap-3 px-3 py-2.5 border-b last:border-0 transition-colors select-none ${
                  disabled ? "opacity-40" : "cursor-pointer hover:bg-muted/50"
                }`}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  className="mt-0.5 shrink-0"
                  onCheckedChange={() => !disabled && toggle(a.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {checked && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: CHART_COLORS[colorIdx % CHART_COLORS.length],
                        }}
                      />
                    )}
                    <span className="text-sm font-medium leading-tight">{a.name}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 mt-0.5 text-xs text-muted-foreground">
                    {a.endDate ? (
                      <span>Ended {formatDate(a.endDate)}</span>
                    ) : a.startDate ? (
                      <span>Started {formatDate(a.startDate)}</span>
                    ) : (
                      <span>Created {formatDate(a.createdAt)}</span>
                    )}
                    {a.completedUserIds.length > 0 && (
                      <span>
                        {a.completedUserIds.length} respondent
                        {a.completedUserIds.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function ReportsPage() {
  const { companyId, isSuperAdmin } = useCurrentUser();
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
    companyId ?? null,
  );
  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState<number[]>([]);

  const { data: companies } = useListCompanies({
    query: { enabled: isSuperAdmin } as any,
  });

  const targetCompanyId = isSuperAdmin ? selectedCompanyId : companyId;

  const { data: report, isLoading } = useGetCompanyReport(
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

  // When assessments load (or company changes), auto-select the most recent completed one
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

  // Build recharts-compatible data: one entry per domain
  const chartData = radarData
    ? radarData.domains.map((domain, i) => {
        const point: Record<string, string | number> = { domain };
        for (const s of radarData.series) {
          point[s.label] = s.scores[i] ?? 0;
        }
        return point;
      })
    : [];

  // Progress line chart data
  const progressData =
    progress?.cycles?.map((c: any) => {
      const point: any = { name: c.assessmentName };
      c.domainScores.forEach((d: any) => {
        point[d.domainName] = d.score;
      });
      point["Overall"] = c.overallScore;
      return point;
    }) ?? [];

  const completedAssessments = (assessments ?? []).filter(
    (a) => a.status === "completed",
  );

  const sortedAssessments = assessments
    ? [...assessments].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Maturity analysis and progress tracking
        </p>
      </div>

      {isSuperAdmin && (
        <div className="w-64">
          <Label>Company</Label>
          <Select
            value={selectedCompanyId?.toString() ?? ""}
            onValueChange={(v) => setSelectedCompanyId(Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              {companies?.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {!targetCompanyId && !isLoading && (
        <div className="text-muted-foreground text-sm">
          Select a company to view reports.
        </div>
      )}

      {report && (
        <>
          {/* Summary cards */}
          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="border-card-border">
              <CardContent className="p-4">
                <p className="text-2xl font-bold">
                  {report.assessmentCycles?.length ?? 0}
                </p>
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
                {report.latestResults ? (
                  <>
                    <ScoreBand
                      score={
                        report.latestResults.aggregateScores.reduce(
                          (a: number, b: any) => a + (b.score ?? 0),
                          0,
                        ) /
                        (report.latestResults.aggregateScores.filter(
                          (x: any) => x.score != null,
                        ).length || 1)
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Latest Overall Score
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold">—</p>
                    <p className="text-xs text-muted-foreground">No completed assessments</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Assessment overlay radar */}
          {sortedAssessments.length > 0 && (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Maturity Radar
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Select one or more assessment cycles to overlay on the chart
                    </p>
                  </div>
                  <div className="w-full sm:w-72">
                    <AssessmentMultiSelect
                      assessments={sortedAssessments}
                      selectedIds={selectedAssessmentIds}
                      onChange={setSelectedAssessmentIds}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {selectedAssessmentIds.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-10">
                    Select at least one assessment above to view the radar chart.
                  </p>
                )}

                {radarLoading && selectedAssessmentIds.length > 0 && (
                  <div className="flex items-center justify-center h-48">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                )}

                {!radarLoading && radarData && chartData.length > 0 && (
                  <div className="grid lg:grid-cols-2 gap-6 mt-2">
                    {/* Spider chart */}
                    <ResponsiveContainer width="100%" height={310}>
                      <RadarChart data={chartData}>
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis
                          dataKey="domain"
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        />
                        <PolarRadiusAxis
                          angle={30}
                          domain={[0, 4]}
                          tick={{ fontSize: 10 }}
                          tickCount={5}
                        />
                        {radarData.series.map((s, i) => (
                          <Radar
                            key={s.label}
                            name={s.label}
                            dataKey={s.label}
                            stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                            fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                            fillOpacity={radarData.series.length === 1 ? 0.22 : 0.1}
                            strokeWidth={radarData.series.length === 1 ? 2.5 : 2}
                          />
                        ))}
                        <Legend
                          iconType="circle"
                          iconSize={8}
                          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                        />
                        <Tooltip
                          formatter={(v: any, name) => [Number(v).toFixed(2), name]}
                          labelFormatter={(label) => `Domain: ${label}`}
                        />
                      </RadarChart>
                    </ResponsiveContainer>

                    {/* Domain scores comparison table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left pb-2 pr-4 font-medium text-muted-foreground text-xs whitespace-nowrap">
                              Domain
                            </th>
                            {radarData.series.map((s, i) => (
                              <th
                                key={s.label}
                                className="text-right pb-2 pl-3 font-semibold text-xs whitespace-nowrap"
                                style={{
                                  color: s.color ?? CHART_COLORS[i % CHART_COLORS.length],
                                }}
                              >
                                {s.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {radarData.domains.map((domain, di) => (
                            <tr
                              key={domain}
                              className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors"
                            >
                              <td className="py-2 pr-4">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{
                                      backgroundColor:
                                        CHART_COLORS[di % CHART_COLORS.length],
                                    }}
                                  />
                                  <span className="text-xs">{domain}</span>
                                </div>
                              </td>
                              {radarData.series.map((s) => (
                                <td key={s.label} className="py-2 pl-3 text-right">
                                  <ScoreBand score={s.scores[di] ?? null} />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Progress over time */}
          {progressData.length > 1 && (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Progress Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={progressData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 4]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => Number(v).toFixed(1)} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="Overall"
                      stroke="#6b8ef5"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                    {progress?.cycles?.[0]?.domainScores?.map((_: any, i: number) => {
                      const name = progress.cycles[0].domainScores[i].domainName;
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
          )}

          {/* Actions overview */}
          {report.actions && report.actions.length > 0 && (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Actions Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {["not_started", "in_progress", "completed", "on_hold"].map((s) => {
                    const count = report.actions.filter(
                      (a: any) => a.status === s,
                    ).length;
                    const label =
                      s === "not_started" ? "Not Started"
                      : s === "in_progress" ? "In Progress"
                      : s === "completed" ? "Completed"
                      : "On Hold";
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
