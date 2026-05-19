# Production Pilot Account Setup

Use this runbook to set up approved production pilot test accounts for `https://app.micm-mm.com`.

This is an operator-controlled process. Do not commit passwords, Clerk secrets, database URLs, invitation tokens, one-time links, or exported production data. Take or verify a production database backup before any direct database change.

## Safety Rules

- Use the production Clerk application only.
- Use approved production test users only.
- Do not use shared passwords.
- Do not paste passwords, reset links, Clerk IDs, database URLs, or secrets into tickets, docs, PRs, or chat.
- Do not use staging demo users or `micm.local` / `example.test` identities in production.
- Prefer the app's invitation flow for Company Admin and Company User setup.
- Direct database changes require named operator approval and a recent backup.
- Run direct SQL manually only; it must not be wired into deployment or startup.

## Minimum Accounts

| Account | Role | Company scope | Purpose |
|---|---|---|---|
| Super Admin | `super_admin` | Global / no `company_id` | Verify platform-wide access, company setup, Programme Intelligence, audit logs, and cross-company reporting |
| Company Admin A | `company_admin` | Company A only | Verify own-company dashboards, assessments, targets, reports, exports, users, and tenant restrictions |
| Company User A | `company_user` | Company A only | Verify assigned assessment access, scoring, evidence notes, actions, and restricted navigation |
| Company Admin B | `company_admin` | Company B only | Recommended for cross-company tenant-isolation attempts |
| Company User B | `company_user` | Company B only | Optional deeper check for unassigned/cross-company assessment restrictions |

## Create The First Production Super Admin

1. In the production Clerk dashboard, create or invite the approved Super Admin test user.
2. Require the user to complete email verification and first sign-in.
3. Capture the Clerk user ID in the operator's secure notes. Do not paste it into repository files.
4. Verify a production database backup exists.
5. Run the guarded SQL template in `docs/sql/production-pilot-super-admin.sql` with placeholder values supplied on the command line.

Example command shape:

```bash
psql "$DATABASE_URL" \
  -v operator_approval=I_APPROVE_PRODUCTION_PILOT_ACCOUNT_SETUP \
  -v target_environment=production \
  -v clerk_user_id='<production_clerk_user_id>' \
  -v super_admin_email='<approved_super_admin_email>' \
  -v first_name='<optional_first_name>' \
  -v last_name='<optional_last_name>' \
  -f docs/sql/production-pilot-super-admin.sql
```

Do not put real values into this file. Use a secure operator shell or secret-management workflow.

## Create Company A And Company B Test Data

Use Super Admin access in the app where possible.

Company A should contain enough data to validate normal pilot workflows:

- One Company Admin.
- One assigned Company User.
- One draft or active assessment for assignment/scoring checks.
- One completed assessment or reportable result set.
- At least one action.
- At least one target.
- At least one evidence note where practical.

Company B should contain enough distinct data to prove Company A users cannot access it:

- One Company Admin or Company User.
- At least one assessment or reportable record.
- A clearly distinct company name and sector/size metadata.

Do not use real customer data unless it is explicitly approved for the production pilot.

## Invite Company Admins And Company Users

1. Sign in as Super Admin.
2. Create or verify Company A and Company B.
3. Open the Users area.
4. Invite the Company Admin for Company A with role `company_admin` and Company A selected.
5. Invite the Company User for Company A with role `company_user` and Company A selected.
6. Repeat for Company B if using a second-company tenant-isolation test.
7. Send invitations through the approved secure channel. Do not paste invitation tokens into public docs or chat.
8. Ask each user to sign in, accept the invitation, and confirm they can reach the dashboard.
9. Assign Company Users only to assessments for their own company.

## Verification Queries

Run these manually from an approved operator shell. Replace placeholders locally and do not commit the substituted queries.

Confirm the Super Admin exists and is global:

```sql
select id, email, role, company_id, is_active
from users
where clerk_user_id = '<production_clerk_user_id>'
  and role = 'super_admin'
  and company_id is null
  and is_active = true;
```

Confirm the Company Admin belongs to the expected company:

```sql
select u.id, u.email, u.role, u.company_id, c.name as company_name
from users u
join companies c on c.id = u.company_id
where u.email = '<company_admin_email>'
  and u.role = 'company_admin'
  and c.name = '<company_a_name>'
  and u.is_active = true;
```

Confirm the Company User is assigned to the expected assessment:

```sql
select u.id as user_id, u.email, c.name as company_name, ac.id as assessment_id, ac.name as assessment_name, ac.status
from users u
join companies c on c.id = u.company_id
join assessment_assignees aa on aa.user_id = u.id
join assessment_cycles ac on ac.id = aa.assessment_id and ac.company_id = u.company_id
where u.email = '<company_user_email>'
  and u.role = 'company_user'
  and c.name = '<company_a_name>'
  and ac.name = '<assessment_name>';
```

Confirm Company A and Company B are separate:

```sql
select id, name, sector, size, is_active
from companies
where name in ('<company_a_name>', '<company_b_name>')
order by name;
```

Expected result: two different `id` values.

## Ready For Authenticated Smoke Testing

Proceed to authenticated smoke only after:

- Super Admin can sign in.
- Company Admin A can sign in and is scoped to Company A.
- Company User A can sign in and is assigned to a Company A assessment.
- Company B exists for tenant-isolation checks, or the go/no-go owner explicitly accepts a narrower test.
- No passwords, secrets, tokens, or production data have been copied into repository files.
