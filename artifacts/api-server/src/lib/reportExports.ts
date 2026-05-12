import { GetCompanyReportResponse } from "@workspace/api-zod";

export const SUPPORTED_COMPANY_REPORT_EXPORT_FORMATS = ["csv"] as const;
export type CompanyReportExportFormat = (typeof SUPPORTED_COMPANY_REPORT_EXPORT_FORMATS)[number];

type CompanyReport = ReturnType<typeof GetCompanyReportResponse.parse>;

export type ReportExportResult = {
  body: string;
  contentType: string;
  fileName: string;
};

export function generateCompanyReportExport(
  report: CompanyReport,
  format: CompanyReportExportFormat,
): ReportExportResult {
  switch (format) {
    case "csv":
      return {
        body: buildCompanyReportCsv(report),
        contentType: "text/csv; charset=utf-8",
        fileName: `${slugify(report.company.name)}-maturity-report.csv`,
      };
  }
}

function buildCompanyReportCsv(report: CompanyReport) {
  const rows: string[][] = [
    [
      "company_id",
      "company_name",
      "assessment_id",
      "assessment_name",
      "completed_at",
      "domain_id",
      "domain_name",
      "score",
      "band",
      "overall_score",
    ],
  ];

  for (const cycle of report.progressData.cycles) {
    for (const domainScore of cycle.domainScores) {
      rows.push([
        String(report.company.id),
        report.company.name,
        String(cycle.assessmentId),
        cycle.assessmentName,
        cycle.completedAt ?? "",
        String(domainScore.domainId),
        domainScore.domainName,
        domainScore.score == null ? "" : String(domainScore.score),
        domainScore.band ?? "",
        cycle.overallScore == null ? "" : String(cycle.overallScore),
      ]);
    }
  }

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n") + "\n";
}

function escapeCsvCell(value: string) {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "company";
}
