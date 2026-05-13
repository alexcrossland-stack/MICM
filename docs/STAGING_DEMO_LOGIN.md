# Staging Demo Login Setup

Use this runbook to make the fake staging demo users from `seed-staging-demo-data` usable for sign-in testing. These steps are for staging and local non-production environments only.

The staging seed creates database user records only. It does not create Clerk users, passwords, sign-in tokens, API keys, or production users.

## Demo Accounts

| Role | Email | Expected scope |
|---|---|---|
| Super Admin | `superadmin.demo@micm.local` | Global access across seeded demo companies |
| Company Admin | `companyadmin.demo@micm.local` | Scoped to `MICM STAGING DEMO - Northstar Components Ltd` |
| Company User | `companyuser.demo@micm.local` | Scoped to the same company and assigned seeded assessments |

Do not use real names, real emails, real organisations, or production credentials for these accounts.

## Auth Model

MICM authorizes users by matching the authenticated Clerk user ID to `users.clerk_user_id` in the database.

The existing one-click demo auth endpoint does not automatically map to these staging seed records. It is still hardcoded to the original demo Clerk IDs in `artifacts/api-server/src/routes/demo.ts` and remains blocked when `NODE_ENV=production`.

For these staging demo accounts, use normal Clerk sign-in against a staging Clerk application, then update the seeded database records with the generated staging Clerk user IDs.

## Setup Steps

1. Use a dedicated staging Clerk application. Do not use the production Clerk tenant.
2. Apply migrations and seed domains against the non-production database:

```bash
DATABASE_URL=<staging_non_production_url> pnpm --filter @workspace/db run migrate
DATABASE_URL=<staging_non_production_url> pnpm --filter @workspace/scripts run seed-domains
```

3. Run the guarded staging demo seed:

```bash
NODE_ENV=staging ENABLE_STAGING_DEMO_SEED=true DATABASE_URL=<staging_non_production_url> pnpm --filter @workspace/scripts run seed-staging-demo-data
```

4. In the staging Clerk dashboard, create three staging-only users with these emails:

```text
superadmin.demo@micm.local
companyadmin.demo@micm.local
companyuser.demo@micm.local
```

Configure any temporary passwords or verification method inside Clerk only. Do not commit, paste, or document those values in the repository.

5. Copy each generated Clerk user ID from the staging Clerk dashboard. The values usually start with `user_`.
6. Update the seeded DB records so each `clerk_user_id` matches the staging Clerk user ID:

```sql
begin;

update users
set clerk_user_id = '<super_admin_clerk_user_id>'
where email = 'superadmin.demo@micm.local'
  and role = 'super_admin';

update users
set clerk_user_id = '<company_admin_clerk_user_id>'
where email = 'companyadmin.demo@micm.local'
  and role = 'company_admin';

update users
set clerk_user_id = '<company_user_clerk_user_id>'
where email = 'companyuser.demo@micm.local'
  and role = 'company_user';

commit;
```

7. Verify the records are mapped:

```sql
select email, role, company_id, clerk_user_id
from users
where email in (
  'superadmin.demo@micm.local',
  'companyadmin.demo@micm.local',
  'companyuser.demo@micm.local'
)
order by email;
```

## Role Smoke Checks

After signing in through normal Clerk login:

- Super Admin can access Programme Intelligence and cross-company reporting.
- Company Admin can access the primary seeded company, dashboards, reports, exports, analytics, targets, evidence notes, and assigned assessments for that company only.
- Company User can access assigned seeded assessments and evidence notes where permitted, without export controls or Programme Intelligence.
- Company Admin and Company User cannot access another seeded company directly by changing URL IDs or API parameters.

## Production Restrictions

- Do not run `seed-staging-demo-data` against production.
- Do not set `ENABLE_STAGING_DEMO_SEED=true` in production.
- Do not enable `ENABLE_DEMO_AUTH` or `VITE_ENABLE_DEMO_AUTH` in production.
- Do not copy staging Clerk users, demo credentials, or seeded demo data into production.
