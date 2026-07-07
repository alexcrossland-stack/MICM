import { useState } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import { companyScopedPath, useSelectedCompany } from "@/hooks/useSelectedCompany";
import { useListAssessments, useCreateAssessment, useListCompanies } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus, ClipboardList, ChevronRight, Calendar, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  active: { label: "Active", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

export default function AssessmentsPage() {
  const { isSuperAdmin, isCompanyAdmin, userId } = useCurrentUser();
  const { targetCompanyId, selectedCompanyId, setSelectedCompanyId } = useSelectedCompany();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", startDate: "", endDate: "" });
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: companies } = useListCompanies({ query: { enabled: isSuperAdmin } as any });
  const { data: assessments, isLoading } = useListAssessments(
    targetCompanyId ? { companyId: targetCompanyId } : {},
    { query: { enabled: !isSuperAdmin || !!targetCompanyId } as any }
  );

  const { mutateAsync: createAssessment, isPending } = useCreateAssessment();

  async function handleCreate() {
    if (!form.name || !targetCompanyId) return;
    try {
      await createAssessment({
        data: {
          companyId: targetCompanyId,
          name: form.name,
          description: form.description || undefined,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
        },
      });
      qc.invalidateQueries({ queryKey: ["/assessments"] });
      setCreateOpen(false);
      setForm({ name: "", description: "", startDate: "", endDate: "" });
      toast({ title: "Assessment created" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  if (isLoading && targetCompanyId) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assessments</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage and take maturity assessments</p>
        </div>
        {(isCompanyAdmin || isSuperAdmin) && targetCompanyId && (
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />New Assessment
          </Button>
        )}
      </div>

      {isSuperAdmin && (
        <Card className="border-card-border">
          <CardContent className="p-4">
            <div className="w-full sm:w-80">
              <Label>Company context</Label>
              <Select value={selectedCompanyId?.toString() ?? ""} onValueChange={(value) => setSelectedCompanyId(Number(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company to manage assessments" />
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
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <ClipboardList className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Select a company to create or manage assessments.</p>
          </CardContent>
        </Card>
      ) : !assessments?.length ? (
        <Card className="border-card-border border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <ClipboardList className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No assessments yet</p>
            {(isCompanyAdmin || isSuperAdmin) && targetCompanyId && (
              <Button onClick={() => setCreateOpen(true)} size="sm">Create first assessment</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {assessments.map((a: any) => {
            const sc = statusConfig[a.status] ?? statusConfig.draft;
            const isAssigned = a.assignedUserIds?.includes(userId);
            const isCompleted = a.completedUserIds?.includes(userId);
            const canTakeAssessment = (isSuperAdmin || isAssigned) && !isCompleted && a.status === "active";
            return (
              <Card key={a.id} className="border-card-border hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{a.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.className}`}>{sc.label}</span>
                        {isAssigned && !isCompleted && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">Assigned to you</span>
                        )}
                        {isCompleted && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">Completed</span>
                        )}
                      </div>
                      {a.description && <p className="text-xs text-muted-foreground mt-1 truncate">{a.description}</p>}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {a.startDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(a.startDate), "d MMM yyyy")}</span>}
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{a.assignedUserIds?.length ?? 0} assigned</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {a.status === "completed" && (
                        <Link href={companyScopedPath("/analytics", a.companyId)}>
                          <Button variant="outline" size="sm" className="text-xs">View Gap Analysis</Button>
                        </Link>
                      )}
                      {canTakeAssessment && (
                        <Link href={`/assessments/${a.id}/take`}>
                          <Button size="sm" className="text-xs">Take Assessment</Button>
                        </Link>
                      )}
                      <Link href={`/assessments/${a.id}`}>
                        <Button variant="ghost" size="sm" className="gap-1 text-xs">
                          Details<ChevronRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Assessment Cycle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input placeholder="e.g. Q1 2026 Maturity Review" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea placeholder="Brief description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start date</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <Label>End date</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.name || !targetCompanyId || isPending}>{isPending ? "Creating..." : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
