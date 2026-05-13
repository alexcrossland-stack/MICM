import type { ReportComposition } from "./reportComposition";

export const SUPPORTED_COMPANY_REPORT_EXPORT_FORMATS = ["csv", "pdf", "xlsx"] as const;
export type CompanyReportExportFormat = (typeof SUPPORTED_COMPANY_REPORT_EXPORT_FORMATS)[number];

export type ReportExportResult = {
  body: string | Buffer;
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
    case "xlsx":
      return {
        body: buildCompanyReportWorkbook(composition),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileName: `${baseName}.xlsx`,
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

function buildCompanyReportWorkbook(composition: ReportComposition) {
  const sheets = [
    {
      name: "Summary",
      rows: [
        ["Template", composition.templateLabel],
        ["Company", composition.coverSummary.companyName],
        ["Latest assessment", composition.coverSummary.latestAssessmentName ?? ""],
        ["Overall score", composition.maturityOverview.overallScore ?? ""],
        ["Completed assessments", composition.coverSummary.completedAssessments],
        ["Open actions", composition.coverSummary.openActions],
        ["Evidence notes", composition.coverSummary.evidenceNotes],
        ["Executive summary", composition.executiveSummary.headline],
      ],
    },
    {
      name: "Domain Scores",
      rows: [
        ["Domain ID", "Domain", "Score", "Band", "Finding"],
        ...composition.domainFindings.map((finding) => [
          finding.domainId,
          finding.domainName,
          finding.score ?? "",
          finding.band ?? "",
          finding.finding,
        ]),
      ],
    },
  ];
  if (composition.actionRoadmap.totalActions > 0) {
    sheets.push({
      name: "Actions",
      rows: [
        ["Title", "Status", "Priority", "Due date"],
        ...composition.actionRoadmap.priorityActions.map((action) => [
          action.title,
          action.status,
          action.priority,
          action.dueDate ?? "",
        ]),
      ],
    });
  }
  return buildXlsx(sheets);
}

function buildXlsx(sheets: Array<{ name: string; rows: Array<Array<string | number>> }>) {
  const files = new Map<string, string>();
  files.set("[Content_Types].xml", buildContentTypesXml(sheets.length));
  files.set("_rels/.rels", buildRootRelationshipsXml());
  files.set("xl/workbook.xml", buildWorkbookXml(sheets));
  files.set("xl/_rels/workbook.xml.rels", buildWorkbookRelationshipsXml(sheets.length));
  sheets.forEach((sheet, index) => {
    files.set(`xl/worksheets/sheet${index + 1}.xml`, buildWorksheetXml(sheet.rows));
  });
  return buildZip(files);
}

function buildContentTypesXml(sheetCount: number) {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetOverrides}</Types>`;
}

function buildRootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function buildWorkbookXml(sheets: Array<{ name: string }>) {
  const sheetXml = sheets.map((sheet, index) => `<sheet name="${escapeXmlAttribute(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetXml}</sheets></workbook>`;
}

function buildWorkbookRelationshipsXml(sheetCount: number) {
  const relationships = Array.from({ length: sheetCount }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`;
}

function buildWorksheetXml(rows: Array<Array<string | number>>) {
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXmlText(String(value))}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function buildZip(files: Map<string, string>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBuffer = Buffer.from(name, "utf8");
    const contentBuffer = Buffer.from(content, "utf8");
    const crc = crc32(contentBuffer);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(contentBuffer.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, contentBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(contentBuffer.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + contentBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.size, 8);
  endRecord.writeUInt16LE(files.size, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, endRecord]);
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

function escapeXmlAttribute(value: string) {
  return escapeXmlText(value).replace(/"/g, "&quot;");
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function columnName(index: number) {
  let name = "";
  while (index > 0) {
    const remainder = (index - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "company";
}
