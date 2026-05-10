import { useRoute, useLocation } from "wouter";
import { useCurrentUser } from "@/hooks/useAuth";
import { useGetAssessment, useListDomains, useListScores, useSubmitScores } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, CheckCircle2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreGuide, SelectedScoreHint } from "@/components/ScoreGuide";

const SCORE_LABELS = [
  { value: 0, color: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400" },
  { value: 1, color: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-400" },
  { value: 2, color: "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400" },
  { value: 3, color: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400" },
  { value: 4, color: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400" },
];

type ScoreMap = Record<number, { score: number; notes: string }>;

export default function TakeAssessmentPage() {
  const [, params] = useRoute("/assessments/:id/take");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const { userId } = useCurrentUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [domainIdx, setDomainIdx] = useState(0);
  const [scores, setScores] = useState<ScoreMap>({});
  const [saving, setSaving] = useState(false);

  const { data: assessment } = useGetAssessment(id);
  const { data: domains } = useListDomains();
  const { data: existingScores } = useListScores(
    { assessmentId: id, userId: userId ?? undefined },
    { query: { enabled: !!userId } as any }
  );
  const { mutateAsync: submitScores } = useSubmitScores();

  useEffect(() => {
    if (existingScores) {
      const map: ScoreMap = {};
      existingScores.forEach((s: any) => {
        map[s.criterionId] = { score: s.score, notes: s.notes ?? "" };
      });
      setScores(map);
    }
  }, [existingScores]);

  if (!domains || !assessment) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const domainList = domains as any[];
  const domain = domainList[domainIdx];
  if (!domain) return null;

  const allCriteria = domainList.flatMap((d: any) => d.categories.flatMap((c: any) => c.criteria));
  const totalCriteria = allCriteria.length;
  const scoredCount = Object.keys(scores).length;
  const progress = Math.round((scoredCount / totalCriteria) * 100);

  async function handleSave(final = false) {
    setSaving(true);
    try {
      const domainCriteria = domain.categories.flatMap((c: any) => c.criteria);
      const scoresToSubmit = domainCriteria
        .filter((crit: any) => scores[crit.id] != null)
        .map((crit: any) => ({
          criterionId: crit.id,
          score: scores[crit.id].score,
          notes: scores[crit.id].notes || undefined,
        }));

      if (scoresToSubmit.length > 0) {
        await submitScores({ data: { assessmentId: id, scores: scoresToSubmit } });
        qc.invalidateQueries();
      }

      if (final) {
        toast({ title: "Assessment saved!", description: `${scoredCount} of ${totalCriteria} criteria scored.` });
        navigate(`/assessments/${id}`);
      }
    } catch (e: any) {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    await handleSave(false);
    if (domainIdx < domainList.length - 1) setDomainIdx(domainIdx + 1);
  }

  async function handleFinish() {
    await handleSave(true);
  }

  function setScore(criterionId: number, score: number) {
    setScores(prev => ({ ...prev, [criterionId]: { score, notes: prev[criterionId]?.notes ?? "" } }));
  }
  function setNotes(criterionId: number, notes: string) {
    setScores(prev => ({
      ...prev,
      [criterionId]: { score: prev[criterionId]?.score ?? 0, notes },
    }));
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/assessments/${id}`)} className="gap-1">
          <ChevronLeft className="w-4 h-4" />Back
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{assessment.name}</h1>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{scoredCount} of {totalCriteria} criteria scored</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Domain tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {domainList.map((d: any, i: number) => {
          const domainCriteria = d.categories.flatMap((c: any) => c.criteria);
          const domainScored = domainCriteria.filter((c: any) => scores[c.id] != null).length;
          const isDone = domainScored === domainCriteria.length;
          return (
            <button
              key={d.id}
              onClick={() => setDomainIdx(i)}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                i === domainIdx
                  ? "bg-primary text-white border-primary shadow-sm"
                  : isDone
                  ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                  : "bg-card border-border text-foreground hover:bg-muted"
              )}
            >
              {isDone && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
              {d.name}
            </button>
          );
        })}
      </div>

      {/* Current domain */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{domain.name}</h2>
          {domain.description && <p className="text-sm text-muted-foreground mt-0.5">{domain.description}</p>}
        </div>

        {/* Scoring guide — shown once per domain above the criteria */}
        <ScoreGuide variant="panel" />

        {domain.categories.map((cat: any) => (
          <Card key={cat.id} className="border-card-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{cat.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {cat.criteria.map((crit: any) => {
                const current = scores[crit.id];
                return (
                  <div key={crit.id} className="space-y-2.5 pb-4 border-b border-border/50 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium text-sm">{crit.name}</p>
                      {crit.description && <p className="text-xs text-muted-foreground mt-0.5">{crit.description}</p>}
                    </div>
                    {(crit.baselineDescription || crit.excellenceDescription) && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {crit.baselineDescription && (
                          <div className="px-2.5 py-2 rounded-md bg-red-50 border border-red-100 dark:bg-red-900/10 dark:border-red-900/30">
                            <p className="font-medium text-red-700 dark:text-red-400 mb-0.5">Baseline (0–1)</p>
                            <p className="text-red-600 dark:text-red-300/80">{crit.baselineDescription}</p>
                          </div>
                        )}
                        {crit.excellenceDescription && (
                          <div className="px-2.5 py-2 rounded-md bg-green-50 border border-green-100 dark:bg-green-900/10 dark:border-green-900/30">
                            <p className="font-medium text-green-700 dark:text-green-400 mb-0.5">Excellence (3–4)</p>
                            <p className="text-green-600 dark:text-green-300/80">{crit.excellenceDescription}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Score buttons */}
                    <div className="space-y-1.5">
                      <div className="flex gap-1.5 flex-wrap">
                        {SCORE_LABELS.map(sl => (
                          <button
                            key={sl.value}
                            onClick={() => setScore(crit.id, sl.value)}
                            className={cn(
                              "px-3 py-1.5 rounded-md text-sm font-bold border-2 transition-all",
                              current?.score === sl.value
                                ? `${sl.color} border-current shadow-sm scale-105`
                                : "border-border bg-card text-muted-foreground hover:border-current hover:bg-muted"
                            )}
                          >
                            {sl.value}
                          </button>
                        ))}
                      </div>
                      {/* Inline hint: shows the selected score's exact definition */}
                      <SelectedScoreHint score={current?.score} />
                    </div>
                    <Textarea
                      placeholder="Notes (optional)..."
                      value={current?.notes ?? ""}
                      onChange={e => setNotes(crit.id, e.target.value)}
                      className="text-xs h-14 resize-none"
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={() => setDomainIdx(Math.max(0, domainIdx - 1))} disabled={domainIdx === 0} className="gap-2">
          <ChevronLeft className="w-4 h-4" />Previous
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />Save progress
          </Button>
          {domainIdx < domains.length - 1 ? (
            <Button onClick={handleNext} disabled={saving} className="gap-2">
              Next<ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={saving} className="gap-2">
              <CheckCircle2 className="w-4 h-4" />Submit Assessment
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
