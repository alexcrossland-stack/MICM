import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import {
  useGetStandardAssessmentQuestions,
  useSaveStandardAssessmentQuestions,
  getGetStandardAssessmentQuestionsQueryKey,
  getListDomainsQueryKey,
  useListDomains,
  type AssessmentQuestionInput,
  type StandardAssessmentQuestionSet,
} from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { editableQuestion } from "@/lib/assessmentQuestions";
import { Button } from "@/components/ui/button";
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
const draftRows = (set: StandardAssessmentQuestionSet): DraftQuestion[] =>
  set.questions.map((q) => ({ ...editableQuestion(q), key: String(q.id) }));
const serialize = (rows: AssessmentQuestionInput[]) =>
  JSON.stringify(rows.map(editableQuestion));

export default function AssessmentQuestionsPage() {
  const { isSuperAdmin, isLoaded } = useCurrentUser();
  if (!isLoaded) return <p role="status">Loading access...</p>;
  if (!isSuperAdmin)
    return (
      <p role="alert">
        Super Admin access is required to manage standard questions.
      </p>
    );
  return <StandardQuestionEditor />;
}

function StandardQuestionEditor() {
  const qc = useQueryClient();
  const query = useGetStandardAssessmentQuestions();
  const domainQuery = useListDomains();
  const save = useSaveStandardAssessmentQuestions();
  const [base, setBase] = useState<StandardAssessmentQuestionSet | null>(
    () => query.data ?? null,
  );
  const [rows, setRows] = useState<DraftQuestion[]>(() =>
    query.data ? draftRows(query.data) : [],
  );
  const [showRemoved, setShowRemoved] = useState(false);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [confirmSave, setConfirmSave] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const dirty = !!base && serialize(rows) !== serialize(base.questions);
  const stale = !!base && !!query.data && query.data.version !== base.version;
  const included = rows.filter((q) => q.isIncluded).length;
  const valid = included > 0 && rows.every((q) => q.name.trim().length > 0);

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
        !window.confirm("Discard unsaved standard question changes?")
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

  if (query.error || domainQuery.error)
    return (
      <div role="alert" className="space-y-3">
        <p>
          Standard questions could not be loaded or access is not permitted.
        </p>
        <Button
          onClick={() => {
            void query.refetch();
            void domainQuery.refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  if (!base || !domainQuery.data)
    return <p role="status">Loading standard questions...</p>;
  const categories = domainQuery.data.flatMap((d) =>
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
      !q.isIncluded && base.questions.find((b) => b.id === q.id)?.isIncluded,
  ).length;
  const change = (key: string, value: Partial<DraftQuestion>) => {
    setRows((current) =>
      current.map((q) => (q.key === key ? { ...q, ...value } : q)),
    );
    setNotice("");
  };
  const siblingsOf = (q: DraftQuestion) =>
    rows
      .filter((row) => row.categoryId === q.categoryId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  const move = (q: DraftQuestion, direction: number) => {
    const siblings = siblingsOf(q);
    const from = siblings.findIndex((row) => row.key === q.key);
    const to = from + direction;
    if (to < 0 || to >= siblings.length) return;
    [siblings[from], siblings[to]] = [siblings[to], siblings[from]];
    const order = new Map(siblings.map((row, index) => [row.key, index]));
    setRows((current) =>
      current.map((row) =>
        order.has(row.key) ? { ...row, orderIndex: order.get(row.key)! } : row,
      ),
    );
    setNotice("");
  };
  async function persist() {
    if (!base || !valid || stale) return;
    setFailure("");
    setNotice("");
    try {
      const saved = await save.mutateAsync({
        data: {
          expectedVersion: base.version,
          questions: rows.map(editableQuestion),
        },
      });
      setBase(saved);
      setRows(draftRows(saved));
      qc.setQueryData(getGetStandardAssessmentQuestionsQueryKey(), saved);
      await qc.invalidateQueries({ queryKey: getListDomainsQueryKey() });
      setNotice(
        "Standard questions saved for new assessments. Existing assessments are unchanged.",
      );
    } catch (error: any) {
      setFailure(
        error?.data?.error ??
          error?.message ??
          "Standard questions could not be saved. Your changes have been retained.",
      );
      void query.refetch();
    } finally {
      setConfirmSave(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Standard Assessment Questions</h1>
        <p className="text-sm text-muted-foreground">
          Applies to new assessments across all companies / {included} included
        </p>
        <p className="text-sm text-muted-foreground">
          Existing assessments, answers and reports stay unchanged.
        </p>
      </div>
      {notice && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {notice}
        </p>
      )}
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      {stale && (
        <p role="alert">
          Another Super Admin saved newer standard questions. Your changes are
          retained; discard them to load the latest catalogue.
        </p>
      )}
      {!included && (
        <p role="alert" className="text-sm text-destructive">
          Keep at least one standard question included.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setPreview(!preview)}>
          <Eye className="mr-2 h-4 w-4" />
          {preview ? "Edit view" : "Preview"}
        </Button>
        <Button
          disabled={save.isPending || !dirty || !valid || stale}
          onClick={() => setConfirmSave(true)}
        >
          <Save className="mr-2 h-4 w-4" />
          Save standard questions
        </Button>
        <Button
          variant="outline"
          disabled={(!dirty && !stale) || save.isPending}
          onClick={() => {
            if (
              !dirty ||
              window.confirm("Discard unsaved standard question changes?")
            ) {
              const latest = query.data ?? base;
              setBase(latest);
              setRows(draftRows(latest));
              setFailure("");
              setNotice("");
            }
          }}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Discard changes
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showRemoved}
            onCheckedChange={(value) => setShowRemoved(value === true)}
          />
          Show removed
        </label>
      </div>
      {rows.length === 0 && <p>No standard questions yet.</p>}
      {domainQuery.data.map((domain) => (
        <section key={domain.id} className="space-y-3 border-t pt-4">
          <h2 className="text-lg font-semibold">{domain.name}</h2>
          {!rows.some(
            (q) =>
              q.isIncluded &&
              domain.categories.some((c) => c.id === q.categoryId),
          ) && (
            <p className="text-sm text-muted-foreground">
              No included questions
            </p>
          )}
          {domain.categories.map((category) => (
            <div key={category.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{category.name}</h3>
                {!preview && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={save.isPending || rows.length >= 500}
                    onClick={() => {
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
                      ]);
                      setNotice("");
                    }}
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
                  <details open key={q.key} className="rounded-md border p-3">
                    <summary className="cursor-pointer break-words text-sm font-medium">
                      {q.name || "New question"}
                      {!q.isIncluded && " (removed)"}
                    </summary>
                    {preview ? (
                      <div className="mt-2 space-y-2 whitespace-pre-wrap break-words text-sm">
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
                        <label className="block space-y-1 text-sm">
                          Question text
                          <Textarea
                            aria-label={`Question text ${q.key}`}
                            maxLength={500}
                            value={q.name}
                            disabled={save.isPending}
                            onChange={(e) =>
                              change(q.key, { name: e.target.value })
                            }
                          />
                        </label>
                        <label className="block space-y-1 text-sm">
                          Supporting description
                          <Textarea
                            aria-label={`Supporting description ${q.key}`}
                            maxLength={5000}
                            value={q.description ?? ""}
                            disabled={save.isPending}
                            onChange={(e) =>
                              change(q.key, { description: e.target.value })
                            }
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block space-y-1 text-sm">
                            Baseline guidance
                            <Textarea
                              aria-label={`Baseline guidance ${q.key}`}
                              maxLength={5000}
                              value={q.baselineDescription ?? ""}
                              disabled={save.isPending}
                              onChange={(e) =>
                                change(q.key, {
                                  baselineDescription: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="block space-y-1 text-sm">
                            Excellence guidance
                            <Textarea
                              aria-label={`Excellence guidance ${q.key}`}
                              maxLength={5000}
                              value={q.excellenceDescription ?? ""}
                              disabled={save.isPending}
                              onChange={(e) =>
                                change(q.key, {
                                  excellenceDescription: e.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="min-w-0 flex-1 text-sm">
                            Category
                            <select
                              aria-label={`Category ${q.key}`}
                              className="block w-full rounded-md border bg-background p-2"
                              disabled={save.isPending}
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
                              save.isPending || siblingsOf(q)[0]?.key === q.key
                            }
                            onClick={() => move(q, -1)}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            title="Move question down"
                            aria-label={`Move ${q.name || "question"} down`}
                            disabled={
                              save.isPending ||
                              siblingsOf(q).at(-1)?.key === q.key
                            }
                            onClick={() => move(q, 1)}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={q.isIncluded ? "destructive" : "outline"}
                            size="sm"
                            disabled={save.isPending}
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
            <DialogTitle>Remove standard question?</DialogTitle>
            <DialogDescription>
              New assessments only. Existing questions and answers will not
              change.
            </DialogDescription>
          </DialogHeader>
          <p className="break-words font-medium">
            {removedRow?.name || "New question"}
          </p>
          <p className="text-sm">
            {removedRow?.id == null
              ? "This unsaved question will be discarded."
              : "This question can be restored later."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removedRow?.id == null)
                  setRows((current) =>
                    current.filter((q) => q.key !== removing),
                  );
                else change(removedRow.key, { isIncluded: false });
                setRemoving(null);
                setNotice("");
              }}
            >
              Remove from standard questions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirmSave}
        onOpenChange={(open) =>
          !open && !save.isPending && setConfirmSave(false)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save standard assessment questions?</DialogTitle>
            <DialogDescription>
              Applies to new assessments for every company, not existing
              assessments.
            </DialogDescription>
          </DialogHeader>
          <p>
            {added} added, {edited} changed, {removed} removed.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => setConfirmSave(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={save.isPending || !valid || stale}
              onClick={persist}
            >
              {save.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
