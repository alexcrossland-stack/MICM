import { useRoute, Link } from "wouter";
import { useCurrentUser } from "@/hooks/useAuth";
import { companyScopedPath } from "@/hooks/useSelectedCompany";
import {
  useGetAssessment,
  useGetAssessmentResults,
  useUpdateAssessment,
  useAssignAssessment,
  useListCompanyUsers,
  useGetRadarData,
  useListDomains,
  useListScores,
  useListCriterionNotes,
  useCreateCriterionNote,
  getGetAssessmentResultsQueryKey,
  getGetCompanyReportQueryKey,
  getGetRadarDataQueryKey,
  getListCriterionNotesQueryKey,
  type CriterionNote,
  type Domain,
  type Score,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Users, CheckCircle2, ChevronLeft, Play, MessageSquare, Plus, Loader2, AlertCircle } from "lucide-react";
import { ScoreGuide } from "@/components/ScoreGuide";

const RADAR_COLORS = ["#6b8ef5", "#f5a97c", "#9cf5a4", "#f5e97c", "#c47cf5", "#7cf5e5"];

type CriterionOption = {
  id: number;
  name: string;
  categoryName: string;
  domainName: string;
};

type MissingScoreSection = {
  userId: number | null;
  userName: string;
  domainName: string | null;
  categoryName: string | null;
  missingCriteriaCount: number;
  missingCriteria: string[];
};

function buildCriterionOptions(domains: Domain[] | undefined): CriterionOption[] {
  return (domains ?? []).flatMap((domain) =>
    domain.categories.flatMap((category) =>
      category.criteria.map((criterion) => ({
        id: criterion.id,
        name: criterion.name,
        categoryName: category.name,
        domainName: domain.name,
      })),
    ),
  );
}

function formatNoteDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildMissingScoreSections(
  assignedUserIds: number[] | undefined,
  users: any[] | undefined,
  domains: Domain[] | undefined,
  scores: Score[] | undefined,
): MissingScoreSection[] {
  const allCriteria = (domains ?? []).flatMap((domain) =>
    domain.categories.flatMap((category) =>
      category.criteria.map((criterion) => ({ ...criterion, categoryName: category.name, domainName: domain.name })),
    ),
  );
  const assignees = assignedUserIds ?? [];

  if (assignees.length === 0) {
    return [{
      userId: null,
      userName: "No assigned users",
      domainName: null,
      categoryName: null,
      missingCriteriaCount: allCriteria.length,
      missingCriteria: allCriteria.map((criterion) => criterion.name),
    }];
  }

  const userById = new Map((users ?? []).map((user) => [user.id, user]));
  const scoresByUserId = new Map<number, Set<number>>();
  for (const score of scores ?? []) {
    const userScores = scoresByUserId.get(score.userId) ?? new Set<number>();
    userScores.add(score.criterionId);
    scoresByUserId.set(score.userId, userScores);
  }

  return assignees.flatMap((userId) => {
    const user = userById.get(userId);
    const userName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : `User ${userId}`;
    const scoredCriteria = scoresByUserId.get(userId) ?? new Set<number>();
    return (domains ?? []).flatMap((domain) =>
      domain.categories.flatMap((category) => {
        const missingCriteria = category.criteria.filter((criterion) => !scoredCriteria.has(criterion.id));
        if (missingCriteria.length === 0) return [];
        return [{
          userId,
          userName,
          domainName: domain.name,
          categoryName: category.name,
          missingCriteriaCount: missingCriteria.length,
          missingCriteria: missingCriteria.map((criterion) => criterion.name),
        }];
      }),
    );
  });
}

export default function AssessmentDetailPage() {
  const [, params] = useRoute("/assessments/:id");
  const id = Number(params?.id);
  const { companyId, isCompanyAdmin, isSuperAdmin, userId, clerkUser } = useCurrentUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [selectedCriterionId, setSelectedCriterionId] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [apiMissingScoreSections, setApiMissingScoreSections] = useState<MissingScoreSection[]>([]);

  const { data: assessment, isLoading } = useGetAssessment(id);
  const { data: results } = useGetAssessmentResults(id);
  const { data: radarData } = useGetRadarData({ assessmentId: id });
  const assessmentCompanyId = assessment?.companyId ?? companyId ?? 0;
  const { data: users } = useListCompanyUsers(assessmentCompanyId, { query: { enabled: !!assessmentCompanyId } as any });
  const { mutateAsync: updateAssessment } = useUpdateAssessment();
  const { mutateAsync: assignAssessment } = useAssignAssessment();
  const canManage = isCompanyAdmin || isSuperAdmin;
  const isAssigned = userId != null && !!assessment?.assignedUserIds?.includes(userId);
  const canUseEvidenceNotes = canManage || isAssigned;
  const { data: domains, isLoading: domainsLoading } = useListDomains({
    query: { enabled: canUseEvidenceNotes } as any,
  });
  const { data: scores, isLoading: scoresLoading } = useListScores(
    { assessmentId: id },
    { query: { enabled: !!id && canManage && assessment?.status === "active" } as any },
  );
  const {
    data: criterionNotes,
    isLoading: notesLoading,
    error: notesError,
  } = useListCriterionNotes(
    { assessmentId: id },
    { query: { enabled: !!id && canUseEvidenceNotes } as any },
  );
  const { mutateAsync: createCriterionNote, isPending: creatingNote } = useCreateCriterionNote();

  useEffect(() => {
    if (!selectedCriterionId) return;
    const criterionId = Number(selectedCriterionId);
    const criterionStillExists = (domains ?? []).some((domain) =>
      domain.categories.some((category) =>
        category.criteria.some((criterion) => criterion.id === criterionId),
      ),
    );
    if (!criterionStillExists) setSelectedCriterionId("");
  }, [domains, selectedCriterionId]);

  if (isLoading || !assessment) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const isMyCompleted = userId != null && assessment.completedUserIds?.includes(userId);
  const canTakeAssessment = (isSuperAdmin || isAssigned) && !isMyCompleted && assessment.status === "active";
  const displayUsers: any[] = [...(users ?? [])];
  if (isSuperAdmin && userId != null && !displayUsers.some((user) => user.id === userId)) {
    displayUsers.push({
      id: userId,
      firstName: clerkUser?.firstName ?? "Super",
      lastName: clerkUser?.lastName ?? "Admin",
      email: clerkUser?.primaryEmailAddress?.emailAddress ?? "Super Admin",
    });
  }
  const criterionOptions = buildCriterionOptions(domains);
  const criterionById = new Map(criterionOptions.map((criterion) => [criterion.id, criterion]));
  const sortedCriterionNotes = [...(criterionNotes ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const missingScoreSections = canManage
    ? buildMissingScoreSections(assessment.assignedUserIds, displayUsers, domains, scores)
    : [];
  const displayedMissingScoreSections = apiMissingScoreSections.length > 0 ? apiMissingScoreSections : missingScoreSections;
  const canMarkComplete = !scoresLoading && !domainsLoading && displayedMissingScoreSections.length === 0;

  const radarChartData = radarData ? radarData.domains.map((name: string, i: number) => {
    const point: any = { domain: name };
    radarData.series.forEach((s: any) => { point[s.label] = s.scores[i] ?? 0; });
    return point;
  }) : [];

  async function handleStatusChange(status: string) {
    setCompletionMessage(null);
    setApiMissingScoreSections([]);
    if (status === "completed" && !canMarkComplete) {
      setCompletionMessage("This assessment still has missing required scores.");
      return;
    }
    setStatusUpdating(true);
    try {
      await updateAssessment({ id, data: { status } });
      qc.invalidateQueries();
      toast({ title: `Assessment ${status}` });
    } catch (e: any) {
      const missingSections = e?.response?.data?.missingSections;
      if (Array.isArray(missingSections)) {
        setApiMissingScoreSections(missingSections);
        setCompletionMessage(e.response.data.error ?? "This assessment still has missing required scores.");
      }
      toast({ title: "Error", description: e?.response?.data?.error ?? e.message, variant: "destructive" });
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleAssign() {
    try {
      await assignAssessment({ id, data: { userIds: selectedUsers } });
      qc.invalidateQueries();
      toast({ title: "Users assigned" });
      setAssignOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleCreateNote() {
    const criterionId = Number(selectedCriterionId);
    const note = noteText.trim();
    if (!criterionId || !note) return;
    const submittedCriterion = criterionById.get(criterionId);
    if (!submittedCriterion) {
      setNoteStatus("Select a valid criterion before saving the note.");
      return;
    }
    setNoteStatus(null);
    try {
      const savedNote = await createCriterionNote({ data: { assessmentId: id, criterionId, note } });
      if (savedNote.criterionId !== criterionId) {
        throw new Error("Evidence note was saved against a different criterion. Refresh and try again.");
      }
      setNoteText("");
      setSelectedCriterionId("");
      setNoteStatus(`Evidence note saved for ${submittedCriterion.domainName} / ${submittedCriterion.name}.`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: getListCriterionNotesQueryKey({ assessmentId: id }) }),
        qc.invalidateQueries({ queryKey: getGetAssessmentResultsQueryKey(id) }),
        qc.invalidateQueries({ queryKey: getGetRadarDataQueryKey({ assessmentId: id }) }),
        qc.invalidateQueries({ queryKey: getGetCompanyReportQueryKey(assessmentCompanyId) }),
      ]);
      toast({ title: "Evidence note saved" });
    } catch (e: any) {
      const message = e?.response?.status === 403
        ? "You do not have access to add notes for this assessment."
        : e?.message ?? "Evidence note could not be saved.";
      setNoteStatus(message);
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  }

  const statusConfig: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    active: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/assessments">
          <Button variant="ghost" size="sm" className="gap-1"><ChevronLeft className="w-4 h-4" />Back</Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{assessment.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusConfig[assessment.status]}`}>{assessment.status}</span>
          </div>
          {assessment.description && <p className="text-sm text-muted-foreground mt-0.5">{assessment.description}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {canManage && assessment.status === "draft" && (
          <Button size="sm" onClick={() => handleStatusChange("active")} disabled={statusUpdating} className="gap-2">
            <Play className="w-3.5 h-3.5" />Activate
          </Button>
        )}
        {canManage && assessment.status === "active" && (
          <Button size="sm" variant="outline" onClick={() => handleStatusChange("completed")} disabled={statusUpdating || !canMarkComplete}>
            {scoresLoading || domainsLoading ? "Checking scores" : "Mark Completed"}
          </Button>
        )}
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => { setSelectedUsers(assessment.assignedUserIds ?? []); setAssignOpen(true); }} className="gap-2">
            <Users className="w-3.5 h-3.5" />Assign Users
          </Button>
        )}
        {canTakeAssessment && (
          <Link href={`/assessments/${id}/take`}>
            <Button size="sm" className="gap-2"><CheckCircle2 className="w-3.5 h-3.5" />Take Assessment</Button>
          </Link>
        )}
        {assessment.status === "completed" && (
          <Link href={companyScopedPath("/analytics", assessment.companyId)}>
            <Button size="sm" className="gap-2">View Gap Analysis</Button>
          </Link>
        )}
      </div>

      {canManage && assessment.status === "active" && displayedMissingScoreSections.length > 0 && (
        <Card className="border-card-border border-yellow-200 bg-yellow-50/60 dark:border-yellow-900/60 dark:bg-yellow-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-700 dark:text-yellow-400" />
              Incomplete sections
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Required scores are missing. Complete the sections below before marking this assessment completed.
            </p>
            {completionMessage && <p className="text-sm text-yellow-800 dark:text-yellow-300">{completionMessage}</p>}
            <div className="space-y-1.5">
              {displayedMissingScoreSections.slice(0, 8).map((section, index) => (
                <div key={`${section.userId ?? "none"}-${section.domainName ?? "none"}-${section.categoryName ?? "none"}-${index}`} className="rounded-md border border-yellow-200 bg-background/70 px-3 py-2 text-sm dark:border-yellow-900/60">
                  <span className="font-medium">{section.userName}</span>
                  {section.domainName && section.categoryName ? ` · ${section.domainName} / ${section.categoryName}` : ""}
                  <span className="text-muted-foreground"> · {section.missingCriteriaCount} missing</span>
                </div>
              ))}
              {displayedMissingScoreSections.length > 8 && (
                <p className="text-xs text-muted-foreground">
                  {displayedMissingScoreSections.length - 8} more incomplete section{displayedMissingScoreSections.length - 8 === 1 ? "" : "s"}.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assignees */}
      <Card className="border-card-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Participants</CardTitle>
        </CardHeader>
        <CardContent>
          {assessment.assignedUserIds?.length ? (
            <div className="flex flex-wrap gap-2">
              {assessment.assignedUserIds.map((uid: number) => {
                const u = displayUsers.find((u: any) => u.id === uid);
                const done = assessment.completedUserIds?.includes(uid);
                return (
                  <div key={uid} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border ${done ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400" : "bg-card border-border text-foreground"}`}>
                    {done && <CheckCircle2 className="w-3 h-3" />}
                    {u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : `User ${uid}`}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No users assigned yet</p>
          )}
        </CardContent>
      </Card>

      {/* Radar chart */}
      {radarChartData.length > 0 && (radarData?.series?.length ?? 0) > 0 && (
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Results Radar</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarChartData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <PolarRadiusAxis angle={30} domain={[0, 4]} tick={{ fontSize: 10 }} />
                {radarData?.series.map((s: any, i: number) => (
                  <Radar key={s.label} name={s.label} dataKey={s.label} stroke={RADAR_COLORS[i % RADAR_COLORS.length]} fill={RADAR_COLORS[i % RADAR_COLORS.length]} fillOpacity={0.2} strokeWidth={2} />
                ))}
                <Tooltip formatter={(v: any) => [Number(v).toFixed(1), ""]} />
                {(radarData?.series?.length ?? 0) > 1 && <Legend />}
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Results table */}
      {results && (
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Score Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Domain</th>
                    {results.userScores.map((u: any) => (
                      <th key={u.userId} className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs">{u.userName}</th>
                    ))}
                    <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs">Average</th>
                  </tr>
                </thead>
                <tbody>
                  {results.aggregateScores.map((agg: any, i: number) => (
                    <tr key={agg.domainId} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-xs">{agg.domainName}</td>
                      {results.userScores.map((u: any) => {
                        const ds = u.domainScores[i];
                        return <td key={u.userId} className="text-center px-3 py-2.5 text-xs">{ds?.score?.toFixed(1) ?? "—"}</td>;
                      })}
                      <td className="text-center px-3 py-2.5 text-xs font-semibold">{agg.score?.toFixed(1) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-4">
              <ScoreGuide variant="compact" />
            </div>
          </CardContent>
        </Card>
      )}

      {canUseEvidenceNotes && (
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Evidence notes
              {criterionNotes && <Badge variant="secondary">{criterionNotes.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(notesLoading || domainsLoading) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading evidence notes
              </div>
            )}

            {notesError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                {(notesError as any)?.response?.status === 403
                  ? "You do not have access to view notes for this assessment."
                  : "Evidence notes could not be loaded."}
              </div>
            )}

            {!notesLoading && !notesError && sortedCriterionNotes.length === 0 && (
              <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                No evidence notes yet.
              </div>
            )}

            {sortedCriterionNotes.length > 0 && (
              <div className="space-y-2">
                {sortedCriterionNotes.map((note: CriterionNote) => {
                  const criterion = criterionById.get(note.criterionId);
                  return (
                    <div key={note.id} className="rounded-md border border-border bg-muted/30 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium">
                            {criterion ? `${criterion.domainName} / ${criterion.categoryName} / ${criterion.name}` : `Criterion ${note.criterionId}`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {note.authorName} · {formatNoteDate(note.createdAt)}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm mt-2 whitespace-pre-wrap">{note.note}</p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid gap-3 border-t border-border pt-4">
              <div className="grid gap-1.5">
                <Label>Criterion</Label>
                <Select value={selectedCriterionId} onValueChange={setSelectedCriterionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select criterion" />
                  </SelectTrigger>
                  <SelectContent>
                    {criterionOptions.map((criterion) => (
                      <SelectItem key={criterion.id} value={String(criterion.id)}>
                        {criterion.domainName} / {criterion.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Evidence note</Label>
                <Textarea
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  rows={3}
                  placeholder="Add an evidence note or improvement note"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={handleCreateNote}
                  disabled={!selectedCriterionId || !noteText.trim() || creatingNote}
                  className="gap-2"
                >
                  {creatingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add note
                </Button>
                {noteStatus && <p className="text-xs text-muted-foreground">{noteStatus}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assign dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Users</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {users?.map((u: any) => (
              <label key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted cursor-pointer">
                <Checkbox
                  checked={selectedUsers.includes(u.id)}
                  onCheckedChange={c => setSelectedUsers(prev => c ? [...prev, u.id] : prev.filter(id => id !== u.id))}
                />
                <span className="text-sm">{[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}</span>
                <span className="text-xs text-muted-foreground ml-auto">{u.role}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
