import { useMemo, useState } from "react";
import { useListAuditLogs } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, RefreshCw } from "lucide-react";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function metadataSummary(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata ?? {});
  if (entries.length === 0) return "No metadata";
  return entries
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}

export default function AuditLogsPage() {
  const { isSuperAdmin, isLoaded } = useCurrentUser();
  const [companyIdFilter, setCompanyIdFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const companyId = Number(companyIdFilter);

  const queryParams = useMemo(() => ({
    limit: 100,
    ...(Number.isFinite(companyId) && companyId > 0 ? { companyId } : {}),
    ...(eventTypeFilter.trim() ? { eventType: eventTypeFilter.trim() } : {}),
  }), [companyId, eventTypeFilter]);

  const { data: auditLogs, isLoading, error, refetch } = useListAuditLogs(
    queryParams,
    { query: { enabled: isSuperAdmin } as any },
  );

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Restricted</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Audit logs are available to Super Admins only.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6" />
            Audit Logs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Security and administrative activity across the platform.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="audit-company-id">Company ID</Label>
            <Input
              id="audit-company-id"
              inputMode="numeric"
              placeholder="All companies"
              value={companyIdFilter}
              onChange={(event) => setCompanyIdFilter(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-event-type">Event type</Label>
            <Input
              id="audit-event-type"
              placeholder="All event types"
              value={eventTypeFilter}
              onChange={(event) => setEventTypeFilter(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">Audit logs could not be loaded.</p>
          ) : !auditLogs?.length ? (
            <p className="text-sm text-muted-foreground">No audit events match these filters.</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{log.eventType}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</div>
                    </div>
                    <Badge variant="outline">{log.actorRole ?? "unknown actor"}</Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 text-xs text-muted-foreground">
                    <div>Actor user ID: {log.actorUserId ?? "not recorded"}</div>
                    <div>Company ID: {log.companyId ?? "global"}</div>
                    <div>{log.targetType}: {log.targetId}</div>
                  </div>
                  <p className="text-xs text-muted-foreground break-words">{metadataSummary(log.metadata)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
