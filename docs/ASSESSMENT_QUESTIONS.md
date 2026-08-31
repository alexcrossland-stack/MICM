# Assessment Question Management

## Using the editor

Super Admins open **Standard Questions** at `/assessment-questions`. This is the
global starting catalogue, not a company or live assessment. Changes apply to
assessments created **after a successful save**, across all companies. No company
selection or Super Admin company assignment is needed.

Existing draft, active and completed assessments retain their saved questions,
answers, evidence and report content. An already-created draft does not pick up
later catalogue edits. Create a new assessment to use the latest standard questions.
Company Admins and Company Users cannot access the editor or its API; their normal
assessment creation, assignment and scoring permissions remain unchanged.

- Edit question text, supporting description, baseline and excellence guidance.
- Add questions under an existing category, change category, or reorder questions.
- Remove questions from the standard catalogue; **Show removed** allows restoration.
  Records are retained, not deleted. Removal/restoration affects future assessments only.
- Preview, then **Save standard questions**. The confirmation shows change counts
  and the all-company, future-assessment scope. Failed saves retain the local draft.
- The maturity scale remains 0-4. Every included question is required. Keep at least
  one question included. A domain with no included questions remains unscored.
- Concurrent saves return a conflict. Check the latest version, compare your local
  edits, then discard/reapply them deliberately; do not overwrite another admin.

Reports use saved questions. Operational-detail CSV/PDF/Excel include a question
appendix; evidence previews identify their saved question. Reports identify question
set version and coverage. Radar comparisons warn when questionnaires differ;
trend lines break across changed question sets. Programme benchmarks/heatmaps use
one matching question-set cohort at a time. Operational action/company counts still
cover the selected programme population, not only that comparison cohort.

## Data and API

`criteria.is_included` defaults to true for all existing rows. The global editor
uses GET/PUT `/api/standard-assessment-questions`, restricted to active Super Admins.
PUT takes the complete catalogue and an opaque `expectedVersion` hash from GET.
Existing IDs must remain in the payload; removal sets `isIncluded=false`. Unknown
IDs/categories, duplicate IDs, invalid fields and empty included sets are rejected.
Duplicate wording is allowed and counted separately. Domain/category structures
cannot be changed through this API. Limits are 500 records including removed
questions, 500 characters of question text and 5,000 per guidance field.

Catalogue saves lock fixed domain rows in stable order and update all criteria
inside one transaction. New assessments read included criteria in one statement,
so concurrent creation sees either the previous or newly committed catalogue,
never a partly saved set. `catalogue.questions_changed` auditing commits in that
transaction; audit failure rolls back the edit. Events are global (`companyId=null`)
and contain IDs, counts, changed field names and version hashes, not question text.

`assessment_questions` stores an assessment-local snapshot, stable identity,
source criterion (nullable for custom questions), saved grouping/text/order and
inclusion. Removal retains the row. Scores and evidence reference both the question
and assessment; database constraints prevent cross-assessment links. Signatures
are derived from included question content, not stored mutable hashes; ordering
and database IDs do not affect comparability, duplicate wording still counts twice.

The existing GET/PUT `/api/assessments/{id}/questions` and POST
`/api/assessments/{id}/revisions` APIs remain for backwards compatibility. The old
`/assessments/:id/questions` browser URL redirects to the global editor. Assessment-local
writes remain Super Admin-only and locked after activation/responses. An explicit
revision copies its source snapshot, not the latest standard catalogue; it is not
offered by the standard editor. Use normal **Create assessment** for new standard
questions. Legacy writes use `expectedQuestionsVersion`; scores and
evidence use `assessmentQuestionId` plus `questionsVersion`. Legacy `criterionId`
remains readable, nullable on custom questions. Versionless legacy writes only
work on unchanged v1 catalogue-backed assessments. New fields cannot be injected
through company-admin assessment creation/update or score payloads.

Mutations lock the assessment row. Question creation/change, lifecycle changes,
evidence creation and revisions commit their audit events in the same transaction.
Question audit metadata contains IDs, versions, field names and counts, not text.
Participants with saved answers cannot be removed; completed participants are not
silently reset when assignments are saved.

## Standard catalogue deployment and rollback

This follow-up adds only `0008_smiling_the_phantom.sql`: a non-null boolean column
with default true on `criteria`. It does not rewrite question text, snapshots,
company records, scores or notes. No reseed or data backfill is required.

1. Confirm the snapshot-aware PR #39 release/migrations `0005`-`0007` are present.
   Environments predating it must follow the legacy cutover below first.
2. Verify a database backup and run the normal migration process with the approved
   server environment: `pnpm --filter @workspace/db run migrate`. Never `push:dev`.
3. Deploy matching API/frontend builds after migration. No new env vars or services.
4. Confirm health, role restrictions and read-only access to the standard editor.
   Test catalogue writes and cross-company inheritance in non-production first:
   even a QA question added in production affects all newly created assessments.

**Rollback:** keep the additive column and saved snapshots. Before any catalogue
removals, the previous snapshot-aware build is compatible. After removals, the
previous build would ignore `is_included` and include removed questions in new
assessments. Do not roll back that writer unattended: prefer a fix forward, or block
new assessment creation until an inclusion-aware build is running. Do not drop
records, reseed or restore a database without separate operator approval.

## Legacy snapshot cutover (`0005`-`0007` only)

The following gate applies to installations upgrading from before PR #39, not to
the additive `0008` follow-up on an already snapshot-aware deployment.

Do not push the legacy snapshot release into an unattended production deployment. It adds three
migrations and requires a short, operator-controlled write-maintenance window.
The existing VPS pipeline normally runs migrations while the old API is running;
that is **not safe for this cutover**. Review/rehearse and arrange maintenance first.

**Before merging:** keep the PR in draft until staging validation, backup/restore
rehearsal and an operator-owned maintenance plan are approved. Disable the
push-triggered **Deploy VPS** workflow before merging this release so merge cannot
start the existing unsafe cutover sequence. This is an operator action, not a step
performed by the feature or its tests. Perform the controlled cutover below, record
the deployed SHA and validation, then re-enable the workflow only after all API
instances run the snapshot-aware release. Do not dispatch the unchanged workflow
as a substitute for stopping old writers.

1. Run the read-only [preflight SQL](sql/assessment-question-preflight.sql) against
   the intended database using approved credential handling. Review all counts;
   stop for duplicate/invalid answers, dangling references, inconsistent note
   company links, an empty catalogue with existing assessments, or oversized text.
2. Take and verify a database backup. Record the backup location and current commit
   in the operator change record, not in public build logs. Rehearse on non-production.
3. Put the site/API into maintenance and stop **all old API writers**, including
   other replicas and jobs. Keep writes blocked through migration/build/cutover.
4. Apply `pnpm --filter @workspace/db run migrate` through the approved deployment
   process with its normal server environment. Never run `push:dev` or reseed.
   `0005` adds nullable structures, `0006` copies every existing assessment's full
   catalogue and maps scores/evidence, `0007` enforces references/uniqueness/scale.
5. Verify saved score/note IDs, values, authors and timestamps and company/user/
   assignment counts against preflight. Every old answer/note must have one same-
   assessment question; no `assessment_question_id` may be null. Compare historical
   results and exports. Backfill is journaled and repeat-safe without overwriting
   existing snapshots. Earlier wording never stored cannot be reconstructed.
6. Start only the snapshot-aware API and matching frontend. Verify health and the
   checks below before reopening writes. Keep old browser tabs from submitting stale
   questionnaires; version conflicts require a reload.

**Rollback:** after `0007`, old binaries are not valid writers, even before custom
answers exist. Do not revert just the application to the legacy build or drop the
new columns. Keep maintenance in place and roll forward, or use a verified
snapshot-aware build. Backup restoration requires separate approval and accounting
for any post-backup writes. No production changes are performed by this document.

## Contributor validation

The normal suite runs without production credentials. The additional PostgreSQL
tests run only when explicitly enabled and **reset the public schema** in an
isolated loopback database named exactly `micm_questions_test`. Never point them
at a shared staging or production database. CI provisions its own disposable
PostgreSQL service with no production secrets.

```bash
# On a local disposable PostgreSQL installation only:
createdb micm_questions_test
MICM_QUESTION_TEST_DATABASE_URL=postgresql://localhost/micm_questions_test pnpm test
pnpm --filter @workspace/db run generate
pnpm --filter @workspace/api-spec run codegen
CI=true pnpm run typecheck
CI=true pnpm test
CI=true pnpm --filter @workspace/api-server run build
CI=true PORT=3001 BASE_PATH=/ pnpm --filter @workspace/micm-platform run build
git diff --check
```

Without the explicit test URL, PostgreSQL-specific tests are reported as skipped.
They exercise legacy preservation, repeat backfill, reference/score constraints,
real concurrent catalogue saves/creation, assessment saves/activation and rollback
on audit failure. The in-memory route suite separately tests all roles, membership,
catalogue inheritance/restoration, unchanged history/results/exports, evidence,
custom completion and comparison cohorts. Browser QA uses fake local/staging data.

## Release smoke checklist

- Super Admin with no company assignment opens Standard Questions without selecting
  any company or existing assessment. Non-admin direct editor/API access is denied.
- Record snapshots/results for existing drafts, active and completed assessments.
- Edit all four text fields; add questions, reorder, remove, restore, preview, save
  and reload. Check stable IDs, duplicate wording and hidden removed rows.
- Create new assessments for two fake companies. Both must use the latest included
  catalogue; all existing snapshots/results/exports must remain unchanged.
- Verify invalid text/category, unknown/duplicate/missing IDs, all-removed sets and
  stale versions fail without partial writes or lost local draft content.
- Score a new assessment, add evidence and complete it. Results and exports must
  show the saved questions; removed standard questions are not required.
- Check empty domains are unscored, changed questionnaires are not pooled, and
  reports/CSV/PDF/Excel contain correct company, version and questionnaire content.
- Verify archive preserves snapshots and hides inactive companies as before.

## Limits

No new domains/categories, optional questions, scoring weights, rich HTML, or
alternative answer types. Removing all questions in a domain changes coverage and
comparability; the included count and preview should be reviewed before saving.
Existing PDF typography remains
basic and its font path normalizes non-ASCII text; review non-English PDF output
before relying on it (CSV/Excel retain Unicode). Evidence export remains a bounded
preview, not a full evidence archive. Long questionnaires can produce many PDF pages.

## Standard catalogue validation (2026-08-31)

- Typecheck, API build, frontend build and `git diff --check` passed.
- 96 tests passed with the disposable PostgreSQL suite enabled. Coverage includes
  future-assessment inheritance in both companies, partial/complete scoring,
  immutable existing snapshots/results/CSV/PDF/Excel, permissions, stale versions,
  invalid inputs, real database races, migration defaults and audit rollback.
- Codegen rerun produced identical client/Zod hashes; no generated edits by hand.
  Drizzle generation reports no schema drift. Actionlint and added-code secret scan passed.
- Chromium checks with local fake HTTP/auth fixtures passed for editing all four
  text fields, addition, category/order, duplicate warning, removal/restoration,
  preview, save/reload and stale-save draft retention. Screenshots checked at
  1366/768/390 pixels without horizontal overflow. No production writes performed.
- GitHub CI and rollout status belong to the follow-up PR. The frontend build
  retains the existing source-map/chunk-size warnings; no new dependencies added.

## Snapshot foundation validation (PR #39, 2026-08-31)

- Pinned pnpm 10.26.1; dependency lockfile and platform overrides unchanged.
- Typecheck passed. Full test suite: 88 passed with disposable PostgreSQL enabled.
- API and frontend production builds passed. Frontend retains the existing
  sourcemap/chunk-size warnings; these did not fail the build.
- Drizzle generation reports no schema drift. Full migration command passed on
  an empty local database; legacy backfill, constraints, repeat safety and races
  passed in the PostgreSQL integration suite.
- OpenAPI codegen passed; generated client/Zod files were not edited by hand.
- `git diff --check`, Actionlint for CI, and added-file/added-line secret-pattern
  scan passed. No dependency changes, secrets or production data were added.
- Chromium fixture-only browser checks passed for all four text fields,
  save/reload, addition, duplicate wording, ordering, removal, hidden removed rows
  and restoration. Screenshots checked at 1366, 768 and 390 pixel widths with no
  horizontal overflow. This used the real editor and generated hooks with local
  mocked auth/HTTP responses, not production Clerk sessions.
- PR #39 subsequently passed GitHub CI and was deployed with the controlled legacy
  cutover. CI is configured to run the real PostgreSQL suite. This record describes
  the snapshot foundation, not validation evidence for subsequent catalogue changes.

Changed areas: DB schema/migrations/snapshot helper; assessment/question/score/
evidence/results/report/programme API handlers; report composition and renderers;
question editor, navigation, scoring/review and analytics pages; generated OpenAPI
clients; non-production seeds; tests, CI service and these contributor/runbook docs.
