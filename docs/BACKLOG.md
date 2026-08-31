# Suggested GitHub Issue Backlog — Next Phase

This backlog covers the work recommended for the next phase of development after GitHub handover. Issues are grouped by theme and ordered roughly by priority. Each entry is written in GitHub issue format.

---

## Theme 1: Quality and Reliability

### #001 — Add automated test suite (unit + integration)
**Priority: High**

No tests exist. Add Vitest as the test runner and write:
- Unit tests for API route handlers (mock DB calls with `vitest.mock`)
- Unit tests for Zod schema validation (happy path + invalid input)
- Integration tests for the assessment lifecycle (create → activate → score → complete)
- Tests for tenant isolation (Company Admin cannot access other companies' data)

Suggested approach:
- Use `supertest` for HTTP integration tests against the Express app
- Use Drizzle's in-memory SQLite driver or a test Postgres instance
- Add a `pnpm run test` script to the root `package.json`

---

### #002 — Add GitHub Actions CI pipeline
**Priority: High**

No CI/CD pipeline exists. Create `.github/workflows/ci.yml` that runs on every PR:
- `pnpm install --frozen-lockfile`
- `pnpm run typecheck`
- `pnpm run test` (once #001 is done)
- Fail the PR if any step fails

Optionally, add a separate workflow for deployment to a staging environment.

---

### #003 — Add ESLint and Prettier config
**Priority: Medium**

`prettier` is already a root devDependency but no config file exists and ESLint is not configured.
- Add `.prettierrc` with project conventions
- Add `eslint.config.js` with `@typescript-eslint/recommended` rules
- Add `pnpm run lint` and `pnpm run format` scripts
- Integrate lint check into CI (#002)

---

### #004 — Fix esbuild platform overrides for cross-platform development
**Priority: Medium**

`pnpm-workspace.yaml` excludes all non-Linux esbuild/Rollup native binaries (Replit-container optimisation). This breaks `pnpm install` on macOS and Windows.

Options:
1. Move Replit-specific overrides into a separate override file loaded conditionally
2. Use a `.npmrc` or a pre-install script that detects the platform and patches the overrides
3. Document a Docker-based development workflow for non-Linux contributors

---

## Theme 2: Missing Features

### #005 — Report export (PDF and CSV)
**Priority: High**

Charts are currently browser-rendered only. Initial server-side CSV export, template selection, report composition, and basic PDF generation exist for company reports; continue by adding:
- Final PDF visual design for the full radar chart + score table

---

### #006 — Assessment scoring completeness validation
**Priority: High**

Currently users can submit an assessment with only some criteria scored. Add:
- Frontend warning if not all criteria are scored before submission
- API-level enforcement (configurable: warn vs. block)
- Show per-domain completion percentage clearly in the domain tab bar

Lightweight text evidence notes now exist at criterion level. File uploads, attachment storage, and richer review UI remain separate future work.

---

### #007 — Action tracking improvements
**Priority: Medium**

Current action tracking is basic. Add:
- Due date reminders / overdue highlighting
- Action ownership (assign action to a specific user)
- Action categories linked to MICM domains
- Bulk status update
- Action export (CSV)

---

### #008 — Invitation system improvements
**Priority: Medium**

Current invitation flow works but lacks:
- Invitation expiry enforcement (currently tokens do not auto-expire in the UI)
- Invitation listing and revocation by Company Admin
- Resend invitation email
- Invitation link includes role pre-selection (e.g. `?role=company_admin`)

---

### #009 — Assessment templates and cloning
**Priority: Medium**

Allow Company Admins to clone an existing assessment cycle to create a new one pre-configured with the same assignees and settings. This supports periodic re-assessment workflows.

---

### #010 — Domain and criterion management (Super Admin)
**Priority: Low**

Assessment-specific question editing is assessed in
[Super Admin Assessment Question Management](SUPER_ADMIN_QUESTION_MANAGEMENT_SPEC.md).
Assessment-local editing is implemented locally, pending review and the required
maintenance-window deployment. See [operator/contributor guide](ASSESSMENT_QUESTIONS.md)
for snapshots, historical protection, migration gates and validation.
Global catalogue editing and category management remain separate follow-up work.

Domains and criteria are currently seeded once and read-only at runtime. Add a Super Admin UI to:
- Edit criterion names, baseline descriptions, and excellence descriptions
- Add or disable criteria without re-seeding
- Reorder categories within a domain

Requires new DB schema changes and API endpoints.

---

### #011 — Notification system
**Priority: Low**

No notifications exist. Add:
- Email notification to assigned users when an assessment is activated
- Email reminder when an assessment due date approaches
- In-app notification bell with unread count

Consider using Clerk's email delivery or a transactional email provider (Resend, SendGrid).

---

## Theme 3: Auth and Security

### #012 — Super Admin promotion UI
**Priority: Medium**

Currently, promoting a user to `super_admin` requires a direct database update. Add a Super Admin UI to change any user's role (with a confirmation step). Include appropriate audit logging.

---

### #013 — Audit log
**Priority: Medium**

No audit trail exists. Add an `audit_log` table and record:
- Assessment status changes (who activated / completed)
- Score submissions (who scored what and when)
- User role changes
- Invitation creation and acceptance

Expose a read-only audit log page for Super Admins.

---

### #014 — Session timeout and token refresh handling
**Priority: Medium**

Clerk tokens expire. Add:
- Graceful handling of 401 responses in the React Query client (currently configured with retry disabled for 401, but no UX feedback)
- Toast or redirect-to-sign-in when the session expires mid-session
- Test with short Clerk session lifetimes

---

### #015 — Automate staging demo Clerk user reconciliation
**Priority: Medium**

The staging demo endpoint now uses DB-backed seeded demo records, but operators still need to create or map the matching users in the staging Clerk dashboard. Add a safer reconciliation workflow:
- Detect seeded demo records whose `clerk_user_id` does not match an existing staging Clerk user
- Create or update staging Clerk users only in non-production environments
- Refuse production environments and production-like Clerk keys
- Keep the one-click demo endpoint disabled in production

This would reduce manual staging setup while preserving the production demo-auth lockout.

---

## Theme 4: UX and Design

### #016 — Mobile-responsive layout
**Priority: Medium**

The app is primarily desktop-optimised. Review and improve:
- Sidebar collapses to a hamburger menu on small screens
- Radar charts are usable on mobile (minimum touch target sizes)
- Assessment scoring page is usable on a tablet

---

### #017 — Onboarding flow for new companies
**Priority: Medium**

New companies have no guided setup after accepting their invitation. Add:
- A welcome wizard for first-time Company Admins (create profile, invite users, create first assessment)
- Progress indicator showing setup completeness

---

### #018 — Score history and comparison per criterion
**Priority: Low**

Currently radar charts show domain-level averages. Add drill-down to:
- View criterion-level score history across cycles
- Show which criteria improved or regressed between two cycles
- Highlight criteria below a threshold for targeted action planning

---

### #019 — Accessibility audit and remediation
**Priority: Low**

No accessibility audit has been done. Run Axe or Lighthouse against key pages and remediate:
- ARIA labels on icon-only buttons
- Keyboard navigation through assessment criteria
- Colour contrast on score band colours (especially yellow/orange on light backgrounds)
- Focus management in dialogs

---

## Theme 5: Operations

### #020 — Database migration history
**Priority: Medium**

Initial migration discipline is in place: schema changes should use `drizzle-kit generate` + `drizzle-kit migrate`, with `push:dev` reserved for disposable local databases. Remaining work:
- Every schema change is tracked as a timestamped SQL migration file
- Migrations can be run idempotently in CI and production deployments
- Rollback is possible by reverting a migration file
- Establish and apply a verified baseline migration for existing environments that predate migration history

---

### #021 — Health check and monitoring
**Priority: Medium**

`GET /api/healthz` exists but only returns a static response. Improve it to:
- Check database connectivity
- Return version and commit SHA
- Add structured logging of slow queries (>500ms)
- Integrate with an uptime monitoring service

---

### #022 — Environment-specific configuration validation on startup
**Priority: Low**

The API server throws if `PORT` or `DATABASE_URL` are missing, but does not validate other required variables. Add a startup validation step that:
- Checks all required env vars are present and non-empty
- Logs a clear error message listing missing variables
- Exits with a non-zero code before accepting any traffic

---

### #023 — Seed script idempotency improvements
**Priority: Low**

`seed-demo-users` skips existing Clerk users but does not handle the case where the Clerk user exists but the DB record does not (or vice versa). Add reconciliation logic and a `--reset` flag that cleanly wipes and re-creates demo data.
