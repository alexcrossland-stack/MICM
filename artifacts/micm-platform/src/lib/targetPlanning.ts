export type TargetPriority =
  | "set_target"
  | "no_current_score"
  | "on_track"
  | "medium_gap"
  | "high_gap";

export interface TargetPlanningStatus {
  gap: number | null;
  label: string;
  tone: "muted" | "success" | "warning" | "danger";
  priority: TargetPriority;
  priorityLabel: string;
}

export function getTargetPlanningStatus(
  currentScore: number | null | undefined,
  targetScore: number | null | undefined,
): TargetPlanningStatus {
  if (targetScore == null || Number.isNaN(targetScore)) {
    return {
      gap: null,
      label: "Set a target",
      tone: "muted",
      priority: "set_target",
      priorityLabel: "Planning needed",
    };
  }

  if (currentScore == null || Number.isNaN(currentScore)) {
    return {
      gap: null,
      label: "No current score",
      tone: "muted",
      priority: "no_current_score",
      priorityLabel: "Complete assessment",
    };
  }

  const gap = Number((targetScore - currentScore).toFixed(1));

  if (gap <= 0) {
    return {
      gap,
      label: "Target met",
      tone: "success",
      priority: "on_track",
      priorityLabel: "On track",
    };
  }

  if (gap >= 1) {
    return {
      gap,
      label: `${gap.toFixed(1)} point gap`,
      tone: "danger",
      priority: "high_gap",
      priorityLabel: "High focus",
    };
  }

  return {
    gap,
    label: `${gap.toFixed(1)} point gap`,
    tone: "warning",
    priority: "medium_gap",
    priorityLabel: "Medium focus",
  };
}

export function formatTargetDate(
  value: string | null | undefined,
  now: Date = new Date(),
) {
  if (!value) return "No date set";

  const targetDate = new Date(value);
  if (Number.isNaN(targetDate.getTime())) return "Invalid date";

  const formatted = targetDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
  );
  const days = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return `${formatted} - overdue`;
  if (days === 0) return `${formatted} - due today`;
  if (days <= 30) return `${formatted} - ${days} days`;
  if (days <= 365) return `${formatted} - ${Math.ceil(days / 30)} months`;
  return formatted;
}
