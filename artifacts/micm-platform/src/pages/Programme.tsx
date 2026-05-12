import { useGetProgrammeIntelligence } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, Cell, ErrorBar,
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
  icon: React.ElementType;
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

export default function ProgrammePage() {
  const { isSuperAdmin } = useCurrentUser();
  const { data, isLoading } = useGetProgrammeIntelligence({ query: { enabled: isSuperAdmin } as any });

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

  const { kpis, heatmap, domainBenchmarks, riskCompanies, domains } = data;

  const benchmarkChartData = domainBenchmarks.map((b) => ({
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
            Cross-company maturity overview — {kpis.participatingCompanies} active companies
          </p>
        </div>
      </div>

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
            Latest completed assessment scores per company. Cells colour-coded by band.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {heatmap.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No assessment data yet.</p>
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
                {heatmap.map((row) => (
                  <tr key={row.companyId} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-1.5 pr-4 text-xs font-medium">{row.companyName}</td>
                    {row.domainScores.map((d: any) => (
                      <ScoreCell key={d.domainId} score={d.score} />
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
            <p className="text-xs text-muted-foreground">Average maturity score per domain across all companies</p>
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

      {/* Risk companies */}
      {riskCompanies.length > 0 && (
        <Card className="border-card-border border-l-4 border-l-orange-400">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Companies Needing Attention
              <Badge variant="outline" className="text-xs ml-auto">{riskCompanies.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {riskCompanies.map((r) => {
                const risk = RISK_LABELS[r.riskType];
                return (
                  <div
                    key={`${r.companyId}-${r.riskType}`}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/30 border border-border/50"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{r.companyName}</span>
                      <span className="text-xs text-muted-foreground ml-2">{r.detail}</span>
                    </div>
                    {risk && (
                      <Badge variant="outline" className={`text-xs shrink-0 ${risk.color}`}>
                        {risk.label}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
