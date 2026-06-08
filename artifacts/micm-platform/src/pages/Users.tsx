import { useState } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import { useListCompanyUsers, useCreateInvitation, useListInvitations, useListCompanies } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Users, Mail, Copy, Check, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { useState as useLocalState } from "react";

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
  const qc = useQueryClient();
  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "company_user", companyId: "" });
  const [copied, setCopied] = useState<number | null>(null);

  const { data: users, isLoading } = useListCompanyUsers(
    companyId ?? 0,
    { query: { enabled: !!companyId } as any }
  );
  const { data: invitations } = useListInvitations(
    companyId ? { companyId } : {},
    { query: { enabled: !!companyId || isSuperAdmin } as any }
  );
  const { data: companies } = useListCompanies({ query: { enabled: isSuperAdmin } as any });
  const { mutateAsync: createInvitation, isPending } = useCreateInvitation();

  const canManage = isCompanyAdmin || isSuperAdmin;
  const isInvitingSuperAdmin = inviteForm.role === "super_admin";
  const isInviteDisabled = !inviteForm.email
    || isPending
    || (isSuperAdmin && !isInvitingSuperAdmin && !inviteForm.companyId);

  async function handleInvite() {
    if (!inviteForm.email) return;
    try {
      await createInvitation({
        data: {
          email: inviteForm.email,
          role: inviteForm.role as "super_admin" | "company_admin" | "company_user",
          companyId: inviteForm.companyId ? Number(inviteForm.companyId) : companyId ?? undefined,
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
                <Select value={inviteForm.companyId} onValueChange={v => setInviteForm(f => ({ ...f, companyId: v }))}>
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
    </div>
  );
}
