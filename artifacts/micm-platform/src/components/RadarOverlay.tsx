import { useState } from "react";
import type { AssessmentCycle, Company, RadarData } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import { ChevronDown } from "lucide-react";

export const CHART_COLORS = ["#6b8ef5", "#f5a97c", "#9cf5a4", "#f5e97c", "#c47cf5", "#7cf5e5"];
export const MAX_OVERLAYS = 6;

export function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function ScoreBandText({ score }: { score: number | null }) {
  if (score == null)
    return <span className="text-muted-foreground text-xs">No data</span>;
  const band =
    score <= 1 ? "Critical" : score <= 2 ? "Weak" : score <= 3 ? "Developing" : "Strong";
  const cls =
    score <= 1 ? "text-red-600 dark:text-red-400"
    : score <= 2 ? "text-orange-600 dark:text-orange-400"
    : score <= 3 ? "text-yellow-600 dark:text-yellow-400"
    : "text-green-600 dark:text-green-400";
  return <span className={`text-sm font-semibold ${cls}`}>{band} ({score.toFixed(1)})</span>;
}

export function StatusBadge({ status }: { status: string }) {
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
  return (
    <Badge variant="outline" className="text-xs py-0 text-muted-foreground">
      Draft
    </Badge>
  );
}

export function AssessmentMultiSelect({
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
        <Button variant="outline" className="w-full justify-between h-auto min-h-9 py-1.5 px-3 font-normal">
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
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onChange([])}>
              Clear all
            </Button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {assessments.length === 0 && (
            <p className="px-3 py-6 text-sm text-muted-foreground text-center">No assessments found</p>
          )}
          {assessments.map((a) => {
            const checked = selectedIds.includes(a.id);
            const disabled = !checked && selectedIds.length >= MAX_OVERLAYS;
            const colorIdx = selectedIds.indexOf(a.id);
            return (
              <div
                key={a.id}
                onClick={() => !disabled && toggle(a.id)}
                className={`flex items-start gap-3 px-3 py-2.5 border-b last:border-0 transition-colors select-none ${disabled ? "opacity-40" : "cursor-pointer hover:bg-muted/50"}`}
              >
                <Checkbox checked={checked} disabled={disabled} className="mt-0.5 shrink-0" onCheckedChange={() => !disabled && toggle(a.id)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {checked && (
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[colorIdx % CHART_COLORS.length] }} />
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
                      <span>{a.completedUserIds.length} respondent{a.completedUserIds.length !== 1 ? "s" : ""}</span>
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

export function CompanyMultiSelect({
  companies,
  selectedIds,
  onChange,
  scoreByCompanyId,
}: {
  companies: Company[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  scoreByCompanyId?: Record<number, number | null>;
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
      ? "Select companies to compare"
      : `${selectedIds.length} compan${selectedIds.length > 1 ? "ies" : "y"} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between h-auto min-h-9 py-1.5 px-3 font-normal">
          <span className="text-sm truncate">{label}</span>
          <ChevronDown className="w-4 h-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <span className="text-xs text-muted-foreground">
            {selectedIds.length}/{MAX_OVERLAYS} selected — tick to overlay on radar
          </span>
          {selectedIds.length > 0 && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onChange([])}>
              Clear all
            </Button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {companies.length === 0 && (
            <p className="px-3 py-6 text-sm text-muted-foreground text-center">No companies found</p>
          )}
          {companies.map((c) => {
            const checked = selectedIds.includes(c.id);
            const disabled = !checked && selectedIds.length >= MAX_OVERLAYS;
            const colorIdx = selectedIds.indexOf(c.id);
            const score = scoreByCompanyId?.[c.id] ?? null;
            return (
              <div
                key={c.id}
                onClick={() => !disabled && toggle(c.id)}
                className={`flex items-center gap-3 px-3 py-2.5 border-b last:border-0 transition-colors select-none ${disabled ? "opacity-40" : "cursor-pointer hover:bg-muted/50"}`}
              >
                <Checkbox checked={checked} disabled={disabled} className="shrink-0" onCheckedChange={() => !disabled && toggle(c.id)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {checked && (
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[colorIdx % CHART_COLORS.length] }} />
                    )}
                    <span className="text-sm font-medium truncate">{c.name}</span>
                  </div>
                  {c.sector && <p className="text-xs text-muted-foreground mt-0.5">{c.sector}</p>}
                </div>
                {score != null && <ScoreBandText score={score} />}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function OverlayRadarAndTable({
  radarData,
  isLoading,
  emptyMessage = "Select items to view the radar chart.",
  chartHeight = 300,
}: {
  radarData: RadarData | undefined;
  isLoading: boolean;
  emptyMessage?: string;
  chartHeight?: number;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height: chartHeight }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!radarData) {
    return (
      <p className="text-sm text-muted-foreground text-center py-10">{emptyMessage}</p>
    );
  }

  const chartData = radarData.domains.map((domain, i) => {
    const point: Record<string, string | number | null> = { domain };
    for (const s of radarData.series) {
      point[s.label] = s.scores[i] ?? null;
    }
    return point;
  });

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {differentQuestionSets(radarData.series) && <p role="status" className="lg:col-span-2 text-sm text-amber-700">These assessments use different question sets. Scores are shown separately and are not a like-for-like comparison.</p>}
      <ResponsiveContainer width="100%" height={chartHeight}>
        <RadarChart data={chartData}>
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <PolarRadiusAxis angle={30} domain={[0, 4]} tick={{ fontSize: 10 }} tickCount={5} />
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
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Tooltip
            formatter={(v: any, name) => [Number(v).toFixed(2), name]}
            labelFormatter={(label) => `Domain: ${label}`}
          />
        </RadarChart>
      </ResponsiveContainer>

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
                  style={{ color: s.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
                >
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {radarData.domains.map((domain, di) => (
              <tr key={domain} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[di % CHART_COLORS.length] }} />
                    <span className="text-xs">{domain}</span>
                  </div>
                </td>
                {radarData.series.map((s) => (
                  <td key={s.label} className="py-2 pl-3 text-right">
                    <ScoreBandText score={s.scores[di] ?? null} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
import { differentQuestionSets } from "@/lib/assessmentQuestions";
