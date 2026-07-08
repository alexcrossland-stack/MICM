import { useState } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import { useSelectedCompany } from "@/hooks/useSelectedCompany";
import { getListActionsQueryKey, useListActions, useCreateAction, useUpdateAction, useDeleteAction, useListDomains, useListCompanies, useListUsers, useListAssessments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Zap, Pencil, Trash2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = ["not_started", "in_progress", "completed", "on_hold"];
const PRIORITY_OPTIONS = ["low", "medium", "high"];

const statusConfig: Record<string, { label: string; className: string }> = {
  not_started: { label: "Not Started", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  on_hold: { label: "On Hold", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
};

const priorityConfig: Record<string, { label: string; dot: string }> = {
  low: { label: "Low", dot: "bg-gray-400" },
  medium: { label: "Medium", dot: "bg-yellow-500" },
  high: { label: "High", dot: "bg-red-500" },
};

type ActionForm = {
  title: string;
  description: string;
  priority: string;
  domainId: string;
  dueDate: string;
  status: string;
  assignedUserId: string;
  assessmentId: string;
};
const emptyForm: ActionForm = { title: "", description: "", priority: "medium", domainId: "", dueDate: "", status: "not_started", assignedUserId: "", assessmentId: "" };

export default function ActionsPage() {
  const { isCompanyAdmin, isSuperAdmin } = useCurrentUser();
  const { targetCompanyId, selectedCompanyId, setSelectedCompanyId } = useSelectedCompany();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editAction, setEditAction] = useState<any>(null);
  const [form, setForm] = useState<ActionForm>(emptyForm);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAssignedUserId, setFilterAssignedUserId] = useState<string>("all");
  const [filterAssessmentId, setFilterAssessmentId] = useState<string>("all");

  const { data: actions, isLoading } = useListActions(
    targetCompanyId
      ? {
          companyId: targetCompanyId,
          ...(filterStatus !== "all" ? { status: filterStatus } : {}),
          ...(filterAssignedUserId !== "all" ? { assignedUserId: Number(filterAssignedUserId) } : {}),
          ...(filterAssessmentId !== "all" ? { assessmentId: Number(filterAssessmentId) } : {}),
        }
      : {},
    { query: { enabled: !!targetCompanyId } as any }
  );
  const { data: companies } = useListCompanies({ isActive: true }, { query: { enabled: isSuperAdmin } as any });
  const { data: domains } = useListDomains();
  const { data: users } = useListUsers(
    targetCompanyId ? { companyId: targetCompanyId, isActive: true } : {},
    { query: { enabled: !!targetCompanyId } as any }
  );
  const { data: assessments } = useListAssessments(
    targetCompanyId ? { companyId: targetCompanyId } : {},
    { query: { enabled: !!targetCompanyId } as any }
  );
  const { mutateAsync: createAction, isPending: creating } = useCreateAction();
  const { mutateAsync: updateAction, isPending: updating } = useUpdateAction();
  const { mutateAsync: deleteAction } = useDeleteAction();

  const canManage = isCompanyAdmin || isSuperAdmin;

  function openCreate() {
    setForm(emptyForm);
    setEditAction(null);
    setCreateOpen(true);
  }

  function openEdit(action: any) {
    setForm({
      title: action.title,
      description: action.description ?? "",
      priority: action.priority,
      domainId: action.domainId?.toString() ?? "",
      dueDate: action.dueDate ? format(new Date(action.dueDate), "yyyy-MM-dd") : "",
      status: action.status,
      assignedUserId: action.assignedUserId?.toString() ?? "",
      assessmentId: action.assessmentId?.toString() ?? "",
    });
    setEditAction(action);
    setCreateOpen(true);
  }

  async function handleSave() {
    if (!form.title || !targetCompanyId) return;
    try {
      if (editAction) {
        await updateAction({
          id: editAction.id,
          data: {
            title: form.title,
            description: form.description || undefined,
            priority: form.priority,
            status: form.status,
            assignedUserId: form.assignedUserId ? Number(form.assignedUserId) : null,
            dueDate: form.dueDate || undefined,
          },
        });
        toast({ title: "Action updated" });
      } else {
        await createAction({
          data: {
            companyId: targetCompanyId,
            title: form.title,
            description: form.description || undefined,
            priority: form.priority as "low" | "medium" | "high",
            domainId: form.domainId ? Number(form.domainId) : undefined,
            assessmentId: form.assessmentId ? Number(form.assessmentId) : undefined,
            assignedUserId: form.assignedUserId ? Number(form.assignedUserId) : undefined,
            dueDate: form.dueDate || undefined,
          },
        });
        toast({ title: "Action created" });
      }
      await qc.invalidateQueries({ queryKey: getListActionsQueryKey() });
      setCreateOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this action?")) return;
    await deleteAction({ id });
    await qc.invalidateQueries({ queryKey: getListActionsQueryKey() });
    toast({ title: "Action deleted" });
  }

  const filtered = actions ?? [];

  const statusCounts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = actions?.filter((a: any) => a.status === s).length ?? 0;
    return acc;
  }, {} as Record<string, number>);

  if (isLoading && targetCompanyId) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Actions</h1>
          <p className="text-muted-foreground text-sm mt-1">Track improvement actions and initiatives</p>
        </div>
        {canManage && targetCompanyId && (
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" />New Action</Button>
        )}
      </div>

      {isSuperAdmin && (
        <Card className="border-card-border">
          <CardContent className="p-4">
            <div className="w-full sm:w-80">
              <Label>Company context</Label>
              <Select value={selectedCompanyId?.toString() ?? ""} onValueChange={(value) => setSelectedCompanyId(Number(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company to manage actions" />
                </SelectTrigger>
                <SelectContent>
                  {companies?.map((company) => (
                    <SelectItem key={company.id} value={String(company.id)}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {isSuperAdmin && !targetCompanyId ? (
        <Card className="border-card-border border-dashed">
          <CardContent className="flex flex-col items-center py-12 gap-3">
            <Zap className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Select a company to view or manage actions.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Status summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATUS_OPTIONS.map(s => {
          const sc = statusConfig[s];
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
              className={cn(
                "p-3 rounded-xl border text-left transition-all",
                filterStatus === s ? "border-primary ring-2 ring-primary/20" : "border-card-border hover:border-primary/30",
                "bg-card"
              )}
            >
              <p className="text-2xl font-bold">{statusCounts[s]}</p>
              <p className={`text-xs font-medium mt-0.5 ${sc.className.split(" ").slice(1).join(" ")}`}>{sc.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterStatus("all")}
          className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-all",
            filterStatus === "all" ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary")}
        >
          All ({actions?.length ?? 0})
        </button>
        {STATUS_OPTIONS.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
            className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-all",
              filterStatus === s ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary")}
          >
            {statusConfig[s].label}
          </button>
        ))}
        <Select value={filterAssignedUserId} onValueChange={setFilterAssignedUserId}>
          <SelectTrigger className="w-56 h-8 text-xs"><SelectValue placeholder="Filter assignee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            {users?.map((u: any) => (
              <SelectItem key={u.id} value={String(u.id)}>
                {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAssessmentId} onValueChange={setFilterAssessmentId}>
          <SelectTrigger className="w-56 h-8 text-xs"><SelectValue placeholder="Filter assessment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assessments</SelectItem>
            {assessments?.map((assessment: any) => (
              <SelectItem key={assessment.id} value={String(assessment.id)}>{assessment.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Action list */}
      {!filtered.length ? (
        <Card className="border-dashed border-card-border">
          <CardContent className="flex flex-col items-center py-12 gap-3">
            <Zap className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No actions {filterStatus !== "all" ? `with status "${statusConfig[filterStatus]?.label}"` : "yet"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((action: any) => {
            const sc = statusConfig[action.status];
            const pc = priorityConfig[action.priority];
            const domain = domains?.find((d: any) => d.id === action.domainId);
            return (
              <Card key={action.id} className="border-card-border hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{action.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.className}`}>{sc.label}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />{pc.label}
                        </span>
                      </div>
                      {action.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{action.description}</p>}
                      <div className="flex gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        {domain && <span className="px-1.5 py-0.5 rounded bg-muted">{domain.name}</span>}
                        {action.assignedUserId && <span>Assigned to {users?.find((u: any) => u.id === action.assignedUserId)?.email ?? `User ${action.assignedUserId}`}</span>}
                        {action.assessmentId && <span>Assessment #{action.assessmentId}</span>}
                        {action.dueDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />{format(new Date(action.dueDate), "d MMM yyyy")}
                          </span>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex gap-1 flex-shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(action)} className="h-8 w-8 p-0"><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(action.id)} className="h-8 w-8 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editAction ? "Edit Action" : "New Action"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Action title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Domain (optional)</Label>
                <Select value={form.domainId || "none"} onValueChange={v => setForm(f => ({ ...f, domainId: v === "none" ? "" : v }))} disabled={!!editAction}>
                  <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No domain</SelectItem>
                    {domains?.map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due date</Label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Assigned user</Label>
                <Select value={form.assignedUserId || "none"} onValueChange={v => setForm(f => ({ ...f, assignedUserId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {users?.map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assessment</Label>
                <Select value={form.assessmentId || "none"} onValueChange={v => setForm(f => ({ ...f, assessmentId: v === "none" ? "" : v }))} disabled={!!editAction}>
                  <SelectTrigger><SelectValue placeholder="Select assessment" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No assessment</SelectItem>
                    {assessments?.map((assessment: any) => (
                      <SelectItem key={assessment.id} value={String(assessment.id)}>{assessment.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.title || !targetCompanyId || creating || updating}>{editAction ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
}
