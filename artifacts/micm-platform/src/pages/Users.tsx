import { useState } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import { useSelectedCompany } from "@/hooks/useSelectedCompany";
import { useListUsers, useUpdateUser, useTriggerUserPasswordReset, useCreateInvitation, useListInvitations, useListCompanies } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Mail, Copy, Check, UserCheck, Pencil, RotateCcw, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

const roleConfig: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  company_admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  company_user: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};
const roleLabel: Record<string, string> = {
  super_admin: "Super Admin",
  company_admin: "Company Admin",
  company_user: "User",
};

export default function UsersPage() {
  const { companyId, isSuperAdmin, isCompanyAdmin } = useCurrentUser();
  const { targetCompanyId, selectedCompanyId, setSelectedCompanyId } = useSelectedCompany();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "company_user", companyId: "" });
  const [editUser, setEditUser] = useState<any>(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", role: "company_user", companyId: "" });
  const [showInactive, setShowInactive] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const canManage = isCompanyAdmin || isSuperAdmin;

  const userParams = isSuperAdmin
    ? {
        ...(selectedCompanyId ? { companyId: selectedCompanyId } : {}),
        ...(showInactive ? {} : { isActive: true }),
      }
    : {
        ...(companyId ? { companyId } : {}),
        ...(showInactive ? {} : { isActive: true }),
      };
  const { data: users, isLoading } = useListUsers(
    userParams,
    { query: { enabled: canManage } as any }
  );
  const { data: invitations } = useListInvitations(
    isSuperAdmin && !selectedCompanyId ? {} : targetCompanyId ? { companyId: targetCompanyId } : {},
    { query: { enabled: canManage } as any }
  );
  const { data: companies } = useListCompanies({ query: { enabled: isSuperAdmin } as any });
  const { mutateAsync: createInvitation, isPending } = useCreateInvitation();
  const isInvitingSuperAdmin = inviteForm.role === "super_admin";
  const isInviteDisabled = !inviteForm.email
    || isPending
    || (isSuperAdmin && !isInvitingSuperAdmin && !(inviteForm.companyId || selectedCompanyId));
  const { mutateAsync: updateUser, isPending: updatingUser } = useUpdateUser();
  const { mutateAsync: triggerPasswordReset, isPending: resettingPassword } = useTriggerUserPasswordReset();

  async function handleInvite() {
    if (!inviteForm.email) return;
    try {
      await createInvitation({
        data: {
          email: inviteForm.email,
          role: inviteForm.role as "super_admin" | "company_admin" | "company_user",
          companyId: inviteForm.role === "super_admin"
            ? undefined
            : inviteForm.companyId ? Number(inviteForm.companyId) : targetCompanyId ?? companyId ?? undefined,
        },
      });
      qc.invalidateQueries();
      toast({ title: "Invitation sent", description: `Invitation created for ${inviteForm.email}` });
      setInviteOpen(false);
      setInviteForm({ email: "", role: "company_user", companyId: "" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  function copyToken(token: string, id: number) {
    const base = window.location.origin + (import.meta.env.BASE_URL ?? "/");
    navigator.clipboard.writeText(`${base}onboarding?token=${token}`);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function openEditUser(user: any) {
    setEditUser(user);
    setEditForm({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      role: user.role,
      companyId: user.companyId?.toString() ?? "",
    });
  }

  async function handleSaveUser() {
    if (!editUser) return;
    try {
      await updateUser({
        id: editUser.id,
        data: {
          firstName: editForm.firstName || null,
          lastName: editForm.lastName || null,
          ...(isSuperAdmin ? {
            role: editForm.role as "super_admin" | "company_admin" | "company_user",
            companyId: editForm.role === "super_admin" ? null : Number(editForm.companyId),
          } : {}),
        },
      });
      qc.invalidateQueries();
      toast({ title: "User updated" });
      setEditUser(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleToggleActive(user: any) {
    const nextActive = !user.isActive;
    const action = nextActive ? "reactivate" : "deactivate";
    if (!confirm(`Are you sure you want to ${action} ${user.email}?`)) return;
    try {
      await updateUser({ id: user.id, data: { isActive: nextActive } });
      qc.invalidateQueries();
      toast({ title: nextActive ? "User reactivated" : "User deactivated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handlePasswordReset(user: any) {
    if (!confirm(`Send a Clerk-managed password setup/reset email to ${user.email}?`)) return;
    try {
      await triggerPasswordReset({ id: user.id });
      toast({ title: "Password setup email requested" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  if (isLoading) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage team members and invitations</p>
        </div>
        {canManage && (
          <Button onClick={() => setInviteOpen(true)} className="gap-2"><Plus className="w-4 h-4" />Invite User</Button>
        )}
      </div>

      {isSuperAdmin && (
        <Card className="border-card-border">
          <CardContent className="p-4">
            <div className="w-full sm:w-80">
              <Label>Company context</Label>
              <Select value={selectedCompanyId?.toString() ?? "all"} onValueChange={(value) => setSelectedCompanyId(value === "all" ? null : Number(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company to manage users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {companies?.map((company) => (
                    <SelectItem key={company.id} value={String(company.id)}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Super Admin users are global. Company Admin and User accounts are linked to a company.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button variant={showInactive ? "default" : "outline"} size="sm" onClick={() => setShowInactive(!showInactive)}>
          {showInactive ? "Showing inactive" : "Active users only"}
        </Button>
      </div>

      {/* Users table */}
      <Card className="border-card-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><UserCheck className="w-4 h-4" />Team Members ({users?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!users?.length ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">No users yet</div>
          ) : (
            <div className="divide-y divide-border">
              {users.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleConfig[u.role] ?? ""}`}>{roleLabel[u.role] ?? u.role}</span>
                    {!u.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">Inactive</span>}
                    {u.role === "super_admin" && <ShieldCheck className="w-4 h-4 text-purple-600" />}
                    {canManage && (
                      <>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditUser(u)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handlePasswordReset(u)} disabled={resettingPassword}>
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleToggleActive(u)}>
                          {u.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending invitations */}
      {invitations && invitations.length > 0 && (
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Mail className="w-4 h-4" />Pending Invitations ({invitations.filter((i: any) => i.status === "pending").length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {invitations.filter((i: any) => i.status === "pending").map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {format(new Date(inv.expiresAt), "d MMM yyyy")} · {roleLabel[inv.role] ?? inv.role}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToken(inv.token, inv.id)}
                    className="gap-1.5 text-xs h-7"
                  >
                    {copied === inv.id ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy Link</>}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="colleague@company.com" />
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={inviteForm.role}
                onValueChange={v => setInviteForm(f => ({
                  ...f,
                  role: v,
                  companyId: v === "super_admin" ? "" : f.companyId,
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_user">User</SelectItem>
                  <SelectItem value="company_admin">Company Admin</SelectItem>
                  {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {isSuperAdmin && isInvitingSuperAdmin && (
              <p className="text-sm text-muted-foreground">
                Super Admin users are global and are not attached to a company.
              </p>
            )}
            {isSuperAdmin && !isInvitingSuperAdmin && (
              <div>
                <Label>Company</Label>
                <Select value={inviteForm.companyId || selectedCompanyId?.toString() || ""} onValueChange={v => setInviteForm(f => ({ ...f, companyId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                  <SelectContent>
                    {companies?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={isInviteDisabled}>{isPending ? "Sending..." : "Send Invitation"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First name</Label>
                <Input value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div>
                <Label>Last name</Label>
                <Input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input value={editUser?.email ?? ""} disabled />
              <p className="text-xs text-muted-foreground mt-1">Email changes are managed in Clerk to keep authentication records consistent.</p>
            </div>
            {isSuperAdmin && (
              <>
                <div>
                  <Label>Role</Label>
                  <Select value={editForm.role} onValueChange={v => setEditForm(f => ({ ...f, role: v, companyId: v === "super_admin" ? "" : f.companyId }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company_user">User</SelectItem>
                      <SelectItem value="company_admin">Company Admin</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editForm.role !== "super_admin" ? (
                  <div>
                    <Label>Company</Label>
                    <Select value={editForm.companyId} onValueChange={v => setEditForm(f => ({ ...f, companyId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                      <SelectContent>
                        {companies?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Super Admin users are global and have no company assignment.</p>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button
              onClick={handleSaveUser}
              disabled={updatingUser || (isSuperAdmin && editForm.role !== "super_admin" && !editForm.companyId)}
            >
              {updatingUser ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
