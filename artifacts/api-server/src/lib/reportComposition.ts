import { GetCompanyReportResponse } from "@workspace/api-zod";

type CompanyReport = ReturnType<typeof GetCompanyReportResponse.parse>;

export const REPORT_TEMPLATES = ["board_ready", "operational_detail", "executive_summary"] as const;
export type ReportTemplate = (typeof REPORT_TEMPLATES)[number];
export type ReportAudience = "company_admin" | "super_admin";

export type ReportComposition = {
  template: ReportTemplate;
  templateLabel: string;
  audience: ReportAudience;
  coverSummary: {
    companyId: number;
    companyName: string;
    sector: string | null | undefined;
    latestAssessmentName: string | null;
    latestOverallScore: number | null;
    completedAssessments: number;
    totalAssessments: number;
    openActions: number;
    evidenceNotes: number;
  };
  companyInfo: {
    currentStatusDescription: string | null;
    currentChallenges: string[];
    stakeholderEngagement: Array<{
      stakeholder: string;
      engagementTopic: string;
      contact: string;
      dateOfContact: string;
    }>;
    challengeCount: number;
  };
  executiveSummary: {
    headline: string;
    bullets: string[];
  };
  maturityOverview: {
    overallScore: number | null;
    domainScores: Array<{
      domainId: number;
      domainName: string;
      score: number | null | undefined;
      band: string | null | undefined;
    }>;
  };
  domainFindings: Array<{
    domainId: number;
    domainName: string;
    score: number | null | undefined;
    band: string | null | undefined;
    finding: string;
  }>;
  actionRoadmap: {
    totalActions: number;
    byStatus: Record<string, number>;
    priorityActions: Array<{
      title: string;
      status: string;
      priority: string;
      dueDate: string | null | undefined;
    }>;
  };
  evidenceNotes: {
    totalNotes: number;
    preview: Array<{
      note: string;
      authorName: string;
      createdAt: string;
    }>;
  };
  benchmarking: {
    available: boolean;
    summary: string;
  };
  includedSections: string[];
};

export function composeCompanyReport(
  report: CompanyReport,
  template: ReportTemplate,
  audience: ReportAudience,
): ReportComposition {
  const completedAssessments = report.assessmentCycles.filter((cycle) => cycle.status === "completed").length;
  const latestDomainScores = (report.latestResults?.aggregateScores ?? []).map((score) => ({
    domainId: score.domainId,
    domainName: score.domainName,
    score: score.score ?? null,
    band: score.band ?? null,
  }));
  const validScores = latestDomainScores
    .map((score) => score.score)
    .filter((score): score is number => score != null);
  const latestOverallScore = validScores.length > 0 ? round2(validScores.reduce((a, b) => a + b, 0) / validScores.length) : null;
  const openActions = report.actions.filter((action) => action.status !== "completed").length;
  const evidenceNotes = report.criterionNotes.length;
  const currentChallenges = report.company.currentChallenges ?? [];
  const evidenceNotePreview = report.criterionNotes
    .slice(0, template === "operational_detail" ? 10 : 5)
    .map((note) => ({
      note: note.note,
      authorName: note.authorName,
      createdAt: formatDate(note.createdAt),
    }));
  const priorityActions = report.actions
    .filter((action) => action.status !== "completed")
    .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
    .slice(0, template === "operational_detail" ? 10 : 5)
    .map((action) => ({
      title: action.title,
      status: action.status,
      priority: action.priority,
      dueDate: action.dueDate,
    }));

  return {
    template,
    templateLabel: templateLabel(template),
    audience,
    coverSummary: {
      companyId: report.company.id,
      companyName: report.company.name,
      sector: report.company.sector,
      latestAssessmentName: report.latestResults?.assessmentName ?? null,
      latestOverallScore,
      completedAssessments,
      totalAssessments: report.assessmentCycles.length,
      openActions,
      evidenceNotes,
    },
    companyInfo: {
      currentStatusDescription: report.company.currentStatusDescription ?? null,
      currentChallenges,
      stakeholderEngagement: report.company.stakeholderEngagement ?? [],
      challengeCount: currentChallenges.length,
    },
    executiveSummary: {
      headline: buildHeadline(report.company.name, latestOverallScore, openActions),
      bullets: buildExecutiveBullets(completedAssessments, latestOverallScore, openActions, evidenceNotes, currentChallenges.length, template),
    },
    maturityOverview: {
      overallScore: latestOverallScore,
      domainScores: latestDomainScores,
    },
    domainFindings: latestDomainScores.map((score) => ({
      ...score,
      finding: buildDomainFinding(score.domainName, score.score, score.band),
    })),
    actionRoadmap: {
      totalActions: report.actions.length,
      byStatus: countByStatus(report.actions),
      priorityActions,
    },
    evidenceNotes: {
      totalNotes: evidenceNotes,
      preview: evidenceNotePreview,
    },
    benchmarking: {
      available: audience === "super_admin",
      summary:
        audience === "super_admin"
          ? "Benchmarking placeholder: compare this company against programme peers once cohort exports are added."
          : "Benchmarking is reserved for Super Admin report exports.",
    },
    includedSections: includedSections(template),
  };
}

function templateLabel(template: ReportTemplate) {
  switch (template) {
    case "board_ready":
      return "Board-ready report";
    case "operational_detail":
      return "Operational detail report";
    case "executive_summary":
      return "Executive summary only";
  }
}

function includedSections(template: ReportTemplate) {
  switch (template) {
    case "board_ready":
      return ["cover_summary", "executive_summary", "maturity_overview", "domain_findings", "action_roadmap", "benchmarking"];
    case "operational_detail":
      return ["cover_summary", "executive_summary", "maturity_overview", "domain_findings", "action_roadmap"];
    case "executive_summary":
      return ["cover_summary", "executive_summary", "maturity_overview"];
  }
}

function buildHeadline(companyName: string, latestOverallScore: number | null, openActions: number) {
  const scoreText = latestOverallScore == null ? "no completed maturity score yet" : `an overall maturity score of ${latestOverallScore}`;
  return `${companyName} has ${scoreText} and ${openActions} open action${openActions === 1 ? "" : "s"}.`;
}

function buildExecutiveBullets(
  completedAssessments: number,
  latestOverallScore: number | null,
  openActions: number,
  evidenceNotes: number,
  challengeCount: number,
  template: ReportTemplate,
) {
  const bullets = [
    `${completedAssessments} completed assessment${completedAssessments === 1 ? "" : "s"} are included in this report.`,
    latestOverallScore == null
      ? "No completed assessment has enough data to calculate an overall score."
      : `Latest overall maturity score is ${latestOverallScore} out of 4.`,
    `${openActions} open action${openActions === 1 ? "" : "s"} remain on the roadmap.`,
    `${evidenceNotes} criterion evidence note${evidenceNotes === 1 ? "" : "s"} ${evidenceNotes === 1 ? "is" : "are"} available for review context.`,
    `${challengeCount} current business challenge${challengeCount === 1 ? "" : "s"} ${challengeCount === 1 ? "is" : "are"} recorded in company info.`,
  ];
  if (template === "operational_detail") {
    bullets.push("Operational detail template includes the full domain findings and priority action roadmap.");
  }
  return bullets;
}

function buildDomainFinding(domainName: string, score: number | null | undefined, band: string | null | undefined) {
  if (score == null) return `${domainName} has not yet been scored in the latest completed assessment.`;
  return `${domainName} is currently ${band ?? "unbanded"} at ${score} out of 4.`;
}

function countByStatus(actions: CompanyReport["actions"]) {
  return actions.reduce<Record<string, number>>((acc, action) => {
    acc[action.status] = (acc[action.status] ?? 0) + 1;
    return acc;
  }, {});
}

function priorityRank(priority: string) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}
