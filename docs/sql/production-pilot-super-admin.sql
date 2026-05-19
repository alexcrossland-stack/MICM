-- Guarded production SQL template for mapping an existing Clerk production user
-- to MICM's global Super Admin role.
--
-- This file is a template. Do not add real emails, Clerk IDs, database URLs, or
-- secrets to the repository. Run it manually only after operator approval and a
-- verified production database backup.
--
-- Required psql variables:
--   operator_approval = I_APPROVE_PRODUCTION_PILOT_ACCOUNT_SETUP
--   target_environment = production
--   clerk_user_id = existing production Clerk user ID
--   super_admin_email = approved production Super Admin email
-- Optional psql variables:
--   first_name
--   last_name

\set ON_ERROR_STOP on

\if :{?operator_approval}
\else
  \echo 'ERROR: pass -v operator_approval=I_APPROVE_PRODUCTION_PILOT_ACCOUNT_SETUP'
  \quit 3
\endif

\if :{?target_environment}
\else
  \echo 'ERROR: pass -v target_environment=production'
  \quit 3
\endif

\if :{?clerk_user_id}
\else
  \echo 'ERROR: pass -v clerk_user_id=<production_clerk_user_id>'
  \quit 3
\endif

\if :{?super_admin_email}
\else
  \echo 'ERROR: pass -v super_admin_email=<approved_super_admin_email>'
  \quit 3
\endif

\if :{?first_name}
\else
  \set first_name ''
\endif

\if :{?last_name}
\else
  \set last_name ''
\endif

begin;

create temporary table micm_pilot_super_admin_input as
select
  :'operator_approval'::text as operator_approval,
  :'target_environment'::text as target_environment,
  :'clerk_user_id'::text as clerk_user_id,
  lower(:'super_admin_email'::text) as super_admin_email,
  nullif(:'first_name'::text, '') as first_name,
  nullif(:'last_name'::text, '') as last_name;

do $$
declare
  input record;
begin
  select * into input from micm_pilot_super_admin_input;

  if input.operator_approval <> 'I_APPROVE_PRODUCTION_PILOT_ACCOUNT_SETUP' then
    raise exception 'Operator approval guard did not match.';
  end if;

  if input.target_environment <> 'production' then
    raise exception 'This template is for production pilot setup only.';
  end if;

  if input.clerk_user_id = '' or input.clerk_user_id like '<%' then
    raise exception 'A real production Clerk user ID must be supplied at runtime.';
  end if;

  if input.super_admin_email = '' or input.super_admin_email like '<%' then
    raise exception 'A real approved production Super Admin email must be supplied at runtime.';
  end if;

  if input.super_admin_email like '%@micm.local'
    or input.super_admin_email like '%@example.test'
    or input.super_admin_email like '%@example.com' then
    raise exception 'Placeholder/demo email domains are not allowed for production pilot setup.';
  end if;
end $$;

insert into users (
  clerk_user_id,
  email,
  first_name,
  last_name,
  role,
  company_id,
  is_active
)
select
  clerk_user_id,
  super_admin_email,
  first_name,
  last_name,
  'super_admin',
  null,
  true
from micm_pilot_super_admin_input
on conflict (clerk_user_id) do update
set
  email = excluded.email,
  first_name = coalesce(excluded.first_name, users.first_name),
  last_name = coalesce(excluded.last_name, users.last_name),
  role = 'super_admin',
  company_id = null,
  is_active = true,
  updated_at = now();

select
  id,
  email,
  role,
  company_id,
  is_active,
  created_at,
  updated_at
from users
where clerk_user_id = :'clerk_user_id';

commit;
