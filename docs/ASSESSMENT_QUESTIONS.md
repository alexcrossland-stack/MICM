# Assessment Question Management

## Using the editor

Super Admins can open **Assessment Questions**, choose a company, and open an
assessment. The same editor is linked from assessment detail as **Manage questions**.
Question changes affect that assessment only, not other companies or the shared
starting catalogue. Company Admins and assigned Company Users retain their existing
assessment/scoring roles but cannot edit questions.

- Edit question text, supporting description, baseline and excellence guidance.
- Add questions under an existing category, change category, or reorder questions.
- Remove questions from an editable draft; **Show removed** allows restoration.
- Preview, then save the whole questionnaire. The confirmation identifies the
  company/assessment and change counts. Failed saves retain the local draft.
- The maturity scale remains 0-4. Every included question is required. An assessment
  cannot activate or complete with no included questions.
- Active and completed questionnaires are locked. An unanswered active assessment
  may be returned to draft by a Super Admin. Any score, evidence note, or completed
  participant locks the questionnaire, including on a draft.
- **Create revised assessment** makes a new same-company draft with new question
  IDs. It copies questions, not answers, evidence, actions, or participants.
- Concurrent saves return a conflict. Check the latest version, compare your local
  edits, then discard/reapply them deliberately; do not overwrite another admin.

Reports use saved questions. Operational-detail CSV/PDF/Excel include a question
appendix; evidence previews identify their saved question. Reports identify question
set version and coverage. Radar comparisons warn when questionnaires differ;
trend lines break across changed question sets. Programme benchmarks/heatmaps use
one matching question-set cohort at a time. Operational action/company counts still
cover the selected programme population, not only that comparison cohort.

## Data and API

`assessment_questions` stores an assessment-local snapshot, stable identity,
source criterion (nullable for custom questions), saved grouping/text/order and
inclusion. Removal retains the row. Scores and evidence reference both the question
and assessment; database constraints prevent cross-assessment links. Signatures
are derived from included question content, not stored mutable hashes; ordering
and database IDs do not affect comparability, duplicate wording still counts twice.

OpenAPI defines GET/PUT `/api/assessments/{id}/questions` and POST
`/api/assessments/{id}/revisions`. Writes use `expectedQuestionsVersion`; scores and
evidence use `assessmentQuestionId` plus `questionsVersion`. Legacy `criterionId`
remains readable, nullable on custom questions. Versionless legacy writes only
work on unchanged v1 catalogue-backed assessments. New fields cannot be injected
through company-admin assessment creation/update or score payloads.

Mutations lock the assessment row. Question creation/change, lifecycle changes,
evidence creation and revisions commit their audit events in the same transaction.
Question audit metadata contains IDs, versions, field names and counts, not text.
Participants with saved answers cannot be removed; completed participants are not
silently reset when assignments are saved.

## Deployment gate: write maintenance required

Do not push this release into an unattended production deployment. It adds three
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
real concurrent saves/activation and rollback on audit failure. The in-memory
route suite separately tests all roles, membership, evidence, custom completion,
exports and comparison cohorts. Browser QA must still use fake local/staging data.

## Release smoke checklist

- Super Admin with no company assignment chooses either of two fake companies.
- Edit all four text fields; add two same-worded questions; reorder, remove,
  restore, preview, save and reload. Check stable IDs and the other assessment.
- Verify invalid text/category, foreign IDs, stale versions and blank activation
  fail without partial writes. Verify Company Admin/User direct editor/API denial.
- Activate, save partial scores and evidence; attempt completion, then score all
  included questions and complete. Ensure removed questions are not required.
- Evidence selection, results and exports show the exact saved question, including
  duplicate labels and custom questions with no legacy criterion ID.
- Attempt locked edits and reopening completed work. Create a revised draft and
  verify original history and empty participant/answer/evidence lists.
- Check empty domains are unscored, changed questionnaires are not pooled, and
  reports/CSV/PDF/Excel contain correct company, version and questionnaire content.
- Verify archive preserves snapshots and hides inactive companies as before.

## Limits

No global catalogue editor, new domains/categories, optional questions, scoring
weights, rich HTML, or alternative answer types. Existing PDF typography remains
basic and its font path normalizes non-ASCII text; review non-English PDF output
before relying on it (CSV/Excel retain Unicode). Evidence export remains a bounded
preview, not a full evidence archive. Long questionnaires can produce many PDF pages.

## Local validation record (2026-08-31)

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
- GitHub CI, authenticated staging end-to-end testing and production rollout have
  **not** been performed. CI is configured to run the real PostgreSQL suite.

Changed areas: DB schema/migrations/snapshot helper; assessment/question/score/
evidence/results/report/programme API handlers; report composition and renderers;
question editor, navigation, scoring/review and analytics pages; generated OpenAPI
clients; non-production seeds; tests, CI service and these contributor/runbook docs.
