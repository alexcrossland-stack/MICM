# Production Readiness Gap Tracker

Use this tracker to decide whether MICM Maturity Hub is ready for a production pilot or wider launch. It complements the deployment runbook in `docs/PRODUCTION_DEPLOYMENT.md`.

## Status Summary

| Area | Status | Launch requirement |
|---|---|---|
| Security | Open | Role access, tenant isolation, demo-auth lockout, and audit logging reviewed in staging |
| Data protection / GDPR | Open | Data controller/processor responsibilities, retention, export, and deletion process agreed |
| Hosting | Open | Production host, domains, TLS, runtime configuration, and deploy ownership confirmed |
| Monitoring | Open | Health checks, uptime alerts, error review, and incident escalation defined |
| Backup / restore | Open | Automated backups enabled and restore tested against a non-production database |
| Staging validation | Open | Staging runs the release commit and passes the full smoke checklist |
| Pilot acceptance | Open | Pilot success criteria, users, companies, and acceptance owner confirmed |
| User onboarding | Open | Super Admin setup, Company Admin onboarding, invitations, and support materials ready |
| Support process | Open | Support contact, triage process, severity levels, and response expectations agreed |
| Go / no-go | Open | Named decision owner confirms all blocking gaps are closed or accepted |

Status values:

- `Open`: not yet verified or owner not assigned.
- `In progress`: owner assigned and work underway.
- `Ready`: verified for launch.
- `Accepted risk`: explicitly approved by the go/no-go owner.

## Security

- [ ] Production uses `NODE_ENV=production`.
- [ ] Demo auth flags are unset or `false` in production.
- [ ] `POST /api/demo/sign-in-token` returns 404 in production.
- [ ] Super Admin, Company Admin, and Company User permissions are smoke-tested.
- [ ] Tenant isolation is smoke-tested with at least two companies.
- [ ] `GET /api/audit-logs` is accessible only to Super Admin.
- [ ] Audit metadata is reviewed to confirm it avoids credential material and unnecessary personal data.
- [ ] Production Clerk keys are live keys from the production Clerk application.
- [ ] No development, staging, or demo users are promoted into production by mistake.

## Data Protection / GDPR

- [ ] Confirm the lawful basis for storing user profile, company, assessment, score, action, target, evidence note, and audit data.
- [ ] Confirm who is the data controller and who acts as processor for hosted infrastructure and Clerk.
- [ ] Document data retention expectations for assessments, audit logs, invitations, and evidence notes.
- [ ] Document how a data export request will be handled.
- [ ] Document how a deletion or correction request will be handled.
- [ ] Confirm production data is not copied into local development or demo environments.
- [ ] Confirm production support access is limited to named operators.
- [ ] Confirm privacy notice and user-facing terms are ready for the pilot audience.

## Hosting

- [ ] Production hosting platform is selected and owner is named.
- [ ] Production domain is configured.
- [ ] TLS is active and redirects insecure traffic.
- [ ] Required environment variables are configured in the platform secret manager.
- [ ] API and frontend routing are verified for `/api/*` and SPA fallback routes.
- [ ] Production build steps are documented and repeatable.
- [ ] Deployment ownership and release window are agreed.

## Monitoring

- [ ] `GET /api/healthz` is reachable from outside the hosting platform.
- [ ] Uptime monitoring is configured for the public application URL.
- [ ] Error logs are accessible to the support owner.
- [ ] Slow or failed requests can be investigated from platform logs.
- [ ] Alert recipient and escalation path are defined.
- [ ] Incident notes location is agreed.

## Backup And Restore

- [ ] Production database backups are enabled.
- [ ] Backup frequency and retention are documented.
- [ ] A restore has been tested into a non-production database.
- [ ] Restore steps and owner are documented.
- [ ] Migration rollback approach is understood: prefer application rollback plus corrective migration unless a tested database rollback exists.

## Staging Validation

- [ ] Staging is using the release commit intended for production.
- [ ] Staging environment variables are separate from production.
- [ ] Staging database migrations have been applied successfully.
- [ ] Staging smoke checklist in `docs/PRODUCTION_DEPLOYMENT.md` passes.
- [ ] Staging includes representative fake data or approved test data only.
- [ ] No production data is present in staging unless explicitly approved through the data protection process.

## Pilot Acceptance

- [ ] Pilot companies and users are named.
- [ ] Pilot success criteria are written down.
- [ ] Required pilot workflows are agreed: login, assessment, evidence notes, targets, reports, exports, analytics, Programme Intelligence, and tenant isolation.
- [ ] Known limitations are documented for pilot users.
- [ ] Acceptance owner is named.
- [ ] Acceptance decision is recorded before wider rollout.

## User Onboarding

- [ ] First Super Admin account is created and verified.
- [ ] Company Admin invitation process is verified.
- [ ] Company User invitation process is verified.
- [ ] Onboarding instructions are ready for pilot users.
- [ ] Support contact and expected response route are included in onboarding materials.
- [ ] Demo credentials are not used in production onboarding.

## Support Process

- [ ] Support owner is named.
- [ ] Support inbox, channel, or ticket process is ready.
- [ ] Severity definitions are agreed.
- [ ] Response expectations are agreed for pilot users.
- [ ] Common troubleshooting notes are documented for login, invitations, assessment access, export downloads, and tenant access concerns.
- [ ] Escalation process exists for suspected data leak, auth failure, or production outage.

## Go / No-Go Criteria

Production launch can proceed only when:

- [ ] Security and tenant-isolation checks are `Ready`.
- [ ] Production database backup and restore are `Ready`.
- [ ] Production Clerk setup is `Ready`.
- [ ] Staging validation is `Ready`.
- [ ] Pilot acceptance owner has approved the release.
- [ ] Support process is ready for pilot users.
- [ ] No unresolved blocker exists for data protection, hosting, monitoring, or rollback.
- [ ] Any accepted risks are documented with owner, expiry date, and mitigation.

No-go triggers:

- Demo auth is reachable in production.
- Production migration process is unverified.
- Production backup cannot be confirmed.
- Tenant isolation smoke checks fail.
- Production Clerk configuration is incomplete.
- No named support owner exists.
- The go/no-go owner is unavailable or has not approved the release.
