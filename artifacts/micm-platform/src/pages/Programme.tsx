import { useMemo, useState, type ElementType } from "react";
import { useGetProgrammeIntelligence } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildFilteredDomainBenchmarks,
  buildSupportCompanies,
  buildSystemicRisks,
  describeProgrammeView,
  filterProgrammeHeatmap,
  type ProgrammeDateRange,
  type ProgrammeFilters,
  type ProgrammeHeatmapRow,
  type ProgrammeRiskCompany,
} from "@/lib/programmeInterpretation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, Cell,
} from "recharts";
import { Building2, AlertTriangle, TrendingUp, TrendingDown, Activity, CheckCircle2, Zap } from "lucide-react";

// Converts 0-4 score to a colour for the heatmap cells
function scoreToHeatColor(score: number | null): string {
  if (score == null) return "hsl(var(--muted))";
  if (score <= 1) return "#fca5a5"; // red-300
  if (score <= 2) return "#fdba74"; // orange-300
  if (score <= 3) return "#fde68a"; // yellow-300
  return "#86efac"; // green-300
}

function scoreToDarkHeatColor(score: number | null): string {
  if (score == null) return "hsl(var(--muted))";
  if (score <= 1) return "#991b1b"; // red-800
  if (score <= 2) return "#9a3412"; // orange-800
  if (score <= 3) return "#854d0e"; // yellow-800
  return "#166534"; // green-800
}

function ScoreCell({ score }: { score: number | null }) {
  const bg = scoreToHeatColor(score);
  return (
    <td className="text-center py-1.5 px-1" style={{ minWidth: 64 }}>
      <span
        className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold"
        style={{
          backgroundColor: bg,
          color: score != null && score > 2.5 ? "#14532d" : score != null && score > 1.5 ? "#713f12" : score != null ? "#7f1d1d" : undefined,
        }}
      >
        {score != null ? score.toFixed(1) : "—"}
      </span>
    </td>
  );
}

function KPICard({
  label,
  value,
  sub,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: ElementType;
  highlight?: "good" | "warn" | "neutral";
}) {
  const borderClass =
    highlight === "good" ? "border-l-4 border-l-green-400"
    : highlight === "warn" ? "border-l-4 border-l-orange-400"
    : "";

  return (
    <Card className={`border-card-border ${borderClass}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const RISK_LABELS: Record<string, { label: string; color: string }> = {
  no_assessments: { label: "No assessments", color: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800" },
  no_completed_assessments: { label: "In progress only", color: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800" },
  low_action_completion: { label: "Low action rate", color: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800" },
};

const DATE_RANGE_LABELS: Record<ProgrammeDateRange, string> = {
  all: "All completion dates",
  last_90: "Completed in last 90 days",
  last_180: "Completed in last 180 days",
  no_recent: "No completion in 180 days",
};

function filterOptions(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
}

function ProgrammeFilter({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ProgrammePage() {
  const { isSuperAdmin } = useCurrentUser();
  const [questionSetFilter, setQuestionSetFilter] = useState("");
  const { data, isLoading } = useGetProgrammeIntelligence(
    { questionSetSignature: questionSetFilter || undefined },
    { query: { enabled: isSuperAdmin } as any },
  );
  const [sectorFilter, setSectorFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<ProgrammeDateRange>("all");

  const heatmapRows = useMemo(() => (data?.heatmap ?? []) as ProgrammeHeatmapRow[], [data?.heatmap]);
  const riskRows = useMemo(() => (data?.riskCompanies ?? []) as ProgrammeRiskCompany[], [data?.riskCompanies]);
  const domains = useMemo(() => data?.domains ?? [], [data?.domains]);
  const programmeFilters: ProgrammeFilters = useMemo(() => ({
    sector: sectorFilter,
    size: sizeFilter,
    dateRange: dateRangeFilter,
  }), [dateRangeFilter, sectorFilter, sizeFilter]);
  const filteredHeatmap = useMemo(
    () => filterProgrammeHeatmap(heatmapRows, programmeFilters),
    [heatmapRows, programmeFilters],
  );
  const filteredBenchmarks = useMemo(
    () => buildFilteredDomainBenchmarks(filteredHeatmap, domains),
    [domains, filteredHeatmap],
  );
  const supportCompanies = useMemo(
    () => buildSupportCompanies(filteredHeatmap, riskRows),
    [filteredHeatmap, riskRows],
  );
  const systemicRisks = useMemo(
    () => buildSystemicRisks(filteredHeatmap, filteredBenchmarks, supportCompanies),
    [filteredBenchmarks, filteredHeatmap, supportCompanies],
  );
  const interpretation = useMemo(
    () => describeProgrammeView(filteredHeatmap, filteredBenchmarks, supportCompanies),
    [filteredBenchmarks, filteredHeatmap, supportCompanies],
  );
  const sectorOptions = useMemo(() => filterOptions(heatmapRows.map((row) => row.sector)), [heatmapRows]);
  const sizeOptions = useMemo(() => filterOptions(heatmapRows.map((row) => row.size)), [heatmapRows]);

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-60">
        <div className="text-center">
          <p className="text-lg font-semibold">Access Restricted</p>
          <p className="text-sm text-muted-foreground mt-1">Programme Intelligence is available to Super Admins only.</p>
          <Link href="/">
            <Button variant="outline" className="mt-4">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-60">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-sm text-muted-foreground p-4">No data available.</div>;
  }

  const { kpis } = data;

  const benchmarkChartData = filteredBenchmarks.map((b) => ({
    domain: b.domainName.split(" ").slice(0, 2).join(" "),
    avg: b.averageScore,
    min: b.minScore,
    max: b.maxScore,
    companies: b.companiesScored,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Programme Intelligence</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cross-company maturity overview for {kpis.participatingCompanies} active companies
          </p>
        </div>
      </div>

      {(data.questionSetCohorts?.length ?? 0) > 1 && <div className="space-y-2">
        <label htmlFor="question-set-filter" className="text-sm font-medium">Comparable question set</label>
        <select id="question-set-filter" className="block w-full max-w-lg rounded-md border bg-background p-2 text-sm" value={questionSetFilter || data.selectedQuestionSetSignature || ""} onChange={event => setQuestionSetFilter(event.target.value)}>
          {data.questionSetCohorts?.map(cohort => <option key={cohort.signature} value={cohort.signature}>{cohort.signature.slice(0, 8)}: {cohort.questionCount} questions, {cohort.companiesScored} companies</option>)}
        </select>
        <p role="status" className="text-sm text-muted-foreground">{data.comparisonNotice}</p>
      </div>}
      <Card className="border-card-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Programme Filters</CardTitle>
          <p className="text-xs text-muted-foreground">
            Narrow the view before interpreting heatmaps and benchmarks. Region and cohort filters will become active when that data is captured.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <ProgrammeFilter
              label="Sector"
              value={sectorFilter}
              onChange={setSectorFilter}
              options={[{ value: "all", label: "All sectors" }, ...sectorOptions.map((sector) => ({ value: sector, label: sector }))]}
            />
            <ProgrammeFilter
              label="Company size"
              value={sizeFilter}
              onChange={setSizeFilter}
              options={[{ value: "all", label: "All sizes" }, ...sizeOptions.map((size) => ({ value: size, label: size }))]}
            />
            <ProgrammeFilter
              label="Date range"
              value={dateRangeFilter}
              onChange={(value) => setDateRangeFilter(value as ProgrammeDateRange)}
              options={(Object.entries(DATE_RANGE_LABELS) as Array<[ProgrammeDateRange, string]>).map(([value, label]) => ({ value, label }))}
            />
            <ProgrammeFilter
              label="Region"
              value="not_available"
              onChange={() => undefined}
              options={[{ value: "not_available", label: "Region not captured" }]}
              disabled
            />
            <ProgrammeFilter
              label="Cohort"
              value="not_available"
              onChange={() => undefined}
              options={[{ value: "not_available", label: "Cohort not captured" }]}
              disabled
            />
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {interpretation}
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Companies"
          value={kpis.participatingCompanies}
          sub={`${kpis.companiesWithCompletedAssessments} with scores`}
          icon={Building2}
          highlight="neutral"
        />
        <KPICard
          label="Avg Maturity Score"
          value={kpis.averageMaturity != null ? kpis.averageMaturity.toFixed(2) : "—"}
          sub="Across all domains"
          icon={Activity}
          highlight={
            kpis.averageMaturity == null ? "neutral"
            : kpis.averageMaturity >= 3 ? "good"
            : kpis.averageMaturity >= 2 ? "neutral"
            : "warn"
          }
        />
        <KPICard
          label="Assessment Completion"
          value={kpis.assessmentCompletionRate != null ? `${kpis.assessmentCompletionRate}%` : "—"}
          sub="Cycles completed"
          icon={CheckCircle2}
          highlight={
            kpis.assessmentCompletionRate == null ? "neutral"
            : kpis.assessmentCompletionRate >= 70 ? "good"
            : "warn"
          }
        />
        <KPICard
          label="Action Completion"
          value={kpis.actionCompletionRate != null ? `${kpis.actionCompletionRate}%` : "—"}
          sub="Improvement actions done"
          icon={Zap}
          highlight={
            kpis.actionCompletionRate == null ? "neutral"
            : kpis.actionCompletionRate >= 50 ? "good"
            : "warn"
          }
        />
      </div>

      {/* Weakest / Strongest domain callouts */}
      {(kpis.weakestDomain || kpis.strongestDomain) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {kpis.weakestDomain && (
            <Card className="border-card-border border-l-4 border-l-red-400">
              <CardContent className="p-4 flex items-center gap-3">
                <TrendingDown className="w-5 h-5 text-red-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Weakest Domain</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{kpis.weakestDomain}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {kpis.strongestDomain && (
            <Card className="border-card-border border-l-4 border-l-green-400">
              <CardContent className="p-4 flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Strongest Domain</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{kpis.strongestDomain}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Maturity heatmap */}
      <Card className="border-card-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Maturity Heatmap
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Latest completed assessment scores for the selected companies. Cells colour-coded by maturity band.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {filteredHeatmap.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No companies match the selected filters.</p>
          ) : (
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs min-w-36">Company</th>
                  {domains.map((d) => (
                    <th key={d} className="text-center py-2 px-1 font-medium text-muted-foreground text-xs min-w-16">
                      {d.split(" ").slice(0, 2).join(" ")}
                    </th>
                  ))}
                  <th className="text-center py-2 px-1 font-medium text-muted-foreground text-xs min-w-16">Overall</th>
                </tr>
              </thead>
              <tbody>
                {filteredHeatmap.map((row) => (
                  <tr key={row.companyId} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-1.5 pr-4 text-xs font-medium">
                      <div>{row.companyName}</div>
                      <div className="text-[11px] text-muted-foreground font-normal">
                        {[row.sector, row.size].filter(Boolean).join(" · ") || "No profile metadata"}
                      </div>
                    </td>
                    {row.domainScores.map((d) => (
                      <ScoreCell key={d.domainId} score={d.score ?? null} />
                    ))}
                    <ScoreCell score={row.overallScore ?? null} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border">
            {[
              { label: "Critical (0–1)", color: "#fca5a5" },
              { label: "Weak (1–2)", color: "#fdba74" },
              { label: "Developing (2–3)", color: "#fde68a" },
              { label: "Strong (3–4)", color: "#86efac" },
            ].map((b) => (
              <div key={b.label} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: b.color }} />
                <span className="text-xs text-muted-foreground">{b.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Domain benchmarks bar chart */}
      {benchmarkChartData.some((b) => b.avg != null) && (
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Domain Benchmarks
            </CardTitle>
            <p className="text-xs text-muted-foreground">Average maturity score per domain for the selected companies</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={benchmarkChartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="domain" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis domain={[0, 4]} tick={{ fontSize: 11 }} tickCount={5} />
                <Tooltip
                  formatter={(v: any, name: string) => [
                    Number(v).toFixed(2),
                    name === "avg" ? "Avg Score" : name,
                  ]}
                  labelFormatter={(l) => `Domain: ${benchmarkChartData.find((b) => b.domain === l)?.domain ?? l}`}
                />
                <Bar dataKey="avg" name="Avg Score" radius={[4, 4, 0, 0]}>
                  {benchmarkChartData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.avg == null ? "#e5e7eb" : entry.avg <= 1 ? "#f87171" : entry.avg <= 2 ? "#fb923c" : entry.avg <= 3 ? "#facc15" : "#4ade80"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="border-card-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            Systemic Programme Risks
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Plain-English interpretation of the selected companies, not a replacement for company-level review.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-3">
            {systemicRisks.map((risk) => (
              <div key={risk.label} className="rounded-md border border-border/60 bg-muted/20 p-3">
                <Badge
                  variant="outline"
                  className={risk.severity === "priority" ? "mb-2 bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800" : "mb-2"}
                >
                  {risk.severity === "priority" ? "Priority" : "Watch"}
                </Badge>
                <p className="text-sm font-semibold text-foreground">{risk.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{risk.detail}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Risk companies */}
      <Card className="border-card-border border-l-4 border-l-orange-400">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            Companies Needing Support
            <Badge variant="outline" className="text-xs ml-auto">{supportCompanies.length}</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Companies are listed when assessments are missing, scores are low, or action progress needs follow-up.
          </p>
        </CardHeader>
        <CardContent>
          {supportCompanies.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">No companies in this view are currently flagged for targeted support.</p>
          ) : (
            <div className="space-y-2">
              {supportCompanies.map((company) => {
                const matchingRisks = riskRows.filter((risk) => risk.companyId === company.companyId);
                return (
                  <div
                    key={company.companyId}
                    className="flex items-start gap-3 py-2 px-3 rounded-lg bg-muted/30 border border-border/50"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{company.companyName}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{company.reasons.join("; ")}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {matchingRisks.length > 0 ? matchingRisks.map((risk) => {
                        const label = RISK_LABELS[risk.riskType];
                        return label ? (
                          <Badge key={risk.riskType} variant="outline" className={`text-xs shrink-0 ${label.color}`}>
                            {label.label}
                          </Badge>
                        ) : null;
                      }) : (
                        <Badge variant="outline" className="text-xs shrink-0">
                          Low score
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
