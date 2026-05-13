import { useState, useEffect } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import {
  useGetRadarData,
  useGetProgressOverTime,
  useListAssessments,
  useListCompanies,
  useGetCompanyReport,
  useGetCrossCompanyRadar,
  useGetSuperAdminReport,
  GetCompanyReportExportFormat,
  GetCompanyReportExportTemplate,
  type GetCompanyReportExportFormat as ReportExportFormat,
  type GetCompanyReportExportTemplate as ReportTemplate,
} from "@workspace/api-client-react";
import { getApiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import { BarChart3, TrendingUp, Building2, Download, Loader2, MessageSquare } from "lucide-react";
import {
  ScoreBandText,
  AssessmentMultiSelect,
  CompanyMultiSelect,
  OverlayRadarAndTable,
  CHART_COLORS,
} from "@/components/RadarOverlay";
import { ScoreGuide } from "@/components/ScoreGuide";

const REPORT_TEMPLATE_OPTIONS: Array<{ value: ReportTemplate; label: string }> = [
  { value: GetCompanyReportExportTemplate.board_ready, label: "Board-ready report" },
  { value: GetCompanyReportExportTemplate.operational_detail, label: "Operational detail report" },
  { value: GetCompanyReportExportTemplate.executive_summary, label: "Executive summary only" },
];

const REPORT_FORMAT_OPTIONS: Array<{ value: ReportExportFormat; label: string }> = [
  { value: GetCompanyReportExportFormat.csv, label: "CSV" },
  { value: GetCompanyReportExportFormat.pdf, label: "PDF" },
  { value: GetCompanyReportExportFormat.xlsx, label: "Excel" },
];

function filenameFromDisposition(disposition: string | null, fallback: string) {
  const match = disposition?.match(/filename="?(?<filename>[^";]+)"?/);
  return match?.groups?.filename ?? fallback;
}

export default function ReportsPage() {
  const { companyId, isSuperAdmin, isCompanyAdmin, getToken } = useCurrentUser();
  const { toast } = useToast();

  // ─── Single-company report state ─────────────────────────────────────────────
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(companyId ?? null);
  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState<number[]>([]);
  const [reportTemplate, setReportTemplate] = useState<ReportTemplate>(GetCompanyReportExportTemplate.board_ready);
  const [exportFormat, setExportFormat] = useState<ReportExportFormat>(GetCompanyReportExportFormat.csv);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // ─── Cross-company comparison state (Super Admin only) ────────────────────────
  const [selectedCrossCompanyIds, setSelectedCrossCompanyIds] = useState<number[]>([]);

  const { data: companies } = useListCompanies({
    query: { enabled: isSuperAdmin } as any,
  });

  const { data: superAdminReport } = useGetSuperAdminReport({
    query: { enabled: isSuperAdmin } as any,
  });

  const scoreByCompanyId: Record<number, number | null> = Object.fromEntries(
    (superAdminReport?.companySummaries ?? []).map((c) => [c.companyId, c.latestOverallScore ?? null]),
  );

  const targetCompanyId = isSuperAdmin ? selectedCompanyId : companyId;

  const { data: report, isLoading } = useGetCompanyReport(
    targetCompanyId ?? 0,
    {},
    { query: { enabled: !!targetCompanyId } as any },
  );

  const { data: assessments } = useListAssessments(
    isSuperAdmin && targetCompanyId ? { companyId: targetCompanyId } : undefined,
    { query: { enabled: !!targetCompanyId } as any },
  );

  const { data: progress } = useGetProgressOverTime(
    { companyId: targetCompanyId ?? 0 },
    { query: { enabled: !!targetCompanyId } as any },
  );

  // Cross-company radar hook
  const { data: crossRadarData, isLoading: crossRadarLoading } = useGetCrossCompanyRadar(
    { companyIds: selectedCrossCompanyIds.join(",") },
    { query: { enabled: selectedCrossCompanyIds.length > 0 } as any },
  );

  // Auto-select latest completed assessment when assessments load or company changes
  useEffect(() => {
    if (!assessments) return;
    const completed = [...assessments]
      .filter((a) => a.status === "completed")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setSelectedAssessmentIds(completed.length > 0 ? [completed[0].id] : []);
  }, [assessments]);

  const [primaryId, ...compareIds] = selectedAssessmentIds;

  const { data: radarData, isLoading: radarLoading } = useGetRadarData(
    {
      assessmentId: primaryId ?? 0,
      compareAssessmentIds: compareIds.length > 0 ? compareIds.join(",") : undefined,
    },
    { query: { enabled: selectedAssessmentIds.length > 0 } as any },
  );

  const progressData =
    progress?.cycles?.map((c: any) => {
      const point: any = { name: c.assessmentName };
      c.domainScores.forEach((d: any) => { point[d.domainName] = d.score; });
      point["Overall"] = c.overallScore;
      return point;
    }) ?? [];

  const completedAssessments = (assessments ?? []).filter((a) => a.status === "completed");
  const canExportReports = isSuperAdmin || isCompanyAdmin;
  const recentReportNotes = [...(report?.criterionNotes ?? [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const sortedAssessments = assessments
    ? [...assessments].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    : [];

  async function handleExport() {
    if (!targetCompanyId || !canExportReports) return;
    setIsExporting(true);
    setExportStatus(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        format: exportFormat,
        template: reportTemplate,
      });
      const response = await fetch(getApiUrl(`/reports/company/${targetCompanyId}/export?${params.toString()}`), {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        const message = response.status === 403
          ? "You do not have access to export this report."
          : "Report export failed. Please try again.";
        throw new Error(message);
      }

      const blob = await response.blob();
      const fallbackName = `company-${targetCompanyId}-report.${exportFormat}`;
      const fileName = filenameFromDisposition(response.headers.get("Content-Disposition"), fallbackName);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      const message = `${fileName} downloaded.`;
      setExportStatus(message);
      toast({ title: "Report exported", description: message });
    } catch (error: any) {
      const message = error?.message ?? "Report export failed. Please try again.";
      setExportStatus(message);
      toast({ title: "Export failed", description: message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">Maturity analysis and progress tracking</p>
      </div>

      {/* ── Super Admin: Cross-company comparison ─────────────────────────────── */}
      {isSuperAdmin && (
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Cross-Company Comparison
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select up to 6 companies to overlay their latest completed assessment scores on the same radar
                </p>
              </div>
              {(companies?.length ?? 0) > 0 && (
                <div className="w-full sm:w-80">
                  <CompanyMultiSelect
                    companies={companies ?? []}
                    selectedIds={selectedCrossCompanyIds}
                    onChange={setSelectedCrossCompanyIds}
                    scoreByCompanyId={scoreByCompanyId}
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <OverlayRadarAndTable
              radarData={crossRadarData}
              isLoading={crossRadarLoading}
              chartHeight={320}
              emptyMessage="Select companies above to compare their latest maturity scores on the radar chart."
            />
            <ScoreGuide variant="compact" />
          </CardContent>
        </Card>
      )}

      {/* ── Company selector (Super Admin single-company report) ──────────────── */}
      {isSuperAdmin && (
        <div className="w-64">
          <Label>Company report</Label>
          <Select
            value={selectedCompanyId?.toString() ?? ""}
            onValueChange={(v) => {
              setSelectedCompanyId(Number(v));
              setSelectedAssessmentIds([]);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              {companies?.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {!targetCompanyId && !isLoading && !isSuperAdmin && (
        <div className="text-muted-foreground text-sm">Select a company to view reports.</div>
      )}

      {report && (
        <>
          {canExportReports && (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Export Report
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)_auto] sm:items-end">
                  <div>
                    <Label>Template</Label>
                    <Select value={reportTemplate} onValueChange={(value) => setReportTemplate(value as ReportTemplate)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REPORT_TEMPLATE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Format</Label>
                    <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as ReportExportFormat)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REPORT_FORMAT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleExport} disabled={!targetCompanyId || isExporting} className="sm:self-end">
                    {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    {isExporting ? "Exporting" : "Download"}
                  </Button>
                </div>
                {exportStatus && (
                  <p className="text-xs text-muted-foreground mt-2">{exportStatus}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Summary cards */}
          <div className="grid sm:grid-cols-4 gap-4">
            <Card className="border-card-border">
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{report.assessmentCycles?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total Cycles</p>
              </CardContent>
            </Card>
            <Card className="border-card-border">
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{completedAssessments.length}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </CardContent>
            </Card>
            <Card className="border-card-border">
              <CardContent className="p-4">
                {report.latestResults ? (
                  <>
                    <ScoreBandText
                      score={
                        report.latestResults.aggregateScores.reduce(
                          (a: number, b: any) => a + (b.score ?? 0), 0,
                        ) / (report.latestResults.aggregateScores.filter((x: any) => x.score != null).length || 1)
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-0.5">Latest Overall Score</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold">—</p>
                    <p className="text-xs text-muted-foreground">No completed assessments</p>
                  </>
                )}
              </CardContent>
            </Card>
            <Card className="border-card-border">
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{report.criterionNotes?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Evidence Notes</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-card-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Report evidence notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentReportNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No evidence notes yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentReportNotes.map((note) => (
                    <div key={note.id} className="rounded-md border border-border bg-muted/30 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-medium">Criterion {note.criterionId}</p>
                        <p className="text-xs text-muted-foreground">{new Date(note.createdAt).toLocaleDateString()}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{note.authorName}</p>
                      <p className="text-sm mt-2 line-clamp-3">{note.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assessment overlay radar */}
          {sortedAssessments.length > 0 && (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Maturity Radar
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Select one or more assessment cycles to overlay on the chart
                    </p>
                  </div>
                  <div className="w-full sm:w-72">
                    <AssessmentMultiSelect
                      assessments={sortedAssessments}
                      selectedIds={selectedAssessmentIds}
                      onChange={setSelectedAssessmentIds}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <OverlayRadarAndTable
                  radarData={radarData}
                  isLoading={radarLoading}
                  chartHeight={310}
                  emptyMessage="Select at least one assessment above to view the radar chart."
                />
                <ScoreGuide variant="compact" />
              </CardContent>
            </Card>
          )}

          {/* Progress over time */}
          {progressData.length > 1 && (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Progress Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={progressData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 4]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => Number(v).toFixed(1)} />
                    <Legend />
                    <Line type="monotone" dataKey="Overall" stroke="#6b8ef5" strokeWidth={2.5} dot={{ r: 4 }} />
                    {progress?.cycles?.[0]?.domainScores?.map((_: any, i: number) => {
                      const name = progress.cycles[0].domainScores[i].domainName;
                      return (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={CHART_COLORS[(i + 1) % CHART_COLORS.length]}
                          strokeWidth={1.5}
                          dot={{ r: 3 }}
                          strokeDasharray="4 2"
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Actions overview */}
          {report.actions && report.actions.length > 0 && (
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Actions Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {["not_started", "in_progress", "completed", "on_hold"].map((s) => {
                    const cnt = report.actions.filter((a: any) => a.status === s).length;
                    const label =
                      s === "not_started" ? "Not Started"
                      : s === "in_progress" ? "In Progress"
                      : s === "completed" ? "Completed"
                      : "On Hold";
                    return (
                      <div key={s} className="text-center p-3 rounded-xl bg-muted/50">
                        <p className="text-2xl font-bold">{cnt}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
