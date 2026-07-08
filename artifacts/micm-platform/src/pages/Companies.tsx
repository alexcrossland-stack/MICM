import { useState } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import { companyScopedPath, useSelectedCompany } from "@/hooks/useSelectedCompany";
import { useListCompanies, useCreateCompany, useUpdateCompany } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Pencil, Archive, RotateCcw, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

const SECTORS = ["Manufacturing", "Engineering", "Automotive", "Aerospace", "Food & Drink", "Pharmaceutical", "Electronics", "Defence", "Other"];
const SIZES = ["1-9", "10-49", "50-249", "250-999", "1000+"];

type CompanyForm = { name: string; sector: string; size: string; contactEmail: string };
const emptyForm: CompanyForm = { name: "", sector: "", size: "", contactEmail: "" };

export function companyArchiveConfirmationMatches(companyName: string, confirmation: string) {
  return confirmation.trim() === companyName;
}

export default function CompaniesPage() {
  const { isSuperAdmin } = useCurrentUser();
  const { setSelectedCompanyId } = useSelectedCompany();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<any>(null);
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveCompany, setArchiveCompany] = useState<any>(null);
  const [archiveConfirmation, setArchiveConfirmation] = useState("");

  const { data: companies, isLoading } = useListCompanies(
    { isActive: showArchived ? false : true },
    { query: { enabled: isSuperAdmin } as any },
  );
  const { mutateAsync: createCompany, isPending: creating } = useCreateCompany();
  const { mutateAsync: updateCompany, isPending: updating } = useUpdateCompany();

  if (!isSuperAdmin) return <div className="text-muted-foreground p-8 text-center">Access denied</div>;
  if (isLoading) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  function openCreate() {
    setForm(emptyForm);
    setEditCompany(null);
    setFormOpen(true);
  }

  function openEdit(co: any) {
    setForm({ name: co.name, sector: co.sector ?? "", size: co.size ?? "", contactEmail: co.contactEmail ?? "" });
    setEditCompany(co);
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.sector || !form.size) return;
    try {
      if (editCompany) {
        await updateCompany({ id: editCompany.id, data: { name: form.name, sector: form.sector || undefined, size: form.size || undefined, contactEmail: form.contactEmail || undefined } });
        setSelectedCompanyId(editCompany.id);
        toast({ title: "Company updated" });
      } else {
        const company = await createCompany({ data: { name: form.name.trim(), sector: form.sector, size: form.size, contactEmail: form.contactEmail || undefined } });
        setSelectedCompanyId(company.id);
        toast({ title: "Company created" });
      }
      qc.invalidateQueries();
      setFormOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  function openArchiveDialog(company: any) {
    setArchiveCompany(company);
    setArchiveConfirmation("");
  }

  async function handleToggleActive() {
    if (!archiveCompany) return;
    const company = archiveCompany;
    const nextActive = !company.isActive;
    try {
      await updateCompany({ id: company.id, data: { isActive: nextActive } });
      qc.invalidateQueries();
      toast({ title: nextActive ? "Company reactivated" : "Company archived" });
      setArchiveCompany(null);
      setArchiveConfirmation("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  const archiveAction = archiveCompany?.isActive ? "Archive" : "Reactivate";
  const archiveConfirmationValid = archiveCompany
    ? companyArchiveConfirmationMatches(archiveCompany.name, archiveConfirmation)
    : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage client companies on the platform</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Showing archived" : "Active companies only"}
          </Button>
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" />New Company</Button>
        </div>
      </div>

      {!companies?.length ? (
        <Card className="border-dashed border-card-border">
          <CardContent className="flex flex-col items-center py-12 gap-3">
            <Building2 className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{showArchived ? "No archived companies" : "No active companies yet"}</p>
            {!showArchived && <Button onClick={openCreate} size="sm">Add first company</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((co: any) => (
            <Card key={co.id} className="border-card-border hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm truncate">{co.name}</h3>
                        {!co.isActive && <p className="text-xs text-destructive">Archived</p>}
                      </div>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {co.sector && <p>{co.sector}</p>}
                      {co.size && <p>{co.size} employees</p>}
                      {co.contactEmail && <p>{co.contactEmail}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(co)} className="h-7 w-7 p-0">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant={co.isActive ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => openArchiveDialog(co)}
                      className="h-7 text-xs gap-1"
                      aria-label={`${co.isActive ? "Archive" : "Reactivate"} company ${co.name}`}
                    >
                      {co.isActive ? <Archive className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                      {co.isActive ? "Archive" : "Reactivate"}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link href={companyScopedPath("/info", co.id)}>
                    <Button variant="outline" size="sm" className="text-xs h-7">Info</Button>
                  </Link>
                  <Link href={companyScopedPath("/users", co.id)}>
                    <Button variant="outline" size="sm" className="text-xs h-7">Users</Button>
                  </Link>
                  <Link href={companyScopedPath("/assessments", co.id)}>
                    <Button variant="outline" size="sm" className="text-xs h-7">Assessments</Button>
                  </Link>
                  <Link href={companyScopedPath("/reports", co.id)}>
                    <Button variant="outline" size="sm" className="text-xs h-7">Reports</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editCompany ? "Edit Company" : "New Company"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Company name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Manufacturing Ltd" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sector</Label>
                <Select value={form.sector} onValueChange={v => setForm(f => ({ ...f, sector: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                  <SelectContent>
                    {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Size</Label>
                <Select value={form.size} onValueChange={v => setForm(f => ({ ...f, size: v }))}>
                  <SelectTrigger><SelectValue placeholder="Employees" /></SelectTrigger>
                  <SelectContent>
                    {SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Contact email</Label>
              <Input type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="contact@company.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !form.sector || !form.size || creating || updating}>{editCompany ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!archiveCompany} onOpenChange={(open) => {
        if (!open) {
          setArchiveCompany(null);
          setArchiveConfirmation("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              {archiveAction} company: {archiveCompany?.name}
            </DialogTitle>
          </DialogHeader>
          {archiveCompany && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                {archiveCompany.isActive ? (
                  <p>
                    Archiving <span className="font-semibold">{archiveCompany.name}</span> will hide it from normal company selectors and lists. Existing assessments, actions, reports, and audit history will be preserved.
                  </p>
                ) : (
                  <p>
                    Reactivating <span className="font-semibold">{archiveCompany.name}</span> will make it available in normal company selectors and lists again.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-archive-confirmation">
                  Type the company name to confirm
                </Label>
                <Input
                  id="company-archive-confirmation"
                  value={archiveConfirmation}
                  onChange={(event) => setArchiveConfirmation(event.target.value)}
                  placeholder={archiveCompany.name}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setArchiveCompany(null);
                setArchiveConfirmation("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant={archiveCompany?.isActive ? "destructive" : "default"}
              onClick={handleToggleActive}
              disabled={!archiveConfirmationValid || updating}
              className="gap-2"
            >
              {archiveCompany?.isActive ? <Archive className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              {archiveAction} {archiveCompany?.name}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
