# MICM Assessment Platform

A full-stack Manufacturing Industry Capability Maturity (MICM) assessment platform for Elevator UK. Enables companies to run structured maturity assessments across six domains, view spider/radar chart results, track improvement actions, and compare progress over time.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/micm-platform run dev` — run the frontend (port 18666)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed-domains` — seed all 6 MICM domains with categories and criteria
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Clerk auth (`@clerk/express`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- Frontend: React + Vite + Tailwind v4 + Wouter routing + Recharts
- Auth: Replit-managed Clerk (dev keys: `pk_test_...`)
- Build: esbuild (CJS bundle for API)

## Where things live

- `lib/db/src/schema/` — Drizzle DB schema (companies, users, invitations, domains, criteria, assessment_cycles, scores, actions)
- `lib/api-spec/` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/src/generated/` — generated React Query hooks + Zod schemas (do not edit)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` — Clerk proxy at `/api/__clerk`
- `artifacts/micm-platform/src/` — React frontend (App.tsx, pages/, components/, hooks/)
- `scripts/src/seed-domains.ts` — seeds all 6 MICM domains

## Architecture decisions

- Contract-first API: OpenAPI spec drives both server Zod validation and client React Query hooks via Orval codegen
- Clerk auth proxy: `/api/__clerk` proxies to Clerk CDN so the same domain serves auth, avoiding CORS issues in production
- `routing="path"` for Clerk SignIn/SignUp: components only render when `window.location.pathname` matches their `path` prop — unauthenticated users are redirected to `/sign-in` first
- Query options use `as any` cast for `enabled` flag: TanStack Query v5 requires `queryKey` in `UseQueryOptions` but orval provides it internally; the cast avoids redundant boilerplate
- Six MICM domains seeded once via scripts; domain data is read-only at runtime

## Product

Three roles: **Super Admin** (full platform access), **Company Admin** (manage own company, assessments, users), **Company User** (take assigned assessments, view own company data).

Key features:
- Assessment cycles with assignee management and status workflow (draft → active → completed)
- Per-criterion scoring 0–4 with notes, across 6 domains and multiple categories
- Radar/spider chart visualisation per assessment and multi-cycle progress charts
- Action tracking with priority, status, due dates
- Invitation system with shareable onboarding links
- Reports page with aggregate scores, progress over time, and action summary

## User preferences

- SME-friendly UI with pastel professional palette
- Dark mode supported via ThemeProvider toggle in sidebar footer
- No emojis in UI unless explicitly requested

## Gotchas

- After `pnpm --filter @workspace/api-spec run codegen`, manually ensure `lib/api-zod/src/index.ts` contains only `export * from "./generated/api";` (codegen sometimes adds extra exports)
- Clerk `routing="path"` + Wouter: `path` prop must be the full browser path including `BASE`. Wouter's `<Redirect>` strips the base automatically.
- Do NOT run `pnpm dev` at workspace root — use workflow names instead
- `VITE_CLERK_PROXY_URL` is empty in dev (Clerk loads from CDN); set automatically in production

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `.local/skills/clerk-auth` for Clerk setup and customization guidance
