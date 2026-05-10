export const SCORE_DEFINITIONS = [
  {
    value: 0,
    shortLabel: "Baseline",
    description: "Traditional Baseline criteria followed",
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
  },
  {
    value: 1,
    shortLabel: "25%",
    description: "At least 25% of processes in place / operational areas covered",
    bg: "bg-orange-50 dark:bg-orange-900/20",
    text: "text-orange-700 dark:text-orange-400",
    border: "border-orange-200 dark:border-orange-800",
  },
  {
    value: 2,
    shortLabel: "50%",
    description: "At least 50% of processes in place / operational areas covered",
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    text: "text-yellow-700 dark:text-yellow-400",
    border: "border-yellow-200 dark:border-yellow-800",
  },
  {
    value: 3,
    shortLabel: "75%",
    description: "At least 75% of processes in place / operational areas covered",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800",
  },
  {
    value: 4,
    shortLabel: "Excellence",
    description: "Excellence criteria met for all areas",
    bg: "bg-green-50 dark:bg-green-900/20",
    text: "text-green-700 dark:text-green-400",
    border: "border-green-200 dark:border-green-800",
  },
] as const;

/**
 * Panel variant — shown above scoring criteria in TakeAssessment.
 * Compact variant — shown below radar/result charts in reports and detail views.
 */
export function ScoreGuide({ variant = "panel" }: { variant?: "panel" | "compact" }) {
  if (variant === "compact") {
    return (
      <div className="mt-4 pt-3 border-t border-border/40">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Score scale</p>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
          {SCORE_DEFINITIONS.map((d) => (
            <div
              key={d.value}
              className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md border ${d.bg} ${d.border}`}
            >
              <span className={`text-sm font-bold shrink-0 leading-tight ${d.text}`}>{d.value}</span>
              <span className={`text-xs leading-tight ${d.text}`}>{d.description}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // panel — full guide above the scoring area
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
        Scoring guide — what each score means
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
        {SCORE_DEFINITIONS.map((d) => (
          <div
            key={d.value}
            className={`flex flex-col gap-1 px-2.5 py-2 rounded-lg border ${d.bg} ${d.border}`}
          >
            <span className={`text-xl font-bold leading-none ${d.text}`}>{d.value}</span>
            <span className={`text-xs leading-snug font-medium ${d.text}`}>{d.shortLabel}</span>
            <span className={`text-xs leading-snug opacity-80 ${d.text}`}>{d.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Inline hint shown below score buttons when a score is selected.
 */
export function SelectedScoreHint({ score }: { score: number | undefined }) {
  if (score == null) return null;
  const def = SCORE_DEFINITIONS[score];
  if (!def) return null;
  return (
    <div className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md border text-xs ${def.bg} ${def.border}`}>
      <span className={`font-bold shrink-0 ${def.text}`}>{def.value}</span>
      <span className={`leading-snug ${def.text}`}>{def.description}</span>
    </div>
  );
}
