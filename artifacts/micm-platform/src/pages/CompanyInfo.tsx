import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type CompanyChallenge,
  useGetCompany,
  useListCompanies,
  useUpdateCompany,
} from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { useSelectedCompany } from "@/hooks/useSelectedCompany";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Building2, CheckCircle2, Info } from "lucide-react";

const CHALLENGE_GROUPS = [
  {
    group: "People",
    challenges: [
      "Labour and skills shortages",
      "High employee turnover",
      "High absenteeism",
    ],
  },
  {
    group: "Quality",
    challenges: [
      "Quality issues or rework",
    ],
  },
  {
    group: "Delivery",
    challenges: [
      "Supply chain disruption",
      "Production capacity constraints",
      "Delivery performance challenges",
      "Long lead times",
      "Production under-utilisation",
    ],
  },
  {
    group: "Cost",
    challenges: [
      "Cash flow pressure",
      "Low Profitability",
    ],
  },
  {
    group: "Asset",
    challenges: [
      "Equipment reliability and downtime",
      "No capital to invest",
    ],
  },
  {
    group: "Product",
    challenges: [
      "Rising material costs",
      "Ageing Product Range",
    ],
  },
  {
    group: "Other",
    challenges: [
      "Lack of process standardisation",
      "Limited management information or data visibility",
      "Low digital maturity",
      "Energy costs and sustainability pressure",
      "Leadership bandwidth constraints",
      "Growth planning and market uncertainty",
      "Poor forecast accuracy",
      "Inefficient factory layout or material flow",
      "Low sales pipeline visibility",
      "Customer concentration risk",
      "Difficulty funding capital investment",
      "Weak supplier performance management",
      "Limited continuous improvement capability",
      "High work-in-progress levels",
    ],
  },
] as const satisfies ReadonlyArray<{ group: string; challenges: readonly CompanyChallenge[] }>;
const CHALLENGE_OPTIONS = CHALLENGE_GROUPS.flatMap((group) => group.challenges);
type CompanyChallengeValue = CompanyChallenge;

type StakeholderEngagementRow = {
  stakeholder: string;
  engagementTopic: string;
  contact: string;
  dateOfContact: string;
};

const EMPTY_STAKEHOLDER_ROW: StakeholderEngagementRow = {
  stakeholder: "",
  engagementTopic: "",
  contact: "",
  dateOfContact: "",
};

function defaultStakeholderRows(rows?: StakeholderEngagementRow[] | null): StakeholderEngagementRow[] {
  const normalized = (rows ?? []).slice(0, 5).map((row) => ({
    stakeholder: row.stakeholder ?? "",
    engagementTopic: row.engagementTopic ?? "",
    contact: row.contact ?? "",
    dateOfContact: row.dateOfContact ?? "",
  }));
  while (normalized.length < 5) normalized.push({ ...EMPTY_STAKEHOLDER_ROW });
  return normalized;
}

function sameChallenges(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((value) => bSet.has(value));
}

function sameStakeholderRows(a: StakeholderEngagementRow[], b: StakeholderEngagementRow[]) {
  return defaultStakeholderRows(a).every((row, index) => {
    const other = defaultStakeholderRows(b)[index];
    return row.stakeholder === other.stakeholder
      && row.engagementTopic === other.engagementTopic
      && row.contact === other.contact
      && row.dateOfContact === other.dateOfContact;
  });
}

export default function CompanyInfoPage() {
  const { isSuperAdmin, isCompanyAdmin, isCompanyUser } = useCurrentUser();
  const { targetCompanyId, selectedCompanyId, setSelectedCompanyId } = useSelectedCompany();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusDescription, setStatusDescription] = useState("");
  const [selectedChallenges, setSelectedChallenges] = useState<CompanyChallengeValue[]>([]);
  const [stakeholderRows, setStakeholderRows] = useState<StakeholderEngagementRow[]>(() => defaultStakeholderRows());
  const [saveState, setSaveState] = useState<string | null>(null);

  const canEdit = isSuperAdmin || isCompanyAdmin;

  const { data: companies, isLoading: companiesLoading } = useListCompanies({
    query: { enabled: isSuperAdmin } as any,
  });

  const { data: company, isLoading, error } = useGetCompany(
    targetCompanyId ?? 0,
    { query: { enabled: !!targetCompanyId } as any },
  );
  const { mutateAsync: updateCompany, isPending: saving } = useUpdateCompany();

  useEffect(() => {
    if (!company) return;
    setStatusDescription(company.currentStatusDescription ?? "");
    setSelectedChallenges(company.currentChallenges ?? []);
    setStakeholderRows(defaultStakeholderRows(company.stakeholderEngagement));
    setSaveState(null);
  }, [company]);

  const challengeCount = selectedChallenges.length;
  const persistedChallenges = company?.currentChallenges ?? [];
  const persistedStakeholderRows = defaultStakeholderRows(company?.stakeholderEngagement);
  const activeChallengeSet = useMemo(() => new Set<string>(CHALLENGE_OPTIONS), []);
  const legacySelectedChallenges = selectedChallenges.filter((challenge) => !activeChallengeSet.has(challenge));
  const isDirty = useMemo(() => {
    if (!company) return false;
    return (company.currentStatusDescription ?? "") !== statusDescription
      || !sameChallenges(persistedChallenges, selectedChallenges)
      || !sameStakeholderRows(persistedStakeholderRows, stakeholderRows);
  }, [company, persistedChallenges, persistedStakeholderRows, selectedChallenges, stakeholderRows, statusDescription]);

  function toggleChallenge(challenge: CompanyChallengeValue, checked: boolean) {
    setSelectedChallenges((current) => {
      if (checked) return Array.from(new Set([...current, challenge]));
      return current.filter((item) => item !== challenge);
    });
  }

  function updateStakeholderRow(index: number, field: keyof StakeholderEngagementRow, value: string) {
    setStakeholderRows((current) => {
      const next = defaultStakeholderRows(current);
      next[index] = { ...next[index], [field]: value };
      return next;
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
          stakeholderEngagement: stakeholderRows,
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

      {isSuperAdmin && !targetCompanyId ? (
        <Card className="border-card-border border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Building2 className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Select a company to view or update company info.</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
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
              <div>
                <Label>Stakeholder Engagement</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Record up to five recent stakeholder contacts that help explain the current company context.
                </p>
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-muted/50">
                    <tr className="border-b border-border">
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">Stakeholder</th>
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">Engagement Topic</th>
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">Contact</th>
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">Date of Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stakeholderRows.map((row, index) => (
                      <tr key={index} className="border-b border-border/60 last:border-0">
                        {(["stakeholder", "engagementTopic", "contact", "dateOfContact"] as const).map((field) => (
                          <td key={field} className="p-2 align-top">
                            <input
                              value={row[field]}
                              onChange={(event) => updateStakeholderRow(index, field, event.target.value)}
                              readOnly={!canEdit}
                              className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring read-only:bg-muted/40"
                              aria-label={`${field} row ${index + 1}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <Label>Current Challenges</Label>
                <Badge variant="outline">{challengeCount} selected</Badge>
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                {CHALLENGE_GROUPS.map((group) => (
                  <div key={group.group} className="rounded-md border border-border bg-muted/20 p-3">
                    <p className="text-sm font-medium mb-3">{group.group}</p>
                    <div className="space-y-2">
                      {group.challenges.map((challenge) => {
                        const checked = selectedChallenges.includes(challenge);
                        return (
                          <label key={challenge} className="flex items-start gap-3 text-sm">
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
                  </div>
                ))}
              </div>
              {legacySelectedChallenges.length > 0 && (
                <div className="rounded-md border border-dashed border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Previously saved challenges</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {legacySelectedChallenges.map((challenge) => (
                      <Badge key={challenge} variant="outline">{challenge}</Badge>
                    ))}
                  </div>
                </div>
              )}
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
