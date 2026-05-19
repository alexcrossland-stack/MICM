# MICM Maturity Hub

A full-stack **Manufacturing Industry Capability Maturity (MICM)** assessment platform built for Elevator UK.

Companies run structured maturity assessments across six domains, view radar/spider chart results, track improvement actions, and compare progress across cycles and (for Super Admins) across companies.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Environment Variables](#environment-variables)
4. [First-Time Setup](#first-time-setup)
5. [Running the App](#running-the-app)
6. [Database](#database)
7. [Authentication](#authentication)
8. [Roles and Tenancy](#roles-and-tenancy)
9. [Scoring Model](#scoring-model)
10. [Demo Mode](#demo-mode)
11. [Reporting and Export](#reporting-and-export)
12. [Project Structure](#project-structure)
13. [Development Workflow](#development-workflow)
14. [Production Deployment](#production-deployment)

---

## Architecture

| Layer | Technology |
|---|---|
| Monorepo tooling | pnpm workspaces, Node.js 24, TypeScript 5.9 |
| API server | Express 5, `@clerk/express` auth middleware |
| Database | PostgreSQL 16, Drizzle ORM, generated SQL migrations |
| Validation | Zod v4, `drizzle-zod` |
| API contract | OpenAPI 3.1 spec → Orval codegen (React Query hooks + Zod schemas) |
| Frontend | React 19, Vite 7, Tailwind v4, Wouter routing, Recharts |
| Auth | Clerk (Replit-managed in Replit env; external Clerk otherwise) |
| Build | esbuild (CJS bundle for API), Vite (static assets for frontend) |

The platform uses a **contract-first API** approach:

```
lib/api-spec/openapi.yaml  ← source of truth
        ↓  (pnpm --filter @workspace/api-spec run codegen)
lib/api-client-react/src/generated/   ← React Query hooks (do not edit)
lib/api-zod/src/generated/api.ts      ← Zod schemas  (do not edit)
```

The reverse proxy routes traffic by path:

- `/api/*` → API server (port 8080)
- `/*` → React frontend (port 18666 in dev, static in production)

---

## Prerequisites

- **Node.js 24+** and **pnpm 9+** (`npm install -g pnpm`)
- **PostgreSQL 16** accessible via a connection string
- A **Clerk application** (see [Authentication](#authentication))

> **Replit users:** Node, pnpm, and PostgreSQL are provisioned automatically. Skip to [First-Time Setup](#first-time-setup).

> **macOS / Windows developers:** `pnpm-workspace.yaml` contains Linux-only esbuild platform overrides designed for the Replit container. Before running `pnpm install` locally, comment out or remove the `overrides` block in `pnpm-workspace.yaml`, or use a Linux environment / Docker.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in real values. See that file for field-by-field documentation.

Required variables:

| Variable | Where used | Notes |
|---|---|---|
| `DATABASE_URL` | API server, DB scripts | PostgreSQL connection string |
| `CLERK_SECRET_KEY` | API server, seed scripts | Backend Clerk key (`sk_test_…` / `sk_live_…`) |
| `CLERK_PUBLISHABLE_KEY` | API server | Used to resolve the Clerk proxy host |
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend (Vite) | Must match `CLERK_PUBLISHABLE_KEY` |
| `VITE_CLERK_PROXY_URL` | Frontend (Vite) | Empty in dev; set automatically in Replit production |
| `CORS_ALLOWED_ORIGINS` | API server | Comma-separated production browser origins allowed for credentialed API requests; defaults to `https://app.micm-mm.com` |
| `PORT` | API server, Vite dev server | Set by Replit workflows; set manually for local dev |
| `BASE_PATH` | Vite dev server | `/` for root-mounted deployments |
| `NODE_ENV` | API server | Must be `production` in live environments |

Optional development-only demo variables:

| Variable | Where used | Notes |
|---|---|---|
| `ENABLE_DEMO_AUTH` | API server | Set to `true` only for local/demo environments that need one-click demo sign-in |
| `VITE_ENABLE_DEMO_AUTH` | Frontend (Vite) | Set to `true` only when the demo panel should be visible in non-production builds |

`SESSION_SECRET` is reserved for future Express session middleware and not currently consumed by application code.

**Never commit `.env` or any file containing real keys.** `.gitignore` already excludes `.local/` (Replit skills) but you should verify `.env` is also excluded if you add it.

---

## First-Time Setup

```bash
# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, Clerk keys, etc.

# 3. Apply committed database migrations (creates all tables)
pnpm --filter @workspace/db run migrate

# 4. Seed the six MICM domains (idempotent — safe to re-run)
pnpm --filter @workspace/scripts run seed-domains

# 5. (Optional) Seed demo users and sample data
#    Requires CLERK_SECRET_KEY to be set and pointing at a Clerk dev tenant
pnpm --filter @workspace/scripts run seed-demo-users

# 6. (Optional) Seed a richer fake staging/demo dataset
#    Requires an explicit non-production guard flag
ENABLE_STAGING_DEMO_SEED=true pnpm --filter @workspace/scripts run seed-staging-demo-data
```

---

## Running the App

Replit manages two persistent workflows:

| Service | Command | Port |
|---|---|---|
| API server | `pnpm --filter @workspace/api-server run dev` | 8080 |
| Frontend | `pnpm --filter @workspace/micm-platform run dev` | 18666 |

For local development, run both commands in separate terminal sessions and ensure both `PORT` and `BASE_PATH` are set in your environment.

---

## Database

### Schema

Drizzle ORM schema lives in `lib/db/src/schema/`. Tables:

| Table | Purpose |
|---|---|
| `companies` | Tenant organisations |
| `users` | Platform users linked to Clerk accounts |
| `invitations` | Shareable onboarding tokens |
| `domains` | Six MICM domains (seeded, read-only at runtime) |
| `categories` | Sub-groups within each domain |
| `criteria` | Individual assessment criteria |
| `assessment_cycles` | Assessment runs scoped to a company |
| `assessment_assignees` | Which users are assigned to an assessment |
| `scores` | Per-criterion scores submitted by a user |
| `actions` | Improvement actions tracked against a company |

### Migrations

Schema changes are promoted with generated Drizzle migrations. The migration workflow is documented in `docs/DATABASE_MIGRATIONS.md`.

To generate a migration after editing `lib/db/src/schema/`:

```bash
pnpm --filter @workspace/db run generate
```

To apply committed migrations to a target database:

```bash
DATABASE_URL=<target_url> pnpm --filter @workspace/db run migrate
```

`push:dev` exists only for disposable local development databases while prototyping. Do not use schema push for staging or production.

### Seeding

| Script | What it does | Idempotent? |
|---|---|---|
| `seed-domains` | Creates the 6 MICM domains, categories, and criteria | Yes |
| `seed-demo-users` | Creates 3 Clerk dev users + DB records + sample company/assessment/scores | Yes (skips existing) |
| `seed-staging-demo-data` | Creates fake DB-only staging/demo data across multiple companies, canonical demo account records, users, assessments, actions, targets, and evidence notes | Yes (replaces prior `MICM STAGING DEMO - ...` records) |

Domain data is read-only at runtime — no UI exists to edit it. Re-run `seed-domains` if domain data is missing or after a schema wipe.

`seed-staging-demo-data` is for non-production validation only. It requires `ENABLE_STAGING_DEMO_SEED=true`, refuses to run when `NODE_ENV=production`, and refuses `DATABASE_URL` values containing `prod`, `production`, or `live`. It does not create Clerk users, passwords, secrets, or production identifiers. Run `seed-domains` first, then:

```bash
ENABLE_STAGING_DEMO_SEED=true DATABASE_URL=<non_production_url> pnpm --filter @workspace/scripts run seed-staging-demo-data
```

Canonical fake staging demo account records are seeded as `superadmin.demo@micm.local`, `companyadmin.demo@micm.local`, and `companyuser.demo@micm.local`.

See `docs/STAGING_DEMO_DATA.md` for the full dataset shape and guardrails.

---

## Authentication

The platform uses **Clerk** for authentication. There are two operating contexts:

### Replit (managed Clerk)

Replit provisions and rotates Clerk keys automatically via the Auth pane. Development and production are completely separate Clerk tenants with separate user stores. No manual key management is required.

- Development keys start with `pk_test_` / `sk_test_`
- Production keys start with `pk_live_` / `sk_live_`
- The "Clerk has been loaded with development keys" console warning is expected in dev — do not try to suppress it
- Production must use the production Clerk tenant and must not enable demo auth flags

### External / GitHub Codex development

Create a Clerk application at [dashboard.clerk.com](https://dashboard.clerk.com), then:

1. Set `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and `VITE_CLERK_PUBLISHABLE_KEY` in your `.env`
2. Enable **Email/Password** sign-in in the Clerk dashboard
3. Enable **Google OAuth** if needed (requires Google OAuth credentials)
4. Run `seed-demo-users` to create the three demo accounts in your Clerk tenant

### Production Clerk setup

Production deployments should use live Clerk keys from a production Clerk application:

1. Set `NODE_ENV=production`
2. Set `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` to matching `sk_live_…` / `pk_live_…` values
3. Set `VITE_CLERK_PUBLISHABLE_KEY` to the same publishable key
4. Keep `ENABLE_DEMO_AUTH` and `VITE_ENABLE_DEMO_AUTH` unset or `false`
5. Configure allowed production domains and OAuth redirect URLs in Clerk

### Clerk proxy

The API server proxies Clerk's CDN at `/api/__clerk` so that production deployments served from a single domain avoid cross-origin issues. In development this proxy is active but Clerk JS loads from the CDN directly (fine for dev).

### Sign-in flow

- Unauthenticated requests to protected routes redirect to `/sign-in`
- After sign-in Clerk calls the `/api/auth/me` endpoint which upserts the user record in the DB
- The user's `role` and `companyId` are stored in the `users` table (not in the Clerk JWT)

---

## Roles and Tenancy

| Role | Value in DB | Capabilities |
|---|---|---|
| Super Admin | `super_admin` | Full platform access: all companies, all assessments, cross-company radar, user management |
| Company Admin | `company_admin` | Manage own company's assessments, assign users, view own company reports |
| Company User | `company_user` | Take assigned assessments, view own company data |

**Tenant isolation** is enforced at the API layer — Company Admins and Company Users can only access records where `company_id` matches their own. Super Admins can query any company.

A user's role is set in the `users` table. To promote a user to Super Admin, update `role` directly in the database — there is no UI for this action by design.

---

## Scoring Model

Assessments score each criterion on a **0 to 4 scale**:

| Score | Meaning |
|---|---|
| **0** | Traditional Baseline criteria followed |
| **1** | At least 25% of processes in place / operational areas covered |
| **2** | At least 50% of processes in place / operational areas covered |
| **3** | At least 75% of processes in place / operational areas covered |
| **4** | Excellence criteria met for all areas |

Domain scores displayed in radar charts are the **arithmetic mean** of all criteria scores within that domain, averaged across all completing users in the assessment cycle.

Each criterion can optionally carry a `baselineDescription` (what score 0–1 looks like in practice) and an `excellenceDescription` (what score 3–4 looks like). These are seeded per-criterion and shown in the TakeAssessment UI.

Assessments cannot be marked `completed` until every assigned user has submitted a 0–4 score for every criterion. The assessment review page shows the remaining incomplete domains/categories before completion.

Criterion-level evidence notes are stored separately from score notes via `GET/POST /api/assessment-criterion-notes`. Notes are tenant-scoped to the assessment company, linked to the assessment, criterion, author, and timestamps, and are included in assessment results plus report composition context. File uploads and external evidence storage are not part of the current implementation.

---

## Demo Mode

The API exposes a `POST /api/demo/sign-in-token` endpoint that returns a short-lived Clerk sign-in token for one of three seeded staging demo accounts. The frontend can use this for one-click login on the sign-in page.

Demo auth is opt-in and must be enabled in both places:

- Backend: `ENABLE_DEMO_AUTH=true`
- Frontend: `VITE_ENABLE_DEMO_AUTH=true`

**This endpoint is disabled in production** — it returns HTTP 404 when `NODE_ENV === "production"`, even if `ENABLE_DEMO_AUTH=true` is set accidentally. The frontend only shows the demo panel when `VITE_ENABLE_DEMO_AUTH=true` and the backend confirms demo auth is enabled.

The demo endpoint looks up the seeded demo records by role and email, then uses each record's `clerk_user_id` to request a short-lived Clerk sign-in token. For staging, create matching users in the staging Clerk dashboard and map the generated Clerk user IDs to the seeded DB records.

Demo account records:

| Role | Email |
|---|---|
| Super Admin | `superadmin.demo@micm.local` |
| Company Admin | `companyadmin.demo@micm.local` |
| Company User | `companyuser.demo@micm.local` |

No demo passwords, Clerk tokens, or secrets are stored in the repository. See `docs/STAGING_DEMO_LOGIN.md` for the staging Clerk mapping steps.

---

## Reporting and Export

- **Radar chart**: per-assessment domain averages, rendered with Recharts `RadarChart`
- **Multi-assessment overlay**: up to 4 assessments overlaid on a single radar (Company Dashboard and Reports page)
- **Cross-company radar**: Super Admin only — compare up to 4 companies' latest scores on a single radar (Dashboard and Reports page)
- **Progress over time**: line chart showing domain score trends across cycles
- **Action summary**: open/in-progress/completed action counts per domain

**Export**: company report export is available from the Reports page and `GET /api/reports/company/{id}/export`. Supported query options are `format=csv|pdf|xlsx` and `template=board_ready|operational_detail|executive_summary`. Exports are composed server-side before rendering, so CSV/PDF/Excel share the same report sections. PDF output is currently groundwork only; final PDF visual design remains a backlog item (`docs/BACKLOG.md`).

---

## Project Structure

```
.
├── artifacts/
│   ├── api-server/          # Express API — routes, middleware, build config
│   └── micm-platform/       # React + Vite frontend
├── lib/
│   ├── api-spec/            # OpenAPI 3.1 spec (source of truth)
│   ├── api-client-react/    # Generated React Query hooks (do not edit)
│   ├── api-zod/             # Generated Zod schemas (do not edit)
│   └── db/                  # Drizzle schema, migrations, DB client, drizzle.config.ts
├── scripts/                 # One-off utility scripts (seed-domains, seed-demo-users, seed-staging-demo-data)
├── docs/                    # Contributor guides and backlog
│   ├── PRODUCTION_DEPLOYMENT.md # Production deployment and smoke-test runbook
│   ├── PRODUCTION_READINESS.md # Launch readiness gap tracker
│   ├── MONITORING_LOGGING.md # Monitoring, alerting, and incident review runbook
│   ├── BACKUP_RESTORE_REHEARSAL.md # Non-production backup/restore rehearsal checklist
│   ├── PILOT_ACCEPTANCE_CHECKLIST.md # Pilot workflow acceptance and signoff template
│   ├── STAGING_DEMO_LOGIN.md # Staging demo account login setup
│   └── DATABASE_MIGRATIONS.md # Migration workflow and review checklist
├── .env.example             # Environment variable reference
├── AGENTS.md                # Instructions for AI coding agents (Codex, Claude, etc.)
├── pnpm-workspace.yaml      # Workspace package discovery, catalog versions
├── tsconfig.base.json       # Shared TypeScript strict defaults
└── tsconfig.json            # Root solution file (composite libs only)
```

---

## Development Workflow

### Making API changes

1. Edit `lib/api-spec/openapi.yaml` first
2. Run codegen: `pnpm --filter @workspace/api-spec run codegen`
3. Verify `lib/api-zod/src/index.ts` contains only `export * from "./generated/api";`
4. Implement the route handler in `artifacts/api-server/src/routes/`
5. Use the generated Zod schema for request validation and response shaping

### Making schema changes

1. Edit the relevant file in `lib/db/src/schema/`
2. Run `pnpm --filter @workspace/db run generate`
3. Review and commit the generated files in `lib/db/migrations/`
4. Apply locally with `DATABASE_URL=<local_dev_url> pnpm --filter @workspace/db run migrate`
5. Run `pnpm run typecheck` to verify the change compiles cleanly

### Typechecking

```bash
# Full typecheck across all packages (canonical check)
pnpm run typecheck

# Frontend only
pnpm --filter @workspace/micm-platform run typecheck

# API server only
pnpm --filter @workspace/api-server run typecheck
```

### Code generation

```bash
# Regenerate React Query hooks + Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

---

## Production Deployment

For the full deployment runbook, required environment variables, production migration process, Clerk setup, post-deploy smoke checklist, rollback checklist, and staging-to-production promotion checklist, see `docs/PRODUCTION_DEPLOYMENT.md`. For launch readiness tracking across security, data protection, hosting, monitoring, backup/restore, pilot acceptance, onboarding, support, and go/no-go criteria, see `docs/PRODUCTION_READINESS.md`.

On Replit, click **Deploy** in the UI. The platform builds both artifacts and serves them via the shared proxy.

Production-specific behaviour:
- `NODE_ENV=production` disables the demo sign-in endpoint and Replit-specific Vite plugins
- Demo auth flags must remain unset or `false`; production builds hide the demo sign-in UI regardless
- `VITE_CLERK_PROXY_URL` is set automatically so Clerk JS is proxied through the app domain
- The API server binary is run directly (`node --enable-source-maps artifacts/api-server/dist/index.mjs`) without pnpm for faster startup
- The frontend is served as static files from `artifacts/micm-platform/dist/public`

For non-Replit production deployments you will need to:
1. Set all environment variables listed in `.env.example`
2. Run `pnpm install --frozen-lockfile`
3. Build the API: `pnpm --filter @workspace/api-server run build`
4. Build the frontend: `pnpm --filter @workspace/micm-platform run build`
5. Serve the API on `PORT=8080` and the frontend statically, routing `/*` → `index.html`
