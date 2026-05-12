# Database Migration Workflow

The database schema is defined in `lib/db/src/schema/` with Drizzle ORM. Schema changes must be promoted through generated SQL migrations, not by pushing schema diffs directly into shared environments.

## Commands

| Task | Command |
|---|---|
| Generate a migration after editing schema files | `pnpm --filter @workspace/db run generate` |
| Apply committed migrations to a target database | `DATABASE_URL=<target_url> pnpm --filter @workspace/db run migrate` |
| Local throwaway schema sync only | `DATABASE_URL=<local_dev_url> pnpm --filter @workspace/db run push:dev` |

`push:dev` is only for disposable local databases while prototyping. Do not use schema push for staging or production.

## Required Process

1. Edit the relevant schema file in `lib/db/src/schema/`.
2. Export new tables or insert schemas from `lib/db/src/schema/index.ts`.
3. Generate a migration with `pnpm --filter @workspace/db run generate`.
4. Review the generated SQL under `lib/db/migrations/` before committing it.
5. Apply the migration to a local database with `DATABASE_URL=<local_dev_url> pnpm --filter @workspace/db run migrate`.
6. Run `pnpm run typecheck` and `pnpm test`.
7. Include the schema change and migration files in the same PR.

## Review Checklist

- The PR includes a generated migration for every schema change.
- The migration SQL is reviewed for destructive operations such as dropped columns, dropped tables, type narrowing, or `NOT NULL` additions without a backfill.
- Any destructive operation has an explicit rollout plan in the PR description.
- Seed scripts are updated when new required reference data is introduced.
- `push:dev` was not used as the deployment mechanism.

## Existing Databases

This project previously used `drizzle-kit push` without migration history. The repository now includes an initial baseline migration for new databases. For an existing environment that already has tables, do not blindly run the baseline migration against it.

1. Confirm the live schema matches the current Drizzle schema.
2. Mark the baseline migration as applied in the target environment according to the chosen deployment process.
3. Apply subsequent migrations with `pnpm --filter @workspace/db run migrate`.

Until the baseline is established for an existing environment, do not run generated migrations against it without first confirming the schema state.
