# Contributing and Quality Checklist

This document describes the quality checks that every contributor (human or AI agent) must complete before opening a pull request or considering a task done.

---

## Before You Push

Run all of these in order and confirm each exits cleanly:

```bash
# 1. Full typecheck across all packages
pnpm run typecheck

# 2. Run the automated test suite
pnpm test

# 3. Confirm generated API files are in sync with the OpenAPI spec
#    (Only needed if you changed openapi.yaml or ran codegen)
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck   # re-run after codegen to catch any mismatches

# 4. Verify lib/api-zod/src/index.ts contains exactly one line:
#      export * from "./generated/api";
cat lib/api-zod/src/index.ts
```

The initial automated suite uses **Vitest** and **Supertest**. It covers safety-critical API behavior with mocked Clerk auth and an in-memory DB test double, so it does not require real Clerk keys, a PostgreSQL database, secrets, or production data.

---

## Manual Smoke Test Checklist

Complete the following against a running local or staging environment with all three demo accounts.

### 1. Authentication

- [ ] Sign in as Super Admin (`superadmin@micm-demo.com`)
- [ ] Sign in as Company Admin (`companyadmin@micm-demo.com`)
- [ ] Sign in as Company User (`companyuser@micm-demo.com`)
- [ ] Sign out clears the session and redirects to `/sign-in`
- [ ] Accessing a protected route while unauthenticated redirects to `/sign-in`

### 2. Role Access Control

**Super Admin must be able to:**
- [ ] View the Companies page and see all companies
- [ ] View the Users page and see users across all companies
- [ ] View any company's assessments
- [ ] See the cross-company radar on Dashboard and Reports

**Company Admin must be able to:**
- [ ] View and manage their own company's assessments
- [ ] Assign users to assessments
- [ ] Activate and complete assessments
- [ ] See their own company's reports and radar
- [ ] NOT see other companies' data (verify no cross-company data leaks)

**Company User must be able to:**
- [ ] See their assigned assessments
- [ ] Take an active assessment
- [ ] Submit scores and notes per criterion
- [ ] NOT see the Companies or Users management pages

### 3. Tenant Isolation

- [ ] Sign in as Company Admin for Company A — confirm no records from Company B appear anywhere (assessments, users, actions, reports)
- [ ] Attempt to access `/api/assessments?companyId=<other_company_id>` as Company Admin — confirm 403 or filtered response
- [ ] Sign in as Company User — confirm they can only see assessments they are assigned to

### 4. Assessment Lifecycle

- [ ] Create a new assessment (draft)
- [ ] Activate the assessment
- [ ] Assign a Company User to the assessment
- [ ] Take the assessment as the assigned user — score all criteria across all six domains
- [ ] Verify the inline score hint (`SelectedScoreHint`) appears below the selected button
- [ ] Verify the scoring guide panel appears above the criteria for each domain
- [ ] Save progress mid-way and return — confirm scores are persisted
- [ ] Submit the assessment and confirm status changes
- [ ] Mark the assessment as completed

### 5. Scoring Guidance Verification

- [ ] The scoring guide panel (0–4 scale with full definitions) is visible above criteria in TakeAssessment
- [ ] Selecting a score shows the inline hint with the correct definition (not just the number)
- [ ] The compact score scale legend (5-column grid) appears below the radar chart on AssessmentDetail
- [ ] The compact score scale legend appears below the radar on the Dashboard
- [ ] The compact score scale legend appears below both radar cards on Reports

### 6. Radar and Charts

- [ ] After completing an assessment, the Results Radar on AssessmentDetail renders with domain scores
- [ ] The Maturity Radar on the Dashboard shows the correct overlay for the company
- [ ] Multi-assessment overlay: selecting 2–4 assessments shows all overlaid on a single radar
- [ ] The progress over time line chart appears on Reports when more than one assessment cycle is completed

### 7. Super Admin Cross-Company Radar

- [ ] Sign in as Super Admin
- [ ] On Dashboard: the cross-company `CompanyMultiSelect` is visible
- [ ] Selecting 2 companies shows both overlaid on the radar with correct labels
- [ ] Selecting 4 companies works (maximum overlay limit)
- [ ] Selecting a 5th company is blocked by the UI (MAX_OVERLAYS = 4)
- [ ] On Reports: same cross-company radar section is present and functional

### 8. Actions

- [ ] Create an action with priority, due date, and domain
- [ ] Update action status (open → in-progress → completed)
- [ ] Confirm actions are scoped to the correct company

### 9. Invitations

- [ ] Generate an invitation link as Company Admin
- [ ] Open the invitation link in an incognito window
- [ ] Accept the invitation — confirm the new user is created with the correct company association

### 10. Demo Mode Isolation

- [ ] Confirm `POST /api/demo/sign-in-token` returns 200 in development
- [ ] Confirm `POST /api/demo/sign-in-token` returns 404 when `NODE_ENV=production`
- [ ] Confirm the demo credentials panel is not visible in production

---

## API Contract Consistency Check

When making API changes, verify:

- [ ] Every new endpoint is defined in `lib/api-spec/openapi.yaml` with correct request/response schemas
- [ ] Codegen was run after spec changes: `pnpm --filter @workspace/api-spec run codegen`
- [ ] The route handler uses the generated Zod schema for input validation
- [ ] The response shape matches the schema (no extra or missing fields)
- [ ] `lib/api-zod/src/index.ts` contains only `export * from "./generated/api";`

---

## Database Change Checklist

- [ ] New table or column added to `lib/db/src/schema/`
- [ ] Exported from `lib/db/src/schema/index.ts`
- [ ] `pnpm --filter @workspace/db run push` applied successfully
- [ ] `pnpm run typecheck` passes cleanly
- [ ] Seed scripts updated if new required data is expected

---

## Security Checklist

- [ ] No secrets, API keys, or passwords committed (check `.env` is gitignored)
- [ ] Tenant isolation enforced: all DB queries for Company Admin / Company User filter by `companyId`
- [ ] Demo endpoint returns 404 in production (`NODE_ENV === "production"`)
- [ ] New routes that require authentication include Clerk auth middleware
- [ ] New Super Admin routes check `role === "super_admin"` explicitly

---

## Code Style Notes

- No `console.log` in server code — use `req.log` or the `logger` singleton
- No emojis in UI text unless explicitly requested by a product stakeholder
- SME-friendly language — avoid technical jargon in user-facing labels and error messages
- Dark mode must work: any new UI component must use Tailwind semantic colour tokens (`text-foreground`, `bg-card`, `border-border`) rather than hardcoded colours
- New components go in `artifacts/micm-platform/src/components/`; new pages go in `artifacts/micm-platform/src/pages/`
- Update `App.tsx` routing when adding a new page
