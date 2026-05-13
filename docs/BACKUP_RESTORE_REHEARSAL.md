# Backup And Restore Rehearsal Checklist

Use this checklist to prove that MICM database backups can be restored before relying on them for a production pilot or launch. Run rehearsals only against non-production environments.

## Rehearsal Record

| Field | Value |
|---|---|
| Rehearsal date | |
| Rehearsal owner | |
| Source environment | |
| Source database identifier | |
| Backup identifier or timestamp | |
| Restore target environment | |
| Restore target database identifier | |
| Application commit used for validation | |
| Migration version after restore | |
| Signoff owner | |
| Signoff date | |

Do not paste database URLs, credentials, exported production records, or secret values into this document.

## Preconditions

- [ ] Rehearsal owner is assigned.
- [ ] Restore target is non-production and isolated from production users.
- [ ] Restore target can be destroyed after the rehearsal.
- [ ] Backup source and backup timestamp are identified.
- [ ] Application commit for validation is identified.
- [ ] Required non-production environment variables are available through the platform secret manager.
- [ ] No production data will be copied into local developer machines unless explicitly approved by the data protection process.

## Backup Evidence

Capture evidence without exposing credentials or personal data.

- [ ] Backup job completed successfully.
- [ ] Backup timestamp is recorded.
- [ ] Backup retention policy is documented.
- [ ] Backup size or checksum is recorded where the platform provides it.
- [ ] Backup storage location is known to the operations owner.
- [ ] Access to backup storage is restricted to named operators.

Evidence links or notes:

```text

```

## Restore Steps

1. Provision or select a non-production restore target.
2. Restore the selected backup into the target database.
3. Configure a non-production app instance or local environment to point at the restored database.
4. Apply any committed migrations required by the application commit under test:

```bash
DATABASE_URL=<non_production_restore_url> pnpm --filter @workspace/db run migrate
```

5. Start the API and frontend using non-production credentials.
6. Run the validation checklist below.

Never run destructive restore commands against production during rehearsal.

## Restore Validation

- [ ] API starts successfully.
- [ ] `GET /api/healthz` returns healthy status for the restored database.
- [ ] Super Admin can sign in with a non-production account.
- [ ] Company Admin can sign in with a non-production account.
- [ ] Company User can sign in with a non-production account.
- [ ] Companies, users, assessments, scores, actions, targets, evidence notes, and audit logs are queryable.
- [ ] Reports page loads.
- [ ] CSV export works.
- [ ] PDF export works.
- [ ] Excel export works.
- [ ] Programme Intelligence remains Super Admin only.
- [ ] Company Admin cannot access another company's data.
- [ ] Company User cannot access unassigned assessments.
- [ ] Audit log access remains Super Admin only.

## Data Protection Checks

- [ ] Restore target access is limited to named rehearsal participants.
- [ ] Any restored personal data is handled under the approved data protection process.
- [ ] No restored data is committed to the repository, copied into tickets, or pasted into chat.
- [ ] Rehearsal evidence avoids personal data and secrets.
- [ ] Restore target cleanup owner is assigned.
- [ ] Restore target cleanup date is recorded.

## Rollback Relationship

Backup/restore rehearsal supports deployment rollback decisions but does not replace application rollback.

- Application rollback should usually redeploy the last known-good application artifact or commit.
- Database rollback should only be attempted when a tested restore or corrective migration plan exists.
- If a migration is backward compatible, prefer application rollback plus follow-up corrective migration.
- If a migration is destructive, the release must have a specific restore plan and business approval before production deployment.

## Signoff

| Check | Result |
|---|---|
| Backup located and restorable | |
| Restore completed into non-production target | |
| App validated against restored database | |
| Tenant isolation validated | |
| Data protection checks completed | |
| Cleanup completed or scheduled | |
| Rehearsal accepted for pilot readiness | |

Signoff notes:

```text

```
