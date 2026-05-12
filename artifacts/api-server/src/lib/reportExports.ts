import type { ReportComposition } from "./reportComposition";

export const SUPPORTED_COMPANY_REPORT_EXPORT_FORMATS = ["csv", "pdf"] as const;
export type CompanyReportExportFormat = (typeof SUPPORTED_COMPANY_REPORT_EXPORT_FORMATS)[number];

export type ReportExportResult = {
  body: string;
  contentType: string;
  fileName: string;
};

export function generateCompanyReportExport(
  composition: ReportComposition,
  format: CompanyReportExportFormat,
): ReportExportResult {
  const baseName = `${slugify(composition.coverSummary.companyName)}-${slugify(composition.templateLabel)}`;
  switch (format) {
    case "csv":
      return {
        body: buildCompanyReportCsv(composition),
        contentType: "text/csv; charset=utf-8",
        fileName: `${baseName}.csv`,
      };
    case "pdf":
      return {
        body: buildCompanyReportPdf(composition),
        contentType: "application/pdf",
        fileName: `${baseName}.pdf`,
      };
  }
}

function buildCompanyReportCsv(composition: ReportComposition) {
  const rows: string[][] = [
    [
      "template",
      "section",
      "company_id",
      "company_name",
      "item_id",
      "item_name",
      "item_date",
      "domain_id",
      "domain_name",
      "score",
      "status_or_band",
      "overall_score",
    ],
  ];

  for (const domainScore of composition.maturityOverview.domainScores) {
    rows.push([
      composition.template,
      "domain_findings",
      String(composition.coverSummary.companyId),
      composition.coverSummary.companyName,
      "",
      composition.coverSummary.latestAssessmentName ?? "",
      "",
      String(domainScore.domainId),
      domainScore.domainName,
      domainScore.score == null ? "" : String(domainScore.score),
      domainScore.band ?? "",
      composition.maturityOverview.overallScore == null ? "" : String(composition.maturityOverview.overallScore),
    ]);
  }

  if (composition.includedSections.includes("action_roadmap")) {
    for (const action of composition.actionRoadmap.priorityActions) {
      rows.push([
        composition.template,
        "action_roadmap",
        String(composition.coverSummary.companyId),
        composition.coverSummary.companyName,
        "",
        action.title,
        action.dueDate ?? "",
        "",
        "",
        "",
        `${action.priority} ${action.status}`,
        "",
      ]);
    }
  }

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n") + "\n";
}

function buildCompanyReportPdf(composition: ReportComposition) {
  const lines = [
    "MICM Maturity Report",
    composition.templateLabel,
    composition.coverSummary.companyName,
    composition.executiveSummary.headline,
    ...composition.executiveSummary.bullets,
  ];
  if (composition.includedSections.includes("maturity_overview")) {
    lines.push(`Overall score: ${composition.maturityOverview.overallScore ?? "Not available"}`);
  }
  if (composition.includedSections.includes("domain_findings")) {
    lines.push("Domain findings", ...composition.domainFindings.map((finding) => finding.finding));
  }
  if (composition.includedSections.includes("action_roadmap")) {
    lines.push(
      "Action roadmap",
      ...composition.actionRoadmap.priorityActions.map((action) => `${action.priority}: ${action.title} (${action.status})`),
    );
  }
  if (composition.includedSections.includes("benchmarking")) {
    lines.push("Benchmarking", composition.benchmarking.summary);
  }

  return buildSimplePdf(lines);
}

function buildSimplePdf(lines: string[]) {
  const contentLines = lines.slice(0, 42).map((line, index) => {
    const y = 760 - index * 16;
    return `BT /F1 10 Tf 50 ${y} Td (${escapePdfText(line)}) Tj ET`;
  });
  const stream = contentLines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

function escapeCsvCell(value: string) {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "company";
}
