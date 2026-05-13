# Monitoring, Logging, And Incident Review Runbook

This runbook defines what MICM operators should monitor after deployment, how alerts should be triaged, and what evidence should be captured during incident review. It does not add monitoring infrastructure by itself.

## Ownership

| Responsibility | Owner | Notes |
|---|---|---|
| Primary support triage | TBD | First responder for user-reported issues |
| Technical escalation | TBD | Reviews logs, deploys fixes, coordinates rollback |
| Business escalation | TBD | Communicates pilot or customer impact |
| Go/no-go owner | TBD | Decides whether a release proceeds or rolls back |

Owners should be assigned before a production pilot.

## Signals To Monitor

| Signal | Why it matters | Suggested check |
|---|---|---|
| Health endpoint | Confirms app and database readiness | Poll `GET /api/healthz` externally |
| API 5xx rate | Detects server failures | Alert on sustained 5xx responses |
| API 4xx spikes | Detects auth, validation, or routing problems | Review by route and role |
| Auth failures | Detects Clerk/session or user-access issues | Track failed sign-ins and protected-route 401/403 patterns |
| Report export failures | Detects CSV/PDF/Excel generation problems | Track failed `/api/reports/company/:id/export` requests |
| Audit logging failures | Detects missing security event records | Search logs for audit recording failures |
| Database connectivity | Detects DB outage or networking issue | Health endpoint database status plus platform DB metrics |
| Deployment status | Detects failed releases | CI status, deploy logs, and post-deploy smoke checklist |
| Latency | Detects degradation before hard failures | Track p95 API latency for key routes |

Do not log or export secrets, raw Clerk tokens, session cookies, production database URLs, or unnecessary personal data.

## Health Endpoint Expectations

Monitor:

```text
GET /api/healthz
```

Expected healthy response:

- HTTP 200
- `status=ok`

Expected degraded response:

- HTTP 503
- `status=degraded`

The health response is intended for operational readiness checks. It must not be used to expose configuration values or credentials.

## Logging Expectations

The API server uses structured request logging through `pino-http`. Operators should be able to filter by:

- timestamp
- request method and route
- response status
- error message
- request id where available
- deployment version or commit where the hosting platform provides it

Review logs for:

- repeated 500 responses
- repeated 401/403 responses after a deploy
- report export errors
- audit log recording failures
- database connection errors
- failed Clerk proxy or auth middleware behavior

## Alert Severity Levels

| Severity | Criteria | Initial response |
|---|---|---|
| SEV1 | App unavailable, data leak suspected, auth bypass suspected, production database unavailable | Stop rollout, notify technical and business escalation, consider rollback |
| SEV2 | Core workflow broken for a role or company, report exports failing broadly, audit logging failing broadly | Assign technical owner, investigate logs, prepare hotfix or rollback |
| SEV3 | Isolated user issue, non-critical UI problem, intermittent export issue | Triage during support hours, document workaround |
| SEV4 | Documentation issue, low-risk enhancement, known limitation | Add backlog item or follow-up PR |

SEV1 and SEV2 incidents should have a written review.

## Incident Review Template

Use this template after SEV1/SEV2 incidents or failed releases.

```markdown
# Incident Review

Date:
Severity:
Incident owner:
Detected by:
Affected environment:
Affected users/companies:

## Summary

## Timeline

## Impact

## Root Cause

## What Worked

## What Did Not Work

## Data/Security Review

## Corrective Actions

| Action | Owner | Due date | Status |
|---|---|---|---|

## Follow-Up PRs / Issues
```

## Escalation Checklist

- [ ] Confirm affected environment and release commit.
- [ ] Check `GET /api/healthz`.
- [ ] Review recent deployment status and CI.
- [ ] Review API error logs by route and status code.
- [ ] Check database connectivity and migration status.
- [ ] Check Clerk dashboard or platform auth status when login is affected.
- [ ] Confirm whether tenant isolation or data exposure is implicated.
- [ ] Decide whether rollback criteria are met.
- [ ] Capture incident notes and owner.

## Release Monitoring Window

For production or pilot releases, monitor closely for at least the agreed release window after deployment:

- [ ] Health endpoint stays healthy.
- [ ] Login works for Super Admin, Company Admin, and Company User.
- [ ] Dashboard and assessment routes load.
- [ ] Evidence note creation works.
- [ ] Report exports work for CSV, PDF, and Excel.
- [ ] Programme Intelligence remains Super Admin only.
- [ ] No unexpected 5xx spike appears.
- [ ] Audit log records expected admin/security events.

Use `docs/PRODUCTION_DEPLOYMENT.md` for the full post-deploy smoke checklist and `docs/PRODUCTION_READINESS.md` for launch go/no-go tracking.
