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

  rows.push([
    composition.template,
    "company_info",
    String(composition.coverSummary.companyId),
    composition.coverSummary.companyName,
    "",
    "Current Status Description",
    "",
    "",
    "",
    "",
    composition.companyInfo.currentStatusDescription ?? "",
    "",
  ]);
  for (const challenge of composition.companyInfo.currentChallenges) {
    rows.push([
      composition.template,
      "company_info",
      String(composition.coverSummary.companyId),
      composition.coverSummary.companyName,
      "",
      challenge,
      "",
      "",
      "",
      "",
      "selected",
      "",
    ]);
  }
  for (const stakeholder of composition.companyInfo.stakeholderEngagement.filter((row) => Object.values(row).some(Boolean))) {
    rows.push([
      composition.template,
      "company_info",
      String(composition.coverSummary.companyId),
      composition.coverSummary.companyName,
      "",
      `Stakeholder: ${stakeholder.stakeholder}`,
      stakeholder.dateOfContact,
      "",
      "",
      "",
      [stakeholder.engagementTopic, stakeholder.contact].filter(Boolean).join(" | "),
      "",
    ]);
  }

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

  if (composition.questionSet) {
    rows.push([composition.template, "question_set", String(composition.coverSummary.companyId), composition.coverSummary.companyName, "", `Version ${composition.questionSet.version}: ${composition.questionSet.includedCount} questions`, "", "", "", "", composition.questionSet.signature, ""]);
    for (const q of composition.questionSet.questions) {
      for (const [field, value] of [["Question", q.name], ["Description", q.description], ["Baseline (0)", q.baselineDescription], ["Excellence (4)", q.excellenceDescription]]) {
        rows.push([composition.template, "assessment_question", String(composition.coverSummary.companyId), composition.coverSummary.companyName, String(q.id), `${q.categoryName} / ${field}`, "", "", q.domainName, "", value ?? "", ""]);
      }
    }
  }
  for (const note of composition.evidenceNotes.preview) {
    rows.push([composition.template, "evidence_note", String(composition.coverSummary.companyId), composition.coverSummary.companyName, "", note.questionLabel, note.createdAt, "", "", "", note.note, ""]);
  }
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n") + "\n";
}

function buildCompanyReportPdf(composition: ReportComposition) {
  const pages = [
    buildPdfCoverPage(composition),
    buildPdfExecutiveSummaryPage(composition),
  ];

  if (composition.includedSections.includes("maturity_overview")) {
    pages.push(buildPdfMaturityOverviewPage(composition));
  }
  if (composition.includedSections.includes("domain_findings")) {
    pages.push(buildPdfDomainFindingsPage(composition));
  }
  if (composition.includedSections.includes("action_roadmap")) {
    pages.push(buildPdfActionAndEvidencePage(composition));
    if (composition.evidenceNotes.preview.length) pages.push(...buildPaginatedTextPages("Evidence notes", composition, composition.evidenceNotes.preview.map(note => [note.questionLabel, `${note.authorName} | ${note.createdAt}`, note.note])));
  }
  if (composition.includedSections.includes("benchmarking")) {
    pages.push(buildPdfBenchmarkingPage(composition));
  }

  if (composition.questionSet?.questions.length) pages.push(...buildPdfQuestionPages(composition));
  return buildStyledPdf(pages);
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
        ["Current status", composition.companyInfo.currentStatusDescription ?? ""],
        ["Challenge count", composition.companyInfo.challengeCount],
        ["Challenges", composition.companyInfo.currentChallenges.join("; ")],
        ["Stakeholder engagement", formatStakeholderEngagement(composition.companyInfo.stakeholderEngagement)],
        ["Executive summary", composition.executiveSummary.headline],
        ["Question set", composition.questionSet ? `v${composition.questionSet.version}: ${composition.questionSet.includedCount} questions (${composition.questionSet.signature})` : "Not available"],
      ],
    },
    {
      name: "Company Info",
      rows: [
        ["Field", "Value"],
        ["Current Status Description", composition.companyInfo.currentStatusDescription ?? ""],
        ["Challenge count", composition.companyInfo.challengeCount],
        ...composition.companyInfo.currentChallenges.map((challenge) => ["Challenge", challenge]),
        ["Stakeholder", "Engagement Topic", "Contact", "Date of Contact"],
        ...composition.companyInfo.stakeholderEngagement
          .filter((row) => Object.values(row).some(Boolean))
          .map((row) => [row.stakeholder, row.engagementTopic, row.contact, row.dateOfContact]),
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
  if (composition.questionSet?.questions.length) sheets.push({ name: "Questions", rows: [
    ["Question ID", "Domain", "Category", "Question", "Description", "Baseline (0)", "Excellence (4)"],
    ...composition.questionSet.questions.map(q => [q.id, q.domainName, q.categoryName, q.name, q.description ?? "", q.baselineDescription ?? "", q.excellenceDescription ?? ""]),
  ] });
  if (composition.evidenceNotes.preview.length) sheets.push({ name: "Evidence Notes", rows: [
    ["Question", "Note", "Date"], ...composition.evidenceNotes.preview.map(note => [note.questionLabel, note.note, note.createdAt]),
  ] });
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

type PdfCommand = string;
type PdfColor = [number, number, number];

const PDF_PAGE_WIDTH = 612;
const PDF_PAGE_HEIGHT = 792;
const PDF_MARGIN_X = 46;
const PDF_DARK_BLUE: PdfColor = [0.04, 0.14, 0.28];
const PDF_BLUE: PdfColor = [0.08, 0.28, 0.52];
const PDF_TEAL: PdfColor = [0.05, 0.48, 0.52];
const PDF_GREEN: PdfColor = [0.12, 0.52, 0.34];
const PDF_ORANGE: PdfColor = [0.85, 0.42, 0.12];
const PDF_LIGHT_BLUE: PdfColor = [0.9, 0.95, 0.98];
const PDF_LIGHT_GREY: PdfColor = [0.95, 0.96, 0.97];
const PDF_TEXT: PdfColor = [0.1, 0.12, 0.16];
const PDF_MUTED: PdfColor = [0.38, 0.43, 0.5];
const PDF_WHITE: PdfColor = [1, 1, 1];

function buildPdfCoverPage(composition: ReportComposition): PdfCommand[] {
  const commands: PdfCommand[] = [
    rect(0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT, PDF_DARK_BLUE),
    rect(0, 0, 18, PDF_PAGE_HEIGHT, PDF_TEAL),
    rect(420, 0, 192, PDF_PAGE_HEIGHT, [0.07, 0.2, 0.38]),
    text("MICM Maturity Hub", 54, 724, 13, "bold", PDF_WHITE),
    text(composition.templateLabel, 54, 672, 25, "bold", PDF_WHITE),
    text(composition.coverSummary.companyName, 54, 638, 18, "regular", PDF_WHITE),
    text("Board-ready maturity report generated from assessed MICM data.", 54, 606, 11, "regular", [0.86, 0.92, 0.96]),
  ];

  metricCard(commands, 54, 470, "Overall score", scoreText(composition.maturityOverview.overallScore));
  metricCard(commands, 214, 470, "Completed assessments", String(composition.coverSummary.completedAssessments));
  metricCard(commands, 374, 470, "Open actions", String(composition.coverSummary.openActions));
  metricCard(commands, 54, 360, "Evidence notes", String(composition.coverSummary.evidenceNotes));
  metricCard(commands, 214, 360, "Latest assessment", composition.coverSummary.latestAssessmentName ?? "Not available");
  metricCard(commands, 374, 360, "Sector", composition.coverSummary.sector ?? "Not provided");

  addWrappedText(
    commands,
    composition.executiveSummary.headline,
    54,
    250,
    72,
    15,
    12,
    "regular",
    [0.9, 0.95, 0.98],
  );
  commands.push(text("Confidential board pack", 54, 70, 10, "regular", [0.7, 0.78, 0.86]));
  return commands;
}

function buildPdfExecutiveSummaryPage(composition: ReportComposition): PdfCommand[] {
  const commands = pageScaffold("Executive summary", composition);
  let y = 656;
  commands.push(text(composition.executiveSummary.headline, PDF_MARGIN_X, y, 14, "bold", PDF_TEXT));
  y -= 34;
  for (const bullet of composition.executiveSummary.bullets) {
    y = bulletText(commands, bullet, PDF_MARGIN_X, y);
  }
  const stakeholderRows = composition.companyInfo.stakeholderEngagement.filter((row) => Object.values(row).some(Boolean));
  if (stakeholderRows.length > 0) {
    y -= 14;
    commands.push(text("Stakeholder engagement", PDF_MARGIN_X, y, 12, "bold", PDF_TEXT));
    y -= 24;
    for (const row of stakeholderRows.slice(0, 5)) {
      y = bulletText(
        commands,
        `${row.stakeholder || "Stakeholder"}: ${[row.engagementTopic, row.contact, row.dateOfContact].filter(Boolean).join(" | ")}`,
        PDF_MARGIN_X,
        y,
      );
    }
  }
  return commands;
}

function buildPdfMaturityOverviewPage(composition: ReportComposition): PdfCommand[] {
  const commands = pageScaffold("Maturity overview", composition);
  commands.push(text("Overall score", PDF_MARGIN_X, 656, 11, "bold", PDF_MUTED));
  commands.push(text(scoreText(composition.maturityOverview.overallScore), PDF_MARGIN_X, 620, 32, "bold", PDF_BLUE));
  commands.push(text("Score scale: 0 traditional baseline to 4 excellence.", PDF_MARGIN_X, 594, 10, "regular", PDF_MUTED));

  let y = 540;
  for (const domain of composition.maturityOverview.domainScores.slice(0, 8)) {
    const score = domain.score ?? 0;
    commands.push(text(domain.domainName, PDF_MARGIN_X, y + 4, 10, "bold", PDF_TEXT));
    commands.push(rect(236, y, 230, 10, PDF_LIGHT_GREY));
    commands.push(rect(236, y, Math.max(0, Math.min(4, score)) * 57.5, 10, scoreColor(domain.score ?? null)));
    commands.push(text(domain.score == null ? "Not scored" : `${domain.score.toFixed(1)} / 4`, 484, y + 1, 9, "regular", PDF_TEXT));
    y -= 32;
  }
  return commands;
}

function buildPdfDomainFindingsPage(composition: ReportComposition): PdfCommand[] {
  const commands = pageScaffold("Domain findings", composition);
  let y = 656;
  for (const finding of composition.domainFindings.slice(0, 10)) {
    commands.push(rect(PDF_MARGIN_X, y - 8, 520, 1, PDF_LIGHT_GREY));
    commands.push(text(finding.domainName, PDF_MARGIN_X, y, 11, "bold", PDF_TEXT));
    commands.push(text(finding.score == null ? "Not scored" : `${finding.score.toFixed(1)} / 4 - ${finding.band ?? "Unbanded"}`, 420, y, 9, "regular", scoreColor(finding.score ?? null)));
    y = addWrappedText(commands, finding.finding, PDF_MARGIN_X, y - 18, 86, 13, 9, "regular", PDF_MUTED) - 10;
    if (y < 110) break;
  }
  return commands;
}

function buildPdfActionAndEvidencePage(composition: ReportComposition): PdfCommand[] {
  const commands = pageScaffold("Action roadmap", composition);
  commands.push(text(`${composition.actionRoadmap.totalActions} total actions`, PDF_MARGIN_X, 656, 12, "bold", PDF_TEXT));
  commands.push(text(statusSummary(composition.actionRoadmap.byStatus), PDF_MARGIN_X, 636, 10, "regular", PDF_MUTED));

  let y = 596;
  if (composition.actionRoadmap.priorityActions.length === 0) {
    commands.push(text("No open priority actions are currently listed.", PDF_MARGIN_X, y, 10, "regular", PDF_MUTED));
    y -= 34;
  } else {
    for (const action of composition.actionRoadmap.priorityActions.slice(0, 6)) {
      commands.push(text(`${action.priority.toUpperCase()} - ${action.title}`, PDF_MARGIN_X, y, 10, "bold", PDF_TEXT));
      commands.push(text(`Status: ${action.status}${action.dueDate ? ` | Due: ${action.dueDate.slice(0, 10)}` : ""}`, PDF_MARGIN_X, y - 16, 9, "regular", PDF_MUTED));
      y -= 44;
      if (y < 350) break;
    }
  }

  commands.push(text("Evidence notes", PDF_MARGIN_X, 316, 16, "bold", PDF_TEXT));
  commands.push(text(`${composition.evidenceNotes.totalNotes} criterion evidence notes are available for review context.`, PDF_MARGIN_X, 294, 10, "regular", PDF_MUTED));
  y = 260;
  if (composition.evidenceNotes.preview.length === 0) {
    commands.push(text("No evidence notes have been added yet.", PDF_MARGIN_X, y, 10, "regular", PDF_MUTED));
  } else {
    commands.push(text("See the following evidence pages for saved question wording and notes.", PDF_MARGIN_X, y, 10, "regular", PDF_MUTED));
  }
  return commands;
}

function buildPdfBenchmarkingPage(composition: ReportComposition): PdfCommand[] {
  const commands = pageScaffold("Benchmarking", composition);
  commands.push(text(composition.benchmarking.available ? "Super Admin benchmarking context" : "Benchmarking unavailable", PDF_MARGIN_X, 656, 14, "bold", PDF_TEXT));
  addWrappedText(commands, composition.benchmarking.summary, PDF_MARGIN_X, 624, 90, 14, 10, "regular", PDF_MUTED);
  commands.push(rect(PDF_MARGIN_X, 510, 520, 92, PDF_LIGHT_BLUE));
  commands.push(text("Future cohort comparison", PDF_MARGIN_X + 20, 566, 12, "bold", PDF_BLUE));
  addWrappedText(
    commands,
    "This section is reserved for peer comparison, cohort ranges, and programme-level benchmarks when the data model captures those dimensions.",
    PDF_MARGIN_X + 20,
    544,
    76,
    13,
    9,
    "regular",
    PDF_MUTED,
  );
  return commands;
}

function pageScaffold(title: string, composition: ReportComposition): PdfCommand[] {
  return [
    rect(0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT, PDF_WHITE),
    rect(0, 742, PDF_PAGE_WIDTH, 50, PDF_DARK_BLUE),
    rect(0, 742, 18, 50, PDF_TEAL),
    text("MICM Maturity Hub", PDF_MARGIN_X, 760, 10, "bold", PDF_WHITE),
    text(composition.coverSummary.companyName, 410, 760, 9, "regular", [0.86, 0.92, 0.96]),
    text(title, PDF_MARGIN_X, 694, 22, "bold", PDF_TEXT),
    rect(PDF_MARGIN_X, 676, 520, 1, PDF_LIGHT_GREY),
    text(composition.templateLabel, PDF_MARGIN_X, 38, 8, "regular", PDF_MUTED),
  ];
}

function buildPdfQuestionPages(composition: ReportComposition): PdfCommand[][] {
  return buildPaginatedTextPages("Assessment questions", composition, (composition.questionSet?.questions ?? []).map(q => [`${q.domainName} / ${q.categoryName}`, q.name, q.description ?? "", `Baseline (0): ${q.baselineDescription ?? ""}`, `Excellence (4): ${q.excellenceDescription ?? ""}`]));
}

function buildPaginatedTextPages(title: string, composition: ReportComposition, blocks: string[][]): PdfCommand[][] {
  const pages: PdfCommand[][] = [];
  let commands = pageScaffold(title, composition);
  let y = 650;
  for (const paragraphs of blocks) {
    for (const paragraph of paragraphs) {
      for (const line of wrapText(paragraph, 86)) {
        if (y < 76) { pages.push(commands); commands = pageScaffold(`${title} (continued)`, composition); y = 650; }
        commands.push(text(line, PDF_MARGIN_X, y, 9, "regular", PDF_TEXT)); y -= 13;
      }
      y -= 5;
    }
    y -= 12;
  }
  pages.push(commands);
  return pages;
}

function metricCard(commands: PdfCommand[], x: number, y: number, label: string, value: string) {
  commands.push(rect(x, y, 138, 74, [0.11, 0.27, 0.45]));
  commands.push(text(label, x + 12, y + 48, 8, "regular", [0.74, 0.84, 0.92]));
  addWrappedText(commands, value, x + 12, y + 26, 18, 11, 13, "bold", PDF_WHITE);
}

function bulletText(commands: PdfCommand[], value: string, x: number, y: number) {
  commands.push(rect(x, y - 2, 5, 5, PDF_TEAL));
  return addWrappedText(commands, value, x + 16, y, 84, 15, 10, "regular", PDF_TEXT) - 7;
}

function addWrappedText(
  commands: PdfCommand[],
  value: string,
  x: number,
  y: number,
  maxChars: number,
  lineHeight: number,
  size: number,
  style: "regular" | "bold",
  color: PdfColor,
) {
  let nextY = y;
  for (const line of wrapText(value, maxChars)) {
    commands.push(text(line, x, nextY, size, style, color));
    nextY -= lineHeight;
  }
  return nextY;
}

function buildStyledPdf(pages: PdfCommand[][]) {
  const pageObjectIds = pages.map((_, index) => 5 + index * 2);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  pages.forEach((commands, index) => {
    const pageObjectId = pageObjectIds[index];
    const contentObjectId = pageObjectId + 1;
    const stream = commands.join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    );
  });

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

function text(value: string, x: number, y: number, size: number, style: "regular" | "bold", color: PdfColor) {
  return `${fillColor(color)} BT /${style === "bold" ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET`;
}

function rect(x: number, y: number, width: number, height: number, color: PdfColor) {
  return `${fillColor(color)} ${x} ${y} ${width} ${height} re f`;
}

function fillColor(color: PdfColor) {
  return `${color.map((channel) => channel.toFixed(3)).join(" ")} rg`;
}

function wrapText(value: string, maxChars: number) {
  const words = normalizePdfText(value).split(" ").filter(Boolean).flatMap(word => word.match(new RegExp(`.{1,${maxChars}}`, "g")) ?? []);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function scoreText(score: number | null | undefined) {
  return score == null ? "Not available" : `${score.toFixed(1)} / 4`;
}

function scoreColor(score: number | null) {
  if (score == null) return PDF_MUTED;
  if (score < 2) return PDF_ORANGE;
  if (score < 3) return PDF_TEAL;
  return PDF_GREEN;
}

function statusSummary(byStatus: Record<string, number>) {
  const entries = Object.entries(byStatus);
  if (entries.length === 0) return "No actions are currently recorded.";
  return entries.map(([status, count]) => `${status}: ${count}`).join(" | ");
}

function escapeCsvCell(value: string) {
  if (/^\s*[=+@-]/.test(value)) value = `'${value}`;
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function escapePdfText(value: string) {
  return normalizePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function normalizePdfText(value: string) {
  return value
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function formatStakeholderEngagement(rows: ReportComposition["companyInfo"]["stakeholderEngagement"]) {
  return rows
    .filter((row) => Object.values(row).some(Boolean))
    .map((row) => [row.stakeholder, row.engagementTopic, row.contact, row.dateOfContact].filter(Boolean).join(" | "))
    .join("; ");
}
