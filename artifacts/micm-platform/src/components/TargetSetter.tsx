import { useState, useEffect } from "react";
import { useListDomains, useListTargets, useUpsertTarget } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatTargetDate, getTargetPlanningStatus } from "@/lib/targetPlanning";
import { CalendarDays, Target, Save, Loader2, TrendingUp } from "lucide-react";

interface TargetRow {
  domainId: number;
  domainName: string;
  targetScore: string;
  targetDate: string;
  notes: string;
  dirty: boolean;
}

export function TargetSetter({
  companyId,
  currentScoreByDomainId,
  currentScoreByDomainName,
}: {
  companyId: number;
  currentScoreByDomainId?: Record<number, number | null>;
  currentScoreByDomainName?: Record<string, number | null>;
}) {
  const { toast } = useToast();
  const { data: domains } = useListDomains();
  const { data: targets, refetch: refetchTargets } = useListTargets(
    { companyId },
    { query: { enabled: !!companyId } as any },
  );

  const { mutateAsync: upsertTarget } = useUpsertTarget();

  const [rows, setRows] = useState<TargetRow[]>([]);
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!domains) return;
    const targetMap: Record<number, any> = Object.fromEntries(
      (targets ?? []).map((t) => [t.domainId, t]),
    );
    setRows(
      domains.map((d) => {
        const existing = targetMap[d.id];
        return {
          domainId: d.id,
          domainName: d.name,
          targetScore: existing ? String(existing.targetScore) : "",
          targetDate: existing?.targetDate
            ? new Date(existing.targetDate).toISOString().substring(0, 10)
            : "",
          notes: existing?.notes ?? "",
          dirty: false,
        };
      }),
    );
  }, [domains, targets]);

  const updateRow = (domainId: number, field: keyof TargetRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.domainId === domainId ? { ...r, [field]: value, dirty: true } : r)),
    );
  };

  const handleSave = async (row: TargetRow) => {
    const score = parseFloat(row.targetScore);
    if (isNaN(score) || score < 0 || score > 4) {
      toast({ title: "Invalid target", description: "Target score must be between 0 and 4", variant: "destructive" });
      return;
    }

    setSaving((prev) => ({ ...prev, [row.domainId]: true }));
    try {
      await upsertTarget({
        companyId,
        domainId: row.domainId,
        data: {
          targetScore: score,
          targetDate: row.targetDate ? new Date(row.targetDate).toISOString() : null,
          notes: row.notes || null,
        },
      });
      setRows((prev) =>
        prev.map((r) => (r.domainId === row.domainId ? { ...r, dirty: false } : r)),
      );
      await refetchTargets();
      toast({ title: "Target saved", description: `${row.domainName} target set to ${score.toFixed(1)}` });
    } catch {
      toast({ title: "Failed to save", description: "Please try again", variant: "destructive" });
    } finally {
      setSaving((prev) => ({ ...prev, [row.domainId]: false }));
    }
  };

  if (!domains) {
    return (
      <div className="flex items-center justify-center h-24">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  const SCORE_BANDS = [
    { min: 0, max: 1, label: "Critical", color: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
    { min: 1, max: 2, label: "Weak", color: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800" },
    { min: 2, max: 3, label: "Developing", color: "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800" },
    { min: 3, max: 4.01, label: "Strong", color: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" },
  ];

  const getBandColor = (score: number | null | undefined) => {
    if (score == null) return "";
    return SCORE_BANDS.find((b) => score >= b.min && score < b.max)?.color ?? "";
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Target className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Set the maturity level each domain should reach on the 0–4 scale.</span>
        </div>
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <TrendingUp className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Gap and focus level use the latest completed assessment.</span>
        </div>
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <CalendarDays className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Target dates show when each improvement window closes.</span>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs w-44">Domain</th>
              <th className="text-center py-2 px-2 font-medium text-muted-foreground text-xs w-24">Current</th>
              <th className="text-center py-2 px-2 font-medium text-muted-foreground text-xs w-28">Target (0–4)</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs w-32">Gap / Focus</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs w-40">Target Date</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Notes</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const current = currentScoreByDomainId?.[row.domainId] ?? currentScoreByDomainName?.[row.domainName] ?? null;
              const targetVal = parseFloat(row.targetScore);
              const targetValid = !isNaN(targetVal) && targetVal >= 0 && targetVal <= 4;
              const isSaving = saving[row.domainId];
              const status = getTargetPlanningStatus(current, targetValid ? targetVal : null);
              const statusColor =
                status.tone === "success"
                  ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
                  : status.tone === "warning"
                    ? "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300"
                    : status.tone === "danger"
                      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                      : "";

              return (
                <tr key={row.domainId} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-2">
                    <span className="font-medium text-foreground">{row.domainName}</span>
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    {current != null ? (
                      <Badge variant="outline" className={`text-xs ${getBandColor(current)}`}>
                        {current.toFixed(1)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">No data</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    <Input
                      type="number"
                      min={0}
                      max={4}
                      step={0.5}
                      value={row.targetScore}
                      onChange={(e) => updateRow(row.domainId, "targetScore", e.target.value)}
                      placeholder="e.g. 3.0"
                      className={`h-8 text-center text-sm w-full ${targetValid && row.targetScore ? getBandColor(targetVal) : ""}`}
                    />
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className={`w-fit text-xs ${statusColor}`}>
                        {status.priorityLabel}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{status.label}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2">
                    <Input
                      type="date"
                      value={row.targetDate}
                      onChange={(e) => updateRow(row.domainId, "targetDate", e.target.value)}
                      className="h-8 text-xs w-full"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{formatTargetDate(row.targetDate)}</p>
                  </td>
                  <td className="py-2.5 px-2">
                    <Input
                      type="text"
                      value={row.notes}
                      onChange={(e) => updateRow(row.domainId, "notes", e.target.value)}
                      placeholder="Optional note…"
                      className="h-8 text-xs w-full"
                    />
                  </td>
                  <td className="py-2.5 px-2">
                    <Button
                      size="sm"
                      variant={row.dirty ? "default" : "ghost"}
                      className="h-8 w-8 p-0"
                      onClick={() => handleSave(row)}
                      disabled={isSaving || !row.targetScore}
                      title="Save target"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
