export type ProgrammeDateRange = "all" | "last_90" | "last_180" | "no_recent";

export type ProgrammeFilters = {
  sector: string;
  size: string;
  dateRange: ProgrammeDateRange;
};

export type ProgrammeDomainScore = {
  domainId: number;
  domainName: string;
  score?: number | null;
};

export type ProgrammeHeatmapRow = {
  companyId: number;
  companyName: string;
  sector?: string | null;
  size?: string | null;
  latestCompletedAt?: string | null;
  overallScore?: number | null;
  domainScores: ProgrammeDomainScore[];
};

export type ProgrammeRiskCompany = {
  companyId: number;
  companyName: string;
  riskType: string;
  detail: string;
};

export type FilteredDomainBenchmark = {
  domainId: number;
  domainName: string;
  averageScore: number | null;
  minScore: number | null;
  maxScore: number | null;
  companiesScored: number;
};

export type SupportCompany = {
  companyId: number;
  companyName: string;
  reasons: string[];
  overallScore: number | null;
};

export type SystemicRisk = {
  label: string;
  detail: string;
  severity: "watch" | "priority";
};

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasRecentCompletion(row: ProgrammeHeatmapRow, days: number, now: Date): boolean {
  if (!row.latestCompletedAt) return false;
  const completedAt = new Date(row.latestCompletedAt);
  if (Number.isNaN(completedAt.getTime())) return false;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return completedAt >= cutoff;
}

export function filterProgrammeHeatmap(
  rows: ProgrammeHeatmapRow[],
  filters: ProgrammeFilters,
  now: Date = new Date(),
): ProgrammeHeatmapRow[] {
  return rows.filter((row) => {
    if (filters.sector !== "all" && row.sector !== filters.sector) return false;
    if (filters.size !== "all" && row.size !== filters.size) return false;
    if (filters.dateRange === "last_90" && !hasRecentCompletion(row, 90, now)) return false;
    if (filters.dateRange === "last_180" && !hasRecentCompletion(row, 180, now)) return false;
    if (filters.dateRange === "no_recent" && hasRecentCompletion(row, 180, now)) return false;
    return true;
  });
}

export function buildFilteredDomainBenchmarks(
  rows: ProgrammeHeatmapRow[],
  domains: string[],
): FilteredDomainBenchmark[] {
  return domains.map((domainName, index) => {
    const scores = rows
      .map((row) => row.domainScores[index])
      .filter((score): score is ProgrammeDomainScore => score != null)
      .map((score) => score.score)
      .filter((score): score is number => typeof score === "number");

    if (scores.length === 0) {
      return { domainId: index + 1, domainName, averageScore: null, minScore: null, maxScore: null, companiesScored: 0 };
    }

    return {
      domainId: rows.find((row) => row.domainScores[index])?.domainScores[index]?.domainId ?? index + 1,
      domainName,
      averageScore: roundScore(scores.reduce((sum, score) => sum + score, 0) / scores.length),
      minScore: roundScore(Math.min(...scores)),
      maxScore: roundScore(Math.max(...scores)),
      companiesScored: scores.length,
    };
  });
}

export function buildSupportCompanies(
  rows: ProgrammeHeatmapRow[],
  riskCompanies: ProgrammeRiskCompany[],
): SupportCompany[] {
  const rowsByCompany = new Map(rows.map((row) => [row.companyId, row]));
  const risksByCompany = new Map<number, string[]>();

  for (const risk of riskCompanies) {
    if (!rowsByCompany.has(risk.companyId)) continue;
    const reasons = risksByCompany.get(risk.companyId) ?? [];
    reasons.push(risk.detail);
    risksByCompany.set(risk.companyId, reasons);
  }

  const supportCompanies = rows
    .map((row) => {
      const reasons = [...(risksByCompany.get(row.companyId) ?? [])];
      if (row.overallScore == null) {
        reasons.push("No completed maturity score is available");
      } else if (row.overallScore < 2) {
        reasons.push(`Overall maturity is low at ${row.overallScore.toFixed(1)} out of 4`);
      }

      return {
        companyId: row.companyId,
        companyName: row.companyName,
        reasons,
        overallScore: row.overallScore ?? null,
      };
    })
    .filter((company) => company.reasons.length > 0);

  return supportCompanies.sort((a, b) => {
    if (a.overallScore == null && b.overallScore == null) return a.companyName.localeCompare(b.companyName);
    if (a.overallScore == null) return -1;
    if (b.overallScore == null) return 1;
    return a.overallScore - b.overallScore;
  });
}

export function buildSystemicRisks(
  rows: ProgrammeHeatmapRow[],
  benchmarks: FilteredDomainBenchmark[],
  supportCompanies: SupportCompany[],
): SystemicRisk[] {
  if (rows.length === 0) {
    return [{
      label: "No companies match these filters",
      detail: "Broaden the filters before drawing programme conclusions.",
      severity: "watch",
    }];
  }

  const risks: SystemicRisk[] = [];
  const scoredCompanies = rows.filter((row) => row.overallScore != null).length;
  const coverageRate = Math.round((scoredCompanies / rows.length) * 100);

  if (coverageRate < 70) {
    risks.push({
      label: "Assessment coverage is limited",
      detail: `${scoredCompanies} of ${rows.length} companies have completed scores in this view.`,
      severity: "priority",
    });
  }

  const weakestBenchmark = benchmarks
    .filter((benchmark) => benchmark.averageScore != null)
    .sort((a, b) => (a.averageScore ?? 0) - (b.averageScore ?? 0))[0];

  if (weakestBenchmark && weakestBenchmark.averageScore != null && weakestBenchmark.averageScore < 2.5) {
    risks.push({
      label: `${weakestBenchmark.domainName} is the weakest shared domain`,
      detail: `Average maturity is ${weakestBenchmark.averageScore.toFixed(1)} out of 4 across ${weakestBenchmark.companiesScored} scored companies.`,
      severity: weakestBenchmark.averageScore < 2 ? "priority" : "watch",
    });
  }

  if (supportCompanies.length > 0) {
    risks.push({
      label: "Companies need targeted support",
      detail: `${supportCompanies.length} compan${supportCompanies.length === 1 ? "y has" : "ies have"} low scores, stalled assessments, or action follow-through risks.`,
      severity: supportCompanies.length > 2 ? "priority" : "watch",
    });
  }

  if (risks.length === 0) {
    risks.push({
      label: "No systemic risk is visible in this view",
      detail: "Keep monitoring completion rates and low-scoring domains as more companies report.",
      severity: "watch",
    });
  }

  return risks;
}

export function describeProgrammeView(
  rows: ProgrammeHeatmapRow[],
  benchmarks: FilteredDomainBenchmark[],
  supportCompanies: SupportCompany[],
): string {
  if (rows.length === 0) return "No companies match these filters yet.";

  const scoredCompanies = rows.filter((row) => row.overallScore != null);
  if (scoredCompanies.length === 0) {
    return `${rows.length} companies match these filters, but none have completed maturity scores yet.`;
  }

  const average = roundScore(scoredCompanies.reduce((sum, row) => sum + (row.overallScore ?? 0), 0) / scoredCompanies.length);
  const weakest = benchmarks
    .filter((benchmark) => benchmark.averageScore != null)
    .sort((a, b) => (a.averageScore ?? 0) - (b.averageScore ?? 0))[0];

  const weakestText = weakest?.averageScore != null
    ? ` The weakest shared domain is ${weakest.domainName} at ${weakest.averageScore.toFixed(1)} out of 4.`
    : "";
  const supportText = supportCompanies.length > 0
    ? ` ${supportCompanies.length} compan${supportCompanies.length === 1 ? "y needs" : "ies need"} targeted support.`
    : " No company is currently flagged for targeted support in this view.";

  return `${scoredCompanies.length} of ${rows.length} companies have completed scores. Average maturity is ${average.toFixed(1)} out of 4.${weakestText}${supportText}`;
}
