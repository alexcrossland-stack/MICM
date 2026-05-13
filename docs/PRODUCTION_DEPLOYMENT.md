# Production Deployment Runbook

This runbook is for promoting MICM Maturity Hub from a validated staging environment into production. It is documentation-only and does not require production credentials to follow.

## Deployment Principles

- Production must run with `NODE_ENV=production`.
- Production must use a production PostgreSQL database and a production Clerk application.
- API startup validation requires `PORT` and `DATABASE_URL` in every environment, requires Clerk backend and publishable keys in production, and refuses demo auth when `NODE_ENV=production`.
- Apply committed database migrations before routing user traffic to a new application version.
- Keep demo authentication disabled in production. The backend also returns 404 for demo sign-in tokens when `NODE_ENV=production`.
- Do not run staging/demo seed scripts against production.
- Do not use `push:dev` for staging or production databases.

## Required Environment Variables

| Variable | Required | Production value |
|---|---:|---|
| `DATABASE_URL` | Yes | Production PostgreSQL connection string |
| `CLERK_SECRET_KEY` | Yes | Production Clerk backend key from the production Clerk app |
| `CLERK_PUBLISHABLE_KEY` | Yes | Production Clerk publishable key from the same Clerk app |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Same production publishable key as `CLERK_PUBLISHABLE_KEY` |
| `VITE_CLERK_PROXY_URL` | Platform-specific | Set by Replit production; for other platforms set only when Clerk JS should be proxied through the app domain |
| `PORT` | Yes | API server port exposed by the hosting platform |
| `BASE_PATH` | Yes for frontend build/dev | `/` for root-mounted deployments |
| `NODE_ENV` | Yes | `production` |
| `ENABLE_DEMO_AUTH` | No | Unset or `false` |
| `VITE_ENABLE_DEMO_AUTH` | No | Unset or `false` |
| `SESSION_SECRET` | No current runtime use | Reserved for future session middleware; set only if that middleware is introduced |

Production secrets must be stored in the deployment platform secret manager. Never commit `.env` files, real keys, production database URLs, exported user data, or production identifiers.

## Database Migration Process

Schema changes are tracked as Drizzle SQL migrations in `lib/db/migrations/`.

Before production deploy:

1. Confirm the target production database has the migration baseline established. Existing environments that predate migration history must not blindly run the baseline migration.
2. Confirm the release branch contains all migration files expected for the version being deployed.
3. Review new migration SQL for destructive operations.
4. Take or verify a recent database backup.
5. Apply migrations with the production `DATABASE_URL`:

```bash
DATABASE_URL=<production_database_url> pnpm --filter @workspace/db run migrate
```

6. Verify the migration command exits cleanly before deploying or promoting app traffic.

Never run:

```bash
DATABASE_URL=<production_database_url> pnpm --filter @workspace/db run push:dev
```

`push:dev` is only for disposable local databases while prototyping.

## Clerk Production Setup

Use a dedicated production Clerk application, separate from development and staging.

Required setup:

1. Create or select the production Clerk application.
2. Enable the intended production sign-in methods, such as email/password and approved OAuth providers.
3. Configure allowed production domains, redirect URLs, and sign-out URLs.
4. Set `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and `VITE_CLERK_PUBLISHABLE_KEY` from the production Clerk app.
5. Confirm backend and frontend Clerk keys belong to the same Clerk application.
6. Create or invite the first production Super Admin through the approved onboarding process.
7. Confirm production user records in the `users` table have the correct `role` and `companyId` values.

Do not reuse development Clerk keys, staging Clerk keys, or seeded demo users in production.

## Demo Auth Production Lockout

Demo authentication is intentionally unavailable in production:

- `POST /api/demo/sign-in-token` returns HTTP 404 when `NODE_ENV=production`.
- The frontend demo panel is hidden when the backend demo status route returns 404, including production.
- Production deployment configuration should still leave `ENABLE_DEMO_AUTH` and `VITE_ENABLE_DEMO_AUTH` unset or `false`.

Post-deploy guardrail check:

```bash
curl -i -X POST https://<production-host>/api/demo/sign-in-token \
  -H "content-type: application/json" \
  --data '{"role":"company_user"}'
```

Expected result: HTTP 404.

## Build And Release Steps

1. Confirm the release branch is merged to `main` and CI is green.
2. Install dependencies with the lockfile:

```bash
pnpm install --frozen-lockfile
```

3. Run validation:

```bash
pnpm test
pnpm run typecheck
git diff --check
```

4. Build the API server:

```bash
pnpm --filter @workspace/api-server run build
```

5. Build the frontend:

```bash
PORT=8080 BASE_PATH=/ pnpm --filter @workspace/micm-platform run build
```

6. Apply production migrations.
7. Deploy the API artifact and frontend static assets.
8. Run the post-deploy smoke checklist below before announcing the release.

On Replit, the Deploy UI handles the platform-specific build and serving steps. The migration and smoke-test responsibilities still apply.

## Post-Deploy Smoke Checklist

Run this checklist against production with real production test accounts or approved internal accounts. Do not use staging/demo seed data.

### Authentication And Access

- [ ] Sign in as Super Admin.
- [ ] Sign in as Company Admin.
- [ ] Sign in as Company User.
- [ ] Sign out and confirm protected routes require authentication.
- [ ] Confirm the demo sign-in endpoint returns 404.
- [ ] Confirm no demo sign-in panel appears.

### Dashboards

- [ ] Super Admin dashboard loads and shows cross-company data only to Super Admin.
- [ ] Company Admin dashboard loads and shows only their company.
- [ ] Company User dashboard loads and does not expose admin navigation.

### Assessments

- [ ] Company Admin can create or open an assessment for their own company.
- [ ] Company Admin can assign an own-company user.
- [ ] Assigned Company User can open the assessment.
- [ ] Scoring uses the 0-4 maturity scale.
- [ ] Incomplete assessments show missing domain/category guidance before completion.
- [ ] Fully scored assessments can be completed.

### Evidence Notes

- [ ] Permitted users can view criterion evidence notes.
- [ ] Permitted users can add an evidence note.
- [ ] Unassigned Company Users cannot view or add notes for assessments they are not assigned to.
- [ ] Cross-company note access is blocked.

### Targets

- [ ] Company Admin can view and update targets for their own company.
- [ ] Company Admin cannot update another company's targets.
- [ ] Super Admin can inspect target data across companies where the UI permits it.

### Reports And Exports

- [ ] Company report loads for Super Admin and same-company Company Admin.
- [ ] Company User cannot access report export controls.
- [ ] CSV export downloads and opens.
- [ ] PDF export downloads and opens.
- [ ] Excel export downloads and opens with Summary, Domain Scores, and Actions sheets.
- [ ] Export attempts across company boundaries are blocked for Company Admins.

### Analytics

- [ ] Company analytics load for same-company users.
- [ ] Current-vs-target and gap-to-target views render.
- [ ] Cross-company analytics are unavailable to Company Admins and Company Users.

### Programme Intelligence

- [ ] Programme Intelligence is visible to Super Admin.
- [ ] Sector, company size, and date filters work as expected.
- [ ] Region and cohort placeholders remain disabled if no data exists.
- [ ] Company Admins and Company Users cannot access Programme Intelligence UI or API data.

### Tenant Isolation

- [ ] Company Admin A cannot see Company B users, assessments, reports, notes, actions, or targets.
- [ ] Company User A cannot see unassigned assessments.
- [ ] Direct API requests with another `companyId` are rejected or safely scoped.
- [ ] Super Admin retains legitimate cross-company access.

### Audit Log

- [ ] Super Admin can call `GET /api/audit-logs`.
- [ ] Company Admin and Company User receive 403 from `GET /api/audit-logs`.
- [ ] Recent smoke-test actions create audit entries with safe metadata.

## Staging-To-Production Promotion Checklist

- [ ] Staging is running the exact commit intended for production.
- [ ] GitHub CI is green for the release commit.
- [ ] `pnpm test`, `pnpm run typecheck`, and build checks pass.
- [ ] New migrations were reviewed and applied successfully in staging.
- [ ] Staging smoke checklist passed.
- [ ] Production environment variables were reviewed without exposing values.
- [ ] Production database backup is recent and restorable.
- [ ] Production Clerk application has correct domains and redirect URLs.
- [ ] Demo auth flags are unset or `false` in production.
- [ ] Staging/demo seed data is not present in production.
- [ ] Rollback owner and decision window are agreed before deployment.

## Rollback Checklist

If a production deploy fails smoke testing or causes user-impacting errors:

1. Stop further traffic promotion.
2. Capture the failed version, time, symptoms, and affected routes.
3. Revert the application to the last known-good deployment artifact or commit.
4. If migrations were applied, review whether the schema change is backward compatible with the previous app version.
5. Do not manually drop columns or tables during an incident unless a tested database rollback plan exists.
6. If data was written by the failed version, preserve it for investigation unless it creates a security risk.
7. Re-run the post-deploy smoke checklist on the restored version.
8. Record the incident notes and follow-up fixes before attempting redeploy.

Rollback for schema changes must be planned per migration. The default approach is application rollback plus a follow-up corrective migration, not ad hoc production database edits.
