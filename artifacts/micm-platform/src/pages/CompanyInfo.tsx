import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CompanyChallenge,
  useGetCompany,
  useListCompanies,
  useUpdateCompany,
} from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Building2, CheckCircle2, Info } from "lucide-react";

const CHALLENGE_OPTIONS = Object.values(CompanyChallenge);
type CompanyChallengeValue = (typeof CHALLENGE_OPTIONS)[number];

function sameChallenges(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((value) => bSet.has(value));
}

export default function CompanyInfoPage() {
  const { companyId, isSuperAdmin, isCompanyAdmin, isCompanyUser } = useCurrentUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(companyId ?? null);
  const [statusDescription, setStatusDescription] = useState("");
  const [selectedChallenges, setSelectedChallenges] = useState<CompanyChallengeValue[]>([]);
  const [saveState, setSaveState] = useState<string | null>(null);

  const canEdit = isSuperAdmin || isCompanyAdmin;

  const { data: companies, isLoading: companiesLoading } = useListCompanies({
    query: { enabled: isSuperAdmin } as any,
  });

  useEffect(() => {
    if (isSuperAdmin && !selectedCompanyId && companies?.length) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [companies, isSuperAdmin, selectedCompanyId]);

  useEffect(() => {
    if (!isSuperAdmin) setSelectedCompanyId(companyId ?? null);
  }, [companyId, isSuperAdmin]);

  const targetCompanyId = isSuperAdmin ? selectedCompanyId : companyId;
  const { data: company, isLoading, error } = useGetCompany(
    targetCompanyId ?? 0,
    { query: { enabled: !!targetCompanyId } as any },
  );
  const { mutateAsync: updateCompany, isPending: saving } = useUpdateCompany();

  useEffect(() => {
    if (!company) return;
    setStatusDescription(company.currentStatusDescription ?? "");
    setSelectedChallenges(company.currentChallenges ?? []);
    setSaveState(null);
  }, [company]);

  const challengeCount = selectedChallenges.length;
  const persistedChallenges = company?.currentChallenges ?? [];
  const isDirty = useMemo(() => {
    if (!company) return false;
    return (company.currentStatusDescription ?? "") !== statusDescription
      || !sameChallenges(persistedChallenges, selectedChallenges);
  }, [company, persistedChallenges, selectedChallenges, statusDescription]);

  function toggleChallenge(challenge: CompanyChallengeValue, checked: boolean) {
    setSelectedChallenges((current) => {
      if (checked) return Array.from(new Set([...current, challenge]));
      return current.filter((item) => item !== challenge);
    });
  }

  async function handleSave() {
    if (!targetCompanyId || !canEdit) return;
    setSaveState(null);
    try {
      await updateCompany({
        id: targetCompanyId,
        data: {
          currentStatusDescription: statusDescription.trim() || null,
          currentChallenges: selectedChallenges,
        },
      });
      await qc.invalidateQueries();
      setSaveState("Company info saved.");
      toast({ title: "Company info saved" });
    } catch (err: any) {
      const message = err?.message ?? "Company info could not be saved.";
      setSaveState(message);
      toast({ title: "Save failed", description: message, variant: "destructive" });
    }
  }

  if (!targetCompanyId && !isSuperAdmin) {
    return <div className="text-muted-foreground p-8 text-center">No company is associated with your account.</div>;
  }

  if (isSuperAdmin && companiesLoading) {
    return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  if (error) {
    return <div className="text-destructive p-8 text-center">Company info could not be loaded.</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Info</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Company context used to interpret assessments, targets, actions, and reports.
          </p>
        </div>
        <Badge variant={canEdit ? "default" : "secondary"} className="gap-1">
          <Info className="w-3.5 h-3.5" />
          {canEdit ? "Editable" : "Read-only"}
        </Badge>
      </div>

      {isSuperAdmin && (
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Company selector
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full sm:w-80">
              <Label>Company</Label>
              <Select value={selectedCompanyId?.toString() ?? ""} onValueChange={(value) => setSelectedCompanyId(Number(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies?.map((companyOption) => (
                    <SelectItem key={companyOption.id} value={String(companyOption.id)}>
                      {companyOption.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : (
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              {company?.name ?? "Company info"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="current-status-description">Current Status Description</Label>
              <Textarea
                id="current-status-description"
                value={statusDescription}
                onChange={(event) => setStatusDescription(event.target.value)}
                readOnly={!canEdit}
                className="min-h-36"
                placeholder="Summarise the current operating context, priorities, constraints, or recent changes."
              />
              {isCompanyUser && (
                <p className="text-xs text-muted-foreground">Company Users can view company info but cannot edit it.</p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <Label>Current Challenges</Label>
                <Badge variant="outline">{challengeCount} selected</Badge>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {CHALLENGE_OPTIONS.map((challenge) => {
                  const checked = selectedChallenges.includes(challenge);
                  return (
                    <label
                      key={challenge}
                      className="flex items-start gap-3 rounded-md border border-border bg-muted/20 p-3 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!canEdit}
                        onCheckedChange={(value) => toggleChallenge(challenge, value === true)}
                        aria-label={challenge}
                      />
                      <span className="leading-snug">{challenge}</span>
                    </label>
                  );
                })}
              </div>
              {!canEdit && selectedChallenges.length === 0 && (
                <p className="text-sm text-muted-foreground">No current challenges have been recorded yet.</p>
              )}
            </div>

            {canEdit && (
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleSave} disabled={!targetCompanyId || saving || !isDirty}>
                  {saving ? "Saving" : "Save Info"}
                </Button>
                {saveState && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    {saveState}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
