# Staging Demo Data

`seed-staging-demo-data` creates a richer fake dataset for local and staging validation. It is intended for demos, QA, report/export checks, analytics checks, programme intelligence views, radar overlays, and target-setting validation.

This seed is DB-only. It does not create Clerk users, passwords, tokens, API keys, or production identifiers.

## What It Creates

- Three fake companies named with the `MICM STAGING DEMO -` prefix
- One fake Super Admin DB user
- One fake Company Admin and two fake Company Users per company
- Completed baseline and improvement assessment cycles
- Active incomplete assessment cycles
- Draft planning assessment cycles
- Full scores for completed assessments
- Partial scores for active assessments
- Improvement actions across multiple statuses and priorities
- Domain maturity targets for target-setting and radar overlay checks
- Criterion evidence notes linked to company, assessment, criterion, author, and timestamp

All user emails use `example.test`, and all Clerk user IDs use the `micm-staging-demo-` prefix. These records are deliberately fake and cannot be confused with real company data.

## Guardrails

The script refuses to run unless all of the following are true:

- `ENABLE_STAGING_DEMO_SEED=true` is set
- `DATABASE_URL` is set
- `NODE_ENV` is not `production`
- `DATABASE_URL` does not contain `prod`, `production`, or `live`

Production seeding is disabled by default and should stay that way.

## How To Run

Apply migrations and seed MICM domains first:

```bash
DATABASE_URL=<non_production_url> pnpm --filter @workspace/db run migrate
DATABASE_URL=<non_production_url> pnpm --filter @workspace/scripts run seed-domains
```

Then run the staging/demo seed:

```bash
ENABLE_STAGING_DEMO_SEED=true DATABASE_URL=<non_production_url> pnpm --filter @workspace/scripts run seed-staging-demo-data
```

Re-running the script replaces the prior `MICM STAGING DEMO - ...` companies and related seeded records, then recreates the dataset.

## Authentication Note

The seeded users are database records only. To sign in as these users, a matching Clerk development or staging user would need to exist with the same external user ID mapping. Creating Clerk users for this richer dataset is intentionally out of scope for the seed script.
