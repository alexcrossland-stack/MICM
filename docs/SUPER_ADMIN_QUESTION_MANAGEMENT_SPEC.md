# Super Admin Assessment Question Management

Status: implemented locally for review; not deployed. Operational guide and
release gates: [Assessment Question Management](ASSESSMENT_QUESTIONS.md).
Reviewed: 2026-08-31, against local commit `daec9c5`.
Related backlog: [#010 - Domain and criterion management](BACKLOG.md#010--domain-and-criterion-management-super-admin).

## 1. Recommendation

Add a Super Admin question editor for each assessment. A Super Admin selects a
company and assessment, edits all question wording and guidance, adds questions,
removes questions, previews the questionnaire, and saves before activation.

Each assessment must store its own copy of its questions. Editing one company's
assessment must not change another assessment or the shared MICM catalogue.
Scored assessments retain their original question set, wording, evidence links,
and results. This requires database migrations and coordinated API/frontend
changes; it cannot safely be delivered as a text editor over the existing table.

The first release covers assessment-specific editing. A shared question-library
editor that changes defaults for future assessments is a separate follow-up, not
an implicit side effect of this feature.

## 2. Pre-implementation Behaviour and Risks

In the code, a "question" is a `criterion` inside a category and domain.

| Area | Current implementation | Consequence for this feature |
|---|---|---|
| Catalogue | `lib/db/src/schema/domains.ts`: shared `domains`, `categories`, `criteria`; no versions or assessment membership | Direct edits would affect every assessment using the criterion |
| Assessments | `lib/db/src/schema/assessments.ts`: company, lifecycle, assignees; no saved question set | There is nowhere to record which questions belong to an individual assessment |
| Catalogue API | `artifacts/api-server/src/routes/domains.ts`: read-only `GET /api/domains` returns the shared tree | No supported question create/edit/remove API exists |
| Scoring UI | `artifacts/micm-platform/src/pages/TakeAssessment.tsx`: uses `useListDomains()` and `criterionId` | Every assessment displays the current shared questions |
| Review UI | `artifacts/micm-platform/src/pages/AssessmentDetail.tsx`: uses the shared tree for missing scores and evidence selection | Changing the catalogue changes completion requirements and note labels |
| Completion | `routes/assessments.ts:getMissingScoreSections`, `routes/scores.ts:POST /scores` | Requirements use all catalogue criteria; score submission compares row counts rather than exact membership |
| Scores/evidence | `scores.criterion_id` and `criterion_notes.criterion_id` reference the shared catalogue | Hard deletion can break references; local questions need their own identity |
| Evidence API | `routes/criterionNotes.ts` verifies criterion existence, but there is no assessment question-membership model | Existence alone will be insufficient once assessments differ |
| Analytics/reporting | API `routes/scores.ts`, `routes/reports.ts`, `routes/programme.ts` resolve domains through current catalogue records | Saved labels and grouping must come from the assessment copy |
| Exports | `lib/reportComposition.ts` and `lib/reportExports.ts` share report content | Use the same saved questions for screen, CSV, PDF and Excel output |
| Audit | `artifacts/api-server/src/lib/audit.ts` records events but catches write failures | New question mutations need durable audit records in their transaction |
| Seed | `scripts/src/seedDomains.ts:139` deletes criteria/categories/domains before inserting | Contrary to README's idempotency claim, do not rerun this against an established catalogue |

Backend file paths abbreviated as `routes/` or `lib/` above are under
`artifacts/api-server/src/`. These findings come from source inspection, not a
fresh production test. Historical documentation contains stale statements, so
the checked-out implementation is the basis for this proposal.

## 3. Scope and Permissions

| Capability | Super Admin | Company Admin | Company User |
|---|---|---|---|
| Manage questions for any active company's editable draft | Yes | No | No |
| View assessment questions | Any company | Own company | Assigned assessment in own company |
| Add/edit/remove/reorder questions | Editable drafts only | No | No |
| Create a revised draft from an existing assessment | Yes, same company in v1 | No | No |
| Create standard assessments / manage participants | Existing permissions | Existing own-company permissions | No |
| Score and complete work | Existing Super Admin workflow | Existing assignment/management rules | Existing assigned-user rules |
| Access reports and exports | Existing global access | Existing own-company access | No new access |

All new reads and writes require an active authenticated MICM user. Enforce roles
and tenant/assignment checks server-side. Derive company scope from the assessment
record, never the Super Admin's nullable `companyId` or a trusted request-body ID.
Archived companies remain read-only for this feature under existing access rules.
Neither custom questions nor their drafts become visible through the global
`/api/domains` endpoint. Company Admins cannot inject question changes through
assessment creation/update, clone parameters, or scoring payloads.

No changes to Clerk, CORS, security headers, demo lockout, or startup preflight.

## 4. Super Admin User Experience

### Entry Points

- Add `Assessment Questions` in the Super Admin navigation near `Assessments`;
  preserve `Info` at the top and hide the new entry while role resolution is pending.
- `/assessment-questions` provides the existing company selector, then an
  assessment selector. Do not select a company implicitly from the admin's profile.
- Add `Manage questions` on assessment detail, linking to
  `/assessments/:id/questions`. Show company name, assessment name, lifecycle state,
  question-set version, and included question count prominently.
- Unauthorized direct navigation is blocked; hiding controls is not authorization.

### Editor

Use the existing form/table/dialog components, grouped by the six existing domains
and categories. Do not redesign the assessment flow or permit domain/category
creation, removal, or renaming in this release.

| Editable field | Proposed validation |
|---|---|
| Question text (`name`) | Trimmed plain text, 1-500 characters |
| Supporting description/instructions (`description`) | Optional plain text, up to 5,000 characters |
| Baseline guidance (`baselineDescription`) | Optional plain text, up to 5,000 characters |
| Excellence guidance (`excellenceDescription`) | Optional plain text, up to 5,000 characters |
| Category | Required existing category; domain is derived server-side |
| Position | Reorder within the category using accessible move-up/down controls |
| Included | Remove/restore within this assessment; no physical deletion |

Limits apply to new/edited content and must be checked against existing content
before enforcement; a backfill must not truncate legacy text. The global 0-4
scale and its intermediate score meanings are not editable. No HTML editor,
uploads, branching questions, new answer types, weighting, or optional scored
questions in v1. Every included question is required.

- `Add question` creates a question in this assessment only. New questions do not
  appear in other companies or become catalogue defaults.
- Duplicate wording is allowed with a warning. Identity and evidence selection
  use stable question IDs, never text, array position, or display order.
- `Remove from assessment` opens a dialog naming the company, assessment, and
  question. Explain that other assessments and historical answers are unaffected.
- Retain removed rows internally and expose a Super Admin `Show removed` filter
  and restore action. Participants see only included questions.
- `Preview`, `Save changes`, and `Discard changes` apply to the whole editor.
  Confirm the added/edited/removed counts on save. A save is atomic, with no
  partial update if a single question is invalid.
- Show loading, validation, permission, locked-state, save-success, and save-error
  states. Warn before leaving unsaved changes. Preserve edits after a failed save.
- A concurrent edit returns a conflict; offer reload and preserve the local draft
  for comparison instead of overwriting the other admin's changes.
- Invalidate the assessment's question, detail, completeness, and relevant list
  queries after save. On navigation, reset selection/form state by assessment ID.
  Never retain another assessment's evidence selection.

## 5. Lifecycle and Historical Safety

| Assessment condition | Allowed question changes |
|---|---|
| Draft, no scores/evidence/completion markers, never activated or explicitly unlocked by the safe return-to-draft flow | Edit, add, remove, restore, reorder |
| Active, with no scores/evidence/completion markers | Read-only; Super Admin may explicitly return it to draft, then edit |
| Any scores, evidence notes, or participant completion markers exist | Locked, even if someone changes its status back to draft |
| Completed | Locked, including assessments backfilled from production |

Activation validates and locks the included question set in the same transaction
as the status change. At least one question must be included; block an empty
assessment with a clear message. Removing all questions in one domain is allowed,
but preview and reports must show that domain as `Not assessed`, never score zero.
Empty categories are omitted from the participant view.

Returning an unscored active assessment to draft requires a company/assessment-
specific confirmation and a transaction checking for scores, notes and completion
markers. Increment the question-set version and invalidate stale scoring forms.
Generic status PATCH calls cannot bypass these rules. Completed assessments must
not be unlocked through a status change.

For locked work, show `Create revised assessment`. The Super Admin supplies a new
name; copy the questions into a new draft for the same company with new question
IDs. Do not copy scores, evidence, completion markers, actions, or participant
assignments. Preserve the original assessment and record the source assessment ID
in the audit event. This is the supported way to change an assessment that has
already been answered; editing answers' original questions in place is excluded.

Lock/edit/activation/score/evidence operations must share the assessment-row lock
and revision check. A simultaneous score or evidence save and a return-to-draft
must not produce answers attached to a subsequently edited question.
If existing permissions allow the first evidence note on a draft, that write also
locks its questions atomically. A completed assessment cannot be returned to an
editable state by removing an assignment or clearing a completion timestamp.

## 6. Proposed Data Model

Use a new `assessment_questions` table rather than adding tenant-specific rows to
the global catalogue. Existing domain/category IDs remain stable.

| Table | Additions / changes |
|---|---|
| `assessment_questions` (new) | Stable `id`; `assessment_id`; nullable `source_criterion_id`; category/domain IDs; saved domain/category labels and order; `name`, `description`, baseline/excellence text; question order; `is_included`; creation/update timestamps |
| `assessment_cycles` | `questions_version` integer default 1; nullable `questions_locked_at`; question-set signature; provenance (`legacy_backfill`, `catalogue_copy`, `customised`) |
| `scores` | Add `assessment_question_id`; retain legacy `criterion_id`, nullable for genuinely custom questions |
| `criterion_notes` | Add `assessment_question_id`; retain legacy `criterion_id`, nullable for genuinely custom questions |
| `criteria`, `domains`, `categories` | Remain the shared starting catalogue; no global question editor or catalogue text mutation in v1 |

Create snapshots for every new assessment at creation, including those created by
Company Admins. Later catalogue changes do not automatically refresh existing
drafts. Exclusion keeps the snapshot row so IDs are not reused. For local additions,
`source_criterion_id` is null; it is provenance, not an authorization key.

Required database integrity:

- Foreign keys to the assessment, catalogue source where present, category and
  domain; validate category/domain agreement server-side (derive, do not trust).
- Unique `(assessment_id, id)` on questions and composite foreign keys from both
  `(assessment_id, assessment_question_id)` references. A question ID belonging
  to another assessment must be impossible to attach accidentally.
- Unique `(assessment_id, source_criterion_id)` for non-null source IDs, making
  legacy mapping unambiguous; clone preserves source IDs within the new assessment.
- Unique `(assessment_id, user_id, assessment_question_id)` for scores; integer
  score CHECK 0-4. Do not introduce uniqueness for evidence notes: many are allowed.
- Index assessment membership/order and the new score/evidence references.
  No cascading deletion of scored history; keep existing company archive behaviour.
- New custom questions cannot be enabled until all score/note readers support
  nullable legacy criterion IDs. Never use fabricated catalogue IDs as a bridge.
- After backfill and writer cutover, require non-null `assessment_question_id`
  for every score and evidence note. Catalogue source IDs remain nullable by design.

## 7. Scoring, Evidence, Reports and Comparisons

Create a focused backend question-set service used by scoring, completion, results,
radar/progress, report composition and Programme Intelligence. All must resolve
membership, text and category/domain grouping from the saved question rows.

Completion uses exact included-question membership for every required participant,
not score-row counts. A zero score is valid; a missing answer is not zero. Reject
unknown, excluded, duplicate-in-request and foreign-assessment question IDs before
writing any scores. Partial valid progress remains saveable. Preserve the existing
Super Admin self-scoring workflow without requiring prior manual assignment; one
admin's submission must not mark other required participants complete.
An assessment with no required participants cannot complete until a legitimate
submission establishes its participant, including the existing Super Admin path.

Evidence reads/writes use the same stable assessment question ID and permissions.
Show the saved domain/category/question text in selectors, results, reports and
exports, including after later catalogue changes. Existing permissions to add
evidence after completion need not change, but doing so cannot unlock questions.

Preserve existing aggregation and band calculations for unchanged assessments.
The current results route averages per-user domain means, while radar/report routes
average stored scores directly; these can differ for partial work. Characterize
and retain those behaviours here rather than silently changing historical scores
as part of the editor. In both cases only included saved questions contribute.
Any harmonization of partial-result calculations is separate work.

Reporting requirements:

- Report context includes assessment name, question-set version, included question
  count, domains assessed, and whether its questions were customised.
- Operational-detail output includes the included question text/guidance and saved
  evidence labels. Board-ready and executive-summary outputs may retain summaries,
  but must identify the question set and any reduced domain coverage.
- CSV/PDF/Excel consume shared composition data; preserve content types, filename
  handling, permissions and existing sections. Escape free text and spreadsheet
  formula prefixes safely; render HTML-like text as text, not executable content.
- Missing/excluded domains render as null / `Not assessed` across charts, targets
  and exports. Do not treat omitted questions as improved scores or full coverage.

Question sets that differ are not automatically comparable. Compute a deterministic
signature from the included question content, category/domain grouping and fixed
score scale, excluding database row IDs and display order. Local copies of the same
questions can match. A wording/guidance or membership change breaks the match;
identical text alone is not proof of methodological equivalence.
Canonicalization must retain duplicate-question multiplicity and use saved grouping
labels so separate database IDs do not prevent identical copies from matching.

Comparisons of matching sets can keep existing behaviour. For different sets,
individual results remain visible with `Different questions - not directly
comparable`; suppress improvement percentages/ranking and break trend lines across
the change. Programme pooled benchmarks and systemic maturity summaries must use
one matching question-set cohort at a time, showing its question count and company
sample size. Do not pool unlike sets into one maturity KPI. Operational counts
(companies, actions, assessments) may remain global and clearly labelled.
No automatic score rebasing, missing-score imputation or equivalence override in v1.

## 8. API Contract Proposal

These are proposed routes, not existing endpoints. Define them in
`lib/api-spec/openapi.yaml` before implementation and run Orval codegen.

| Endpoint | Contract / permission |
|---|---|
| `GET /api/assessments/{id}/questions` | Scoped read returning version, lock state/reason, provenance, signature, included counts and saved questions; `includeRemoved=true` is Super Admin-only |
| `PUT /api/assessments/{id}/questions` | Super Admin-only atomic save; `expectedQuestionsVersion` and complete question list, including retained removed rows |
| `POST /api/assessments/{id}/revisions` | Super Admin-only new draft in the same company from a locked question set; name required; returns new assessment; no copied answers/participants |
| Existing `POST /api/assessments` | Create assessment and starting question snapshot atomically; no Company Admin question overrides |
| Existing `PATCH /api/assessments/{id}` | Explicit draft/active/completed enum and lifecycle/lock validation; version precondition for activation and return-to-draft |
| Existing scores and criterion-note routes | Add assessment-question identity and version-aware validation, including GET filters and enriched evidence responses |
| Existing results/radar/progress/report/programme routes | Add question-set and comparability/coverage metadata; use snapshots for content and membership |

PUT distinguishes an existing question by its ID. New rows omit that ID and receive
one from the server. Existing IDs cannot be changed, reassigned, or repeated; reject
omitted existing rows rather than interpreting omission as hard deletion. Removal
is explicit `isIncluded=false`. Source-criterion provenance and domain labels are
server-controlled. Validate size limits for both the question count and total body
against the current Express body limit; reject oversized input before mutation.

Use strict write schemas, bounded text, valid category IDs and deterministic order.
Return field errors with question identifiers. No-op saves do not advance the
version. Successful changes advance it once and return canonical saved data.

Responses: 401 unauthenticated; 403 forbidden; 404 missing authorized resource;
400 invalid question data; 409 locked/stale questionnaire. Include a stable error
code and safe human-readable message. Never return another tenant's question text
in a validation error. Client-side validation mirrors but never replaces these checks.

New score/note requests use `assessmentQuestionId` and `questionsVersion`. During
transition, accept legacy `criterionId` only where an exact included snapshot
mapping exists. Reject conflicting old/new identifiers. Versionless legacy writes
are allowed only for the unchanged original catalogue-backed set; customised sets
must return a safe reload-required conflict instead of accepting stale wording.
Legacy responses retain catalogue IDs for mapped records; custom rows have null.
Document this nullable contract and regenerate every affected client/schema before
enabling custom questions. Never silently drop custom questions for old clients.

## 9. Audit and Concurrency

Record creation, question edits/additions/removals/restores/reordering, lock/unlock,
and revised-draft creation. Each event includes actor, assessment/company IDs,
question IDs, previous/new version, changed field names and change counts.
Do not copy free-text content, evidence, emails or credentials into audit metadata.

Store the mutation and its audit event in one database transaction. Extend the
existing helper narrowly to accept the transaction and propagate failures for
these operations; its current best-effort behaviour alone is not sufficient.
Use row locks and `expectedQuestionsVersion` to prevent lost updates. Any failed
authorization, validation, concurrent write or audit insert rolls back the whole
mutation and does not leave a partial assessment or accidental assignee.

## 10. Migration, Release and Rollback

1. Produce a read-only preflight: assessment counts by status, catalogue sizes,
   scores/notes by assessment, duplicate score keys, invalid scores, dangling
   references, and legacy text lengths. Stop on anomalies; do not auto-delete or
   guess which duplicate answer should win.
2. Take and verify a backup; rehearse on a protected non-production copy. Generate
   additive migrations for snapshot storage and nullable new references. No drops,
   score rewrites, company/user changes, or production reseeding.
   Establish a short planned write-maintenance window for backfill and cutover,
   or deploy a tested transitional dual writer before backfill starts.
3. Backfill every existing assessment with the current full catalogue, because that
   is the current completion model, not just criteria that happen to have scores.
   Map each existing score/note to exactly one saved question. Preserve original
   IDs, text, answers, authors, timestamps, statuses and completion markers.
4. Mark backfills as `legacy_backfill`. This captures wording at migration time;
   older wording that was never stored cannot be reconstructed. Lock active,
   completed and response-bearing assessments. Re-running a backfill must never
   overwrite snapshots or refresh text from a changed catalogue.
5. Validate totals, exact mappings, zero missing references, unchanged existing
   result/export values and no unintended company/user/assignee changes.
6. Cut over to snapshot-aware writers, verify no old processes can write, then
   enforce new non-null references/constraints in a reviewed generated migration.
   With writes still protected, validate again before resuming traffic. There must
   be no gap where old API processes can create unmapped scores or assessments.
7. Deploy all snapshot-aware readers before enabling the editor. Update
   frontend fixtures, demo-data scripts, archive/cleanup counts and contributor
   docs to understand the new table/references. Staging seeds stay non-production.
8. Change `seed-domains` to refuse an established/non-empty catalogue without
   deleting anything, with a clear bootstrap-only message and regression test.
   Correct the README's rerun guidance. Never use it to apply question edits.
9. Use the normal CI/VPS pipeline and `pnpm --filter @workspace/db run migrate`,
   never `push:dev`. Check migration status, health and the smoke tests below.

Before new reference constraints are enforced or custom questions exist, a
rehearsed rollback to legacy code may be possible while retaining the additive
columns/tables. After enforcing non-null question references, even legacy-question
writes need a compatible writer. Once custom answers exist with null legacy
criterion IDs, legacy code is not a safe rollback target. Keep a known-good
snapshot-aware build, disable question mutations if required, and roll forward or
roll back only to that compatible build. Restoring a backup requires separate
operator approval because it can discard legitimate post-backup work.

## 11. Acceptance and Test Plan

| Test | Required result |
|---|---|
| Super Admin company context | A global admin with null companyId edits the selected company's draft only |
| All text fields | Question text, supporting description, baseline and excellence save/reload verbatim within validation limits |
| Add/remove/restore/reorder | Stable IDs; removed rows retained; participant form matches saved inclusion and order |
| Duplicate names | Two same-named questions remain distinct; score and evidence use the selected ID |
| Isolation between assessments | Editing one draft leaves another draft, active assessment and completed report unchanged |
| Permissions | Company Admin/User denied all management APIs, including forged create/revision payloads; foreign assessment reads blocked |
| Scoring membership | Unknown, excluded and other-assessment IDs and duplicate inputs rejected atomically; 0 and 4 accepted, invalid values rejected |
| Completion | Partial progress saves; only exact included-set completion succeeds; excluded questions are not required |
| Super Admin scoring | No prior assignment needed; other required participants still need their own answers |
| Locks | Active/completed/response-bearing edits refused; only empty active work can return to draft; generic status changes cannot bypass |
| Revision | New draft has separate IDs and no copied answers, notes or assignments; source remains unchanged |
| Evidence | Correct saved criterion on save/reload/results/export, despite reorder or later library changes |
| Empty domains | Null / Not assessed, correct denominator and clear reduced-coverage labels; no empty assessment activation |
| Comparability | Matching sets compare; unlike sets do not pool into benchmarks or imply measured improvement |
| Reports/exports | CSV/PDF/Excel retain access controls and correct question labels/version; hostile text safely escaped |
| Concurrency | Two admin saves conflict safely; activation/scoring/note races cannot modify an answered question; retry creates no duplicates |
| Audit | Actor, scope and revision metadata present; no text/secrets logged; audit failure rolls back new question mutations |
| Migration | Existing draft/active/completed fixtures preserve scores, evidence, results and identifiers; repeat backfill is a no-op |
| Legacy clients | Unchanged legacy mappings work during transition; stale/customised requests fail clearly without data loss |
| Seed/archive regression | Seed refuses non-empty catalogue without mutation; archive preserves question history; cleaned companies stay hidden |

Use Vitest/Supertest for route and permission cases, focused UI interaction tests
for editor/evidence state, and a real disposable PostgreSQL database for migrations,
foreign keys, uniqueness, rollback and locking. The current in-memory DB double and
server-rendered frontend smoke tests cannot prove those database or browser behaviours.

Required implementation validation:

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/db run generate
CI=true pnpm run typecheck
CI=true pnpm test
CI=true pnpm --filter @workspace/api-server run build
CI=true PORT=3001 BASE_PATH=/ pnpm --filter @workspace/micm-platform run build
git diff --check
```

Also confirm migration generation reports no remaining drift after committing the
reviewed migration, generated Zod/client changes are from codegen, the Zod index
has only `export * from "./generated/api";`, secret scan and GitHub CI pass, and
the new PostgreSQL/browser tests run in a documented non-production environment.

Staging smoke: use two fake companies, all three roles, and draft/partial/completed
assessments. Edit/add/remove/restore questions, activate, score, add evidence,
complete, and inspect Analytics/Reports/all export formats. Attempt direct forbidden
URLs and foreign question IDs. Check an older completed report has not changed.
Production smoke, when separately authorized, uses approved test data only, checks
health/deploy status, and preserves all customer assessment history.

## 12. Delivery Sequence and Decisions

| PR | Scope | Release gate |
|---|---|---|
| 1. Snapshot foundation | Schema, migration/preflight/backfill, seed guard, PostgreSQL integrity tests | No editor; existing behaviour unchanged; migration rehearsed |
| 2. Snapshot-aware assessment flow | OpenAPI/codegen, scoring/evidence/completion readers and writers, report/export/analytics metadata and comparability, frontend consumers | All default assessments behave as before; historical outputs verified; no custom questions yet |
| 3. Super Admin editor | Atomic mutation/revision APIs, durable audit, nav/editor, confirmations, UI interaction and tenant tests | All acceptance checks, CI and staging smoke pass before enabling editing |

This is a medium-sized feature across the data model, API, UI and reporting, not
a safe one-file change. The assumptions for product review are: assessment-local
changes only, drafts editable, answered work immutable, six existing domains and
categories retained, fixed 0-4 scoring, all included questions required, and no
automatic comparability between different question sets. Editing active/completed
questions in place or changing global defaults would require a separate design.

Implementation notes: the signature is derived from saved content rather than
stored in a separate mutable column. The local implementation covers the dependent
foundation, consumers and editor together; the delivery table remains the suggested
review sequence, not a record of merged PRs. Production rollout requires the
documented write-maintenance gate. The pinned pnpm 10.26.1 was activated in a
temporary tooling directory without changing repository dependency configuration.
No production access or data changes were made during implementation.
