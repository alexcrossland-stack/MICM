import { describe, expect, it } from "vitest";
import {
  buildFilteredDomainBenchmarks,
  buildSupportCompanies,
  buildSystemicRisks,
  describeProgrammeView,
  filterProgrammeHeatmap,
  type ProgrammeHeatmapRow,
} from "./programmeInterpretation";

const now = new Date("2026-05-13T12:00:00.000Z");

const rows: ProgrammeHeatmapRow[] = [
  {
    companyId: 1,
    companyName: "Demo Alpha Manufacturing",
    sector: "Manufacturing",
    size: "51-200",
    latestCompletedAt: "2026-04-01T00:00:00.000Z",
    overallScore: 3,
    domainScores: [
      { domainId: 10, domainName: "Strategy", score: 3 },
      { domainId: 20, domainName: "Operations", score: 2 },
    ],
  },
  {
    companyId: 2,
    companyName: "Demo Beta Fabrication",
    sector: "Manufacturing",
    size: "11-50",
    latestCompletedAt: "2025-10-01T00:00:00.000Z",
    overallScore: 1.5,
    domainScores: [
      { domainId: 10, domainName: "Strategy", score: 1 },
      { domainId: 20, domainName: "Operations", score: 2 },
    ],
  },
  {
    companyId: 3,
    companyName: "Demo Gamma Services",
    sector: "Services",
    size: "11-50",
    latestCompletedAt: null,
    overallScore: null,
    domainScores: [
      { domainId: 10, domainName: "Strategy", score: null },
      { domainId: 20, domainName: "Operations", score: null },
    ],
  },
];

describe("programme interpretation helpers", () => {
  it("filters Programme Intelligence rows by sector, size, and completion timing", () => {
    expect(filterProgrammeHeatmap(rows, { sector: "Manufacturing", size: "all", dateRange: "all" }, now).map((row) => row.companyId))
      .toEqual([1, 2]);
    expect(filterProgrammeHeatmap(rows, { sector: "all", size: "11-50", dateRange: "all" }, now).map((row) => row.companyId))
      .toEqual([2, 3]);
    expect(filterProgrammeHeatmap(rows, { sector: "all", size: "all", dateRange: "last_90" }, now).map((row) => row.companyId))
      .toEqual([1]);
    expect(filterProgrammeHeatmap(rows, { sector: "all", size: "all", dateRange: "no_recent" }, now).map((row) => row.companyId))
      .toEqual([2, 3]);
  });

  it("rebuilds benchmark and interpretation text for the filtered view", () => {
    const filteredRows = filterProgrammeHeatmap(rows, { sector: "Manufacturing", size: "all", dateRange: "all" }, now);
    const benchmarks = buildFilteredDomainBenchmarks(filteredRows, ["Strategy", "Operations"]);
    const supportCompanies = buildSupportCompanies(filteredRows, [
      { companyId: 2, companyName: "Demo Beta Fabrication", riskType: "low_action_completion", detail: "10% of actions completed" },
    ]);

    expect(benchmarks).toMatchObject([
      { domainId: 10, domainName: "Strategy", averageScore: 2, minScore: 1, maxScore: 3, companiesScored: 2 },
      { domainId: 20, domainName: "Operations", averageScore: 2, minScore: 2, maxScore: 2, companiesScored: 2 },
    ]);
    expect(supportCompanies).toEqual([
      {
        companyId: 2,
        companyName: "Demo Beta Fabrication",
        overallScore: 1.5,
        reasons: ["10% of actions completed", "Overall maturity is low at 1.5 out of 4"],
      },
    ]);
    expect(describeProgrammeView(filteredRows, benchmarks, supportCompanies)).toContain("2 of 2 companies have completed scores");
    expect(describeProgrammeView(filteredRows, benchmarks, supportCompanies)).toContain("1 company needs targeted support");
  });

  it("summarises systemic programme risks in plain English", () => {
    const filteredRows = filterProgrammeHeatmap(rows, { sector: "all", size: "11-50", dateRange: "all" }, now);
    const benchmarks = buildFilteredDomainBenchmarks(filteredRows, ["Strategy", "Operations"]);
    const supportCompanies = buildSupportCompanies(filteredRows, []);

    expect(buildSystemicRisks(filteredRows, benchmarks, supportCompanies)).toEqual([
      {
        label: "Assessment coverage is limited",
        detail: "1 of 2 companies have completed scores in this view.",
        severity: "priority",
      },
      {
        label: "Strategy is the weakest shared domain",
        detail: "Average maturity is 1.0 out of 4 across 1 scored companies.",
        severity: "priority",
      },
      {
        label: "Companies need targeted support",
        detail: "2 companies have low scores, stalled assessments, or action follow-through risks.",
        severity: "watch",
      },
    ]);
  });
});
