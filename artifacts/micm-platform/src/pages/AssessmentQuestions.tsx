import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import {
  useGetAssessment,
  useGetAssessmentQuestions,
  useGetCompany,
  useListCompanies,
  useListAssessments,
  useListDomains,
  useSaveAssessmentQuestions,
  useCreateAssessmentRevision,
  useUpdateAssessment,
  type AssessmentQuestionInput,
  type AssessmentQuestionSet,
} from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { useSelectedCompany } from "@/hooks/useSelectedCompany";
import { editableQuestion } from "@/lib/assessmentQuestions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type DraftQuestion = AssessmentQuestionInput & { key: string };
const draftRows = (set: AssessmentQuestionSet) =>
  set.questions.map((q) => ({ ...editableQuestion(q), key: String(q.id) }));
const serialize = (rows: AssessmentQuestionInput[]) =>
  JSON.stringify(rows.map(editableQuestion));

export default function AssessmentQuestionsPage() {
  const { isSuperAdmin, isLoaded } = useCurrentUser();
  const [, params] = useRoute("/assessments/:id/questions");
  if (!isLoaded) return <p role="status">Loading access...</p>;
  if (!isSuperAdmin)
    return (
      <p role="alert">
        Super Admin access is required to manage assessment questions.
      </p>
    );
  return params?.id ? (
    <QuestionEditor key={params.id} id={Number(params.id)} />
  ) : (
    <QuestionChooser />
  );
}

function QuestionChooser() {
  const { targetCompanyId, setSelectedCompanyId } = useSelectedCompany();
  const { data: companies, isLoading, error } = useListCompanies();
  const { data: assessments, isLoading: loadingAssessments } =
    useListAssessments(
      { companyId: targetCompanyId ?? undefined },
      { query: { enabled: !!targetCompanyId } as any },
    );
  return (
    <div className="space-y-5 max-w-4xl">
      <h1 className="text-xl font-bold">Assessment Questions</h1>
      {error && <p role="alert">Companies could not be loaded.</p>}
      <label className="block space-y-1 text-sm">
        Company
        <select
          className="block w-full max-w-md rounded-md border bg-background p-2"
          aria-label="Company"
          disabled={isLoading}
          value={targetCompanyId ?? ""}
          onChange={(e) => setSelectedCompanyId(Number(e.target.value) || null)}
        >
          <option value="">Select a company</option>
          {companies
            ?.filter((c) => c.isActive)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      {!targetCompanyId ? (
        <p className="text-sm text-muted-foreground">
          Select a company to view its assessments.
        </p>
      ) : loadingAssessments ? (
        <p role="status">Loading assessments...</p>
      ) : assessments?.length ? (
        <div className="divide-y border-y">
          {assessments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-sm text-muted-foreground">{a.status}</p>
              </div>
              <Link href={`/assessments/${a.id}/questions`}>
                <Button variant="outline" size="sm">
                  Manage questions
                </Button>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No assessments yet.{" "}
          <Link
            className="underline"
            href={`/assessments?companyId=${targetCompanyId}`}
          >
            Create an assessment
          </Link>
        </p>
      )}
    </div>
  );
}

function QuestionEditor({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: assessment, error: assessmentError } = useGetAssessment(id);
  const query = useGetAssessmentQuestions(id, { includeRemoved: "true" });
  const { data: company } = useGetCompany(assessment?.companyId ?? 0, {
    query: { enabled: !!assessment?.companyId } as any,
  });
  const { data: domains, error: catalogueError } = useListDomains();
  const save = useSaveAssessmentQuestions();
  const revise = useCreateAssessmentRevision();
  const update = useUpdateAssessment();
  const [base, setBase] = useState<AssessmentQuestionSet | null>(null);
  const [rows, setRows] = useState<DraftQuestion[]>([]);
  const [showRemoved, setShowRemoved] = useState(false);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [dialog, setDialog] = useState<"save" | "revision" | "unlock" | null>(
    null,
  );
  const [removing, setRemoving] = useState<string | null>(null);
  const [revisionName, setRevisionName] = useState("");
  const dirty = !!base && serialize(rows) !== serialize(base.questions);
  const pending = save.isPending || revise.isPending || update.isPending;
  const canEdit = !!query.data?.canEdit && !pending;

  useEffect(() => {
    if (query.data && !base) {
      setBase(query.data);
      setRows(draftRows(query.data));
    }
  }, [query.data, base]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      if (
        (event.target as Element).closest("a[href]") &&
        !window.confirm("Discard unsaved question changes?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);

  if (query.error || assessmentError || catalogueError)
    return (
      <div role="alert" className="space-y-3">
        <p>
          Assessment questions could not be loaded or access is not permitted.
        </p>
        <Button onClick={() => query.refetch()}>Retry</Button>
      </div>
    );
  if (!base || !assessment || !domains)
    return <p role="status">Loading assessment questions...</p>;
  const categories = domains.flatMap((d) =>
    d.categories.map((c) => ({ ...c, domainName: d.name })),
  );
  const removedRow = rows.find((q) => q.key === removing);
  const added = rows.filter((q) => q.id == null).length;
  const edited = rows.filter(
    (q) =>
      q.id != null &&
      serialize([q]) !== serialize(base.questions.filter((b) => b.id === q.id)),
  ).length;
  const removed = rows.filter(
    (q) =>
      !q.isIncluded &&
      (q.id == null || base.questions.find((b) => b.id === q.id)?.isIncluded),
  ).length;
  const change = (key: string, value: Partial<DraftQuestion>) => {
    setRows((current) =>
      current.map((q) => (q.key === key ? { ...q, ...value } : q)),
    );
    setNotice("");
  };
  const move = (key: string, direction: number) => {
    const q = rows.find((q) => q.key === key)!;
    const siblings = rows
      .filter((row) => row.categoryId === q.categoryId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const index = siblings.findIndex((row) => row.key === key);
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    const orders = new Map(siblings.map((row, index) => [row.key, index]));
    setRows((current) =>
      current.map((row) =>
        orders.has(row.key)
          ? { ...row, orderIndex: orders.get(row.key)! }
          : row,
      ),
    );
  };

  async function confirm() {
    setFailure("");
    try {
      if (dialog === "save") {
        const result = await save.mutateAsync({
          id,
          data: {
            expectedQuestionsVersion: base!.version,
            questions: rows.map(editableQuestion),
          },
        });
        setBase(result);
        setRows(draftRows(result));
        setNotice("Assessment questions saved.");
      } else if (dialog === "revision") {
        const result = await revise.mutateAsync({
          id,
          data: {
            name: revisionName.trim(),
            expectedQuestionsVersion: base!.version,
          },
        });
        await qc.invalidateQueries();
        navigate(`/assessments/${result.id}/questions`);
      } else if (dialog === "unlock") {
        await update.mutateAsync({
          id,
          data: { status: "draft", expectedQuestionsVersion: base!.version },
        });
        const refreshed = await query.refetch();
        if (refreshed.data) {
          setBase(refreshed.data);
          setRows(draftRows(refreshed.data));
        }
        setNotice("Assessment returned to draft.");
      }
      setDialog(null);
      await qc.invalidateQueries();
    } catch (error: any) {
      setFailure(
        error?.data?.error ??
          error?.message ??
          "Changes could not be saved. Reload the saved version before trying again.",
      );
      setDialog(null);
    }
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <Link className="text-sm underline" href={`/assessments/${id}`}>
        Back to assessment
      </Link>
      <div>
        <p className="text-sm text-muted-foreground">{company?.name}</p>
        <h1 className="text-xl font-bold break-words">
          {assessment.name}: Questions
        </h1>
        <p className="text-sm text-muted-foreground">
          {assessment.status} / Version {base.version} /{" "}
          {rows.filter((q) => q.isIncluded).length} included
        </p>
      </div>
      {query.data?.lockReason && (
        <p role="status" className="border-l-4 border-amber-500 pl-3 text-sm">
          {query.data.lockReason}. Create a revised assessment to change
          answered questions.
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {notice}
        </p>
      )}
      {failure && (
        <div role="alert" className="text-sm text-destructive">
          <p>{failure}</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Check latest version
          </Button>
        </div>
      )}
      {query.data && query.data.version !== base.version && (
        <p role="alert">
          Another administrator saved a newer version. Your unsaved changes are
          retained; discard them to load the current version.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setPreview(!preview)}>
          <Eye className="mr-2 h-4 w-4" />
          {preview ? "Edit view" : "Preview"}
        </Button>
        <Button disabled={!canEdit || !dirty} onClick={() => setDialog("save")}>
          <Save className="mr-2 h-4 w-4" />
          Save changes
        </Button>
        <Button
          variant="outline"
          disabled={!dirty || pending}
          onClick={() => {
            if (window.confirm("Discard unsaved question changes?")) {
              const data = query.data ?? base;
              setBase(data);
              setRows(draftRows(data));
              setFailure("");
            }
          }}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Discard changes
        </Button>
        {query.data?.canReturnToDraft && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setDialog("unlock")}
          >
            Return to draft
          </Button>
        )}
        {!query.data?.canEdit && (
          <Button
            variant="outline"
            disabled={pending || dirty}
            onClick={() => {
              setRevisionName(`${assessment.name} - revised`);
              setDialog("revision");
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            Create revised assessment
          </Button>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showRemoved}
            onCheckedChange={(v) => setShowRemoved(v === true)}
          />
          Show removed
        </label>
      </div>
      {rows.length === 0 && <p>No questions yet.</p>}
      {domains.map((domain) => (
        <section key={domain.id} className="border-t pt-4 space-y-3">
          <h2 className="text-lg font-semibold">{domain.name}</h2>
          {!rows.some(
            (q) =>
              q.isIncluded &&
              domain.categories.some((c) => c.id === q.categoryId),
          ) && <p className="text-sm text-muted-foreground">Not assessed</p>}
          {domain.categories.map((category) => (
            <div key={category.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{category.name}</h3>
                {!preview && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canEdit || rows.length >= 500}
                    onClick={() =>
                      setRows((current) => [
                        ...current,
                        {
                          key: crypto.randomUUID(),
                          categoryId: category.id,
                          name: "",
                          description: null,
                          baselineDescription: null,
                          excellenceDescription: null,
                          orderIndex:
                            Math.max(
                              -1,
                              ...current
                                .filter((q) => q.categoryId === category.id)
                                .map((q) => q.orderIndex),
                            ) + 1,
                          isIncluded: true,
                        },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add question
                  </Button>
                )}
              </div>
              {rows
                .filter(
                  (q) =>
                    q.categoryId === category.id &&
                    (q.isIncluded || (showRemoved && !preview)),
                )
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((q) => (
                  <details open key={q.key} className="border rounded-md p-3">
                    <summary className="cursor-pointer font-medium text-sm break-words">
                      {q.name || "New question"}
                      {!q.isIncluded && " (removed)"}
                    </summary>
                    {preview ? (
                      <div className="mt-2 text-sm space-y-2 whitespace-pre-wrap">
                        <p>{q.description}</p>
                        <p>
                          Baseline:{" "}
                          {q.baselineDescription || "No additional guidance"}
                        </p>
                        <p>
                          Excellence:{" "}
                          {q.excellenceDescription || "No additional guidance"}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {rows.some(
                          (other) =>
                            other.key !== q.key &&
                            other.isIncluded &&
                            other.name.trim() &&
                            other.name.trim() === q.name.trim(),
                        ) && (
                          <p className="text-xs text-amber-700">
                            Another question has the same wording. They will be
                            scored separately.
                          </p>
                        )}
                        <label className="block text-sm space-y-1">
                          Question text
                          <Textarea
                            aria-label={`Question text ${q.key}`}
                            maxLength={500}
                            value={q.name}
                            disabled={!canEdit}
                            onChange={(e) =>
                              change(q.key, { name: e.target.value })
                            }
                          />
                        </label>
                        <label className="block text-sm space-y-1">
                          Supporting description
                          <Textarea
                            aria-label={`Supporting description ${q.key}`}
                            maxLength={5000}
                            value={q.description ?? ""}
                            disabled={!canEdit}
                            onChange={(e) =>
                              change(q.key, { description: e.target.value })
                            }
                          />
                        </label>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <label className="block text-sm space-y-1">
                            Baseline guidance
                            <Textarea
                              aria-label={`Baseline guidance ${q.key}`}
                              maxLength={5000}
                              value={q.baselineDescription ?? ""}
                              disabled={!canEdit}
                              onChange={(e) =>
                                change(q.key, {
                                  baselineDescription: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="block text-sm space-y-1">
                            Excellence guidance
                            <Textarea
                              aria-label={`Excellence guidance ${q.key}`}
                              maxLength={5000}
                              value={q.excellenceDescription ?? ""}
                              disabled={!canEdit}
                              onChange={(e) =>
                                change(q.key, {
                                  excellenceDescription: e.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-2 items-end">
                          <label className="text-sm flex-1 min-w-0">
                            Category
                            <select
                              aria-label={`Category ${q.key}`}
                              className="block border rounded-md bg-background p-2 w-full"
                              disabled={!canEdit}
                              value={q.categoryId}
                              onChange={(e) =>
                                change(q.key, {
                                  categoryId: Number(e.target.value),
                                  orderIndex: 0,
                                })
                              }
                            >
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.domainName} / {c.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Button
                            variant="outline"
                            size="icon"
                            title="Move question up"
                            aria-label={`Move ${q.name || "question"} up`}
                            disabled={
                              !canEdit ||
                              rows
                                .filter(
                                  (row) => row.categoryId === q.categoryId,
                                )
                                .sort((a, b) => a.orderIndex - b.orderIndex)[0]
                                ?.key === q.key
                            }
                            onClick={() => move(q.key, -1)}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            title="Move question down"
                            aria-label={`Move ${q.name || "question"} down`}
                            disabled={
                              !canEdit ||
                              rows
                                .filter(
                                  (row) => row.categoryId === q.categoryId,
                                )
                                .sort((a, b) => a.orderIndex - b.orderIndex)
                                .at(-1)?.key === q.key
                            }
                            onClick={() => move(q.key, 1)}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={q.isIncluded ? "destructive" : "outline"}
                            size="sm"
                            disabled={!canEdit}
                            onClick={() =>
                              q.isIncluded
                                ? setRemoving(q.key)
                                : change(q.key, { isIncluded: true })
                            }
                          >
                            {q.isIncluded ? (
                              <Trash2 className="mr-1 h-4 w-4" />
                            ) : (
                              <RotateCcw className="mr-1 h-4 w-4" />
                            )}
                            {q.isIncluded ? "Remove" : "Restore"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </details>
                ))}
            </div>
          ))}
        </section>
      ))}
      <Dialog
        open={!!removedRow}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove question from assessment?</DialogTitle>
            <DialogDescription>{company?.name} / {assessment.name}</DialogDescription>
          </DialogHeader>
          <p className="font-medium break-words">
            {removedRow?.name || "New question"}
          </p>
          <p className="text-sm">
            Other assessments and historical answers will not change. This
            {removedRow?.id == null ? " unsaved question will be discarded." : " question can be restored."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removedRow?.id == null) setRows(current => current.filter(q => q.key !== removing));
                else change(removedRow.key, { isIncluded: false });
                setRemoving(null);
              }}
            >
              Remove from assessment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!dialog}
        onOpenChange={(open) => !open && !pending && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "save"
                ? "Save assessment questions?"
                : dialog === "revision"
                  ? "Create revised assessment"
                  : "Return assessment to draft?"}
            </DialogTitle>
            <DialogDescription>{company?.name} / {assessment.name}</DialogDescription>
          </DialogHeader>
          {dialog === "save" ? (
            <p>
              {added} added, {edited} changed, {removed} removed. Only this
              assessment will change.
            </p>
          ) : dialog === "revision" ? (
            <>
              <label className="text-sm">
                Assessment name
                <Input
                  value={revisionName}
                  maxLength={500}
                  onChange={(e) => setRevisionName(e.target.value)}
                />
              </label>
              <p className="text-sm">
                Answers, evidence and participant assignments will not be
                copied.
              </p>
            </>
          ) : (
            <p className="text-sm">
              Scoring will stop until this assessment is activated again. This
              is allowed only when no answers or evidence have been saved.
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                pending || (dialog === "revision" && !revisionName.trim())
              }
              onClick={confirm}
            >
              {pending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
