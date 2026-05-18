# MICM Pilot Onboarding Guide

Use this guide to prepare the live MICM platform for pilot onboarding at `https://app.micm-mm.com`. It is for production operators and pilot support staff. Do not paste credentials, Clerk secrets, database URLs, exported production data, or personal data into this file or related issue comments.

## Production Super Admin Setup Guide

Super Admin setup must use the production Clerk application and the live MICM database only. Do not use staging demo users or development auth.

1. Confirm production deployment health:
   - [ ] `https://app.micm-mm.com/api/healthz` returns `200 OK`.
   - [ ] Health response reports database status `ok`.
   - [ ] Demo/development login panel is not visible on the sign-in page.
   - [ ] `POST /api/demo/sign-in-token` returns 404 in production.
2. Create or identify the first Super Admin user in production Clerk:
   - [ ] Use a real pilot operator email approved for production access.
   - [ ] Require the user to complete Clerk verification before using MICM.
   - [ ] Do not record passwords or temporary verification links in repository docs.
3. Map the Super Admin in MICM:
   - [ ] Confirm a `users` row exists for the Clerk user after first sign-in, or create it through the approved production data operation.
   - [ ] Set role to `super_admin`.
   - [ ] Leave company scope empty unless a future workflow explicitly requires otherwise.
4. Verify Super Admin access:
   - [ ] Dashboard loads.
   - [ ] Companies and Users pages are visible.
   - [ ] Reports and Programme Intelligence are visible.
   - [ ] `GET /api/audit-logs` is available to the Super Admin.
   - [ ] Company Admin and Company User accounts cannot access Super Admin-only areas.

## Pilot Company Onboarding Guide

Create pilot companies one at a time and verify tenant boundaries before inviting wider pilot users.

1. Capture onboarding details outside the repository:
   - [ ] Company legal or pilot display name.
   - [ ] Primary Company Admin name and email.
   - [ ] Pilot Company User names and emails.
   - [ ] Sector, size band, and any pilot cohort metadata needed for Programme Intelligence.
   - [ ] Support contact and escalation owner.
2. Create the company:
   - [ ] Sign in as Super Admin.
   - [ ] Create the pilot company.
   - [ ] Confirm the company appears in Super Admin Dashboard, Reports, Analytics, and Programme views where expected.
3. Add the first Company Admin:
   - [ ] Invite or create the Company Admin through production Clerk and MICM user management.
   - [ ] Confirm role is `company_admin`.
   - [ ] Confirm `companyId` is the pilot company only.
   - [ ] Confirm the Company Admin cannot see another pilot company.
4. Add Company Users:
   - [ ] Invite users through the approved production onboarding path.
   - [ ] Confirm role is `company_user`.
   - [ ] Confirm each user is scoped to the correct company.
   - [ ] Assign users only to their own company's assessments.
5. Create the pilot assessment cycle:
   - [ ] Create a draft assessment.
   - [ ] Assign intended Company Users.
   - [ ] Activate the assessment when users are ready.
   - [ ] Confirm unassigned Company Users cannot open it.

## Company Admin Quick-Start Guide

Company Admins manage their own company's assessment workflow and reporting. They must not see or manage other companies.

1. Sign in at `https://app.micm-mm.com`.
2. Confirm the Dashboard shows only your company.
3. Create or open the active assessment cycle.
4. Assign Company Users from your company only.
5. Monitor assessment completion.
6. Review incomplete domains/categories before marking an assessment complete.
7. Add evidence notes where useful for review context.
8. Set targets for priority domains.
9. Review Reports and Analytics.
10. Export CSV, PDF, and Excel reports when required for pilot review.
11. Escalate immediately if any other company's data appears.

## Company User Quick-Start Guide

Company Users complete assigned assessments and can add lightweight evidence notes where permitted.

1. Sign in at `https://app.micm-mm.com`.
2. Open your assigned active assessment.
3. Score each criterion using the 0-4 maturity scale.
4. Save progress as needed.
5. Add evidence notes or improvement notes where they clarify a score.
6. Complete all required domains/categories before final submission.
7. Submit when all required scores are complete.
8. Confirm you cannot see unassigned assessments, company management, export controls, or Programme Intelligence.
9. Contact support if an expected assigned assessment is missing.

## Browser Smoke-Test Checklist

Run these checks in a normal browser and, where useful, a private browsing session. Use approved pilot test accounts only.

### Login

- [ ] Production sign-in page loads at `https://app.micm-mm.com`.
- [ ] Demo/development mode is not visible.
- [ ] Super Admin can sign in and sign out.
- [ ] Company Admin can sign in and sign out.
- [ ] Company User can sign in and sign out.
- [ ] Protected routes redirect unauthenticated users to sign-in.

### Dashboard

- [ ] Super Admin Dashboard loads and shows intended cross-company visibility.
- [ ] Company Admin Dashboard loads and shows only their company.
- [ ] Company User Dashboard loads without admin-only navigation.
- [ ] No empty or error states appear for approved pilot data unless expected.

### Assessments

- [ ] Company Admin can create or open an own-company assessment.
- [ ] Company Admin can assign own-company users.
- [ ] Assigned Company User can open the assessment.
- [ ] Scoring uses the 0-4 maturity scale.
- [ ] Partial completion is blocked from final completion.
- [ ] Completed assessment results load.

### Evidence Notes

- [ ] Permitted users can view criterion evidence notes.
- [ ] Permitted users can add an evidence note.
- [ ] Notes are linked to the selected criterion.
- [ ] Unassigned Company Users cannot view or create notes for unassigned assessments.
- [ ] Cross-company note access is blocked.

### Targets

- [ ] Company Admin can view current-vs-target guidance.
- [ ] Company Admin can update own-company targets.
- [ ] Target dates and focus/priority labels are understandable.
- [ ] Company Admin cannot update another company's targets.
- [ ] Super Admin retains intended cross-company visibility.

### Reports

- [ ] Reports page loads for Super Admin.
- [ ] Reports page loads for Company Admin.
- [ ] Company User does not see report export controls.
- [ ] Board-ready, operational detail, and executive summary templates are selectable where expected.
- [ ] Report content reflects the selected company and assessment data.

### CSV / PDF / Excel Exports

- [ ] CSV export downloads for permitted admin roles.
- [ ] PDF export downloads for permitted admin roles.
- [ ] Excel export downloads for permitted admin roles.
- [ ] Excel workbook includes Summary, Domain Scores, and Actions sheets.
- [ ] Company Admin cannot export another company's report.
- [ ] Company User cannot export reports unless the product explicitly grants that role in a later release.

### Programme Intelligence

- [ ] Programme Intelligence is visible to Super Admin.
- [ ] Company Admin cannot access Programme Intelligence UI.
- [ ] Company User cannot access Programme Intelligence UI.
- [ ] Sector, company size, and date filters behave as expected.
- [ ] Region and cohort placeholders remain disabled if no data exists.
- [ ] Companies needing support and systemic programme risks summaries are understandable.

### Tenant Isolation

- [ ] Company Admin A cannot see Company B users.
- [ ] Company Admin A cannot see Company B assessments.
- [ ] Company Admin A cannot see Company B evidence notes.
- [ ] Company Admin A cannot export Company B reports.
- [ ] Company User cannot see unassigned assessments.
- [ ] Direct URL/API attempts for another company are rejected or safely scoped.
- [ ] Super Admin retains intended cross-company access.

## Production Account Creation Checklist

Use this checklist for each production pilot account. Do not write passwords, one-time links, raw Clerk IDs, or secrets in this checklist.

| Check | Super Admin | Company Admin | Company User |
|---|---|---|---|
| Approved real user identified | [ ] | [ ] | [ ] |
| Production Clerk user created or invited | [ ] | [ ] | [ ] |
| User completed Clerk verification | [ ] | [ ] | [ ] |
| MICM user row exists | [ ] | [ ] | [ ] |
| Correct role assigned | [ ] | [ ] | [ ] |
| Correct company scope assigned | N/A | [ ] | [ ] |
| Assessment assignment verified | N/A | N/A | [ ] |
| User completed first sign-in | [ ] | [ ] | [ ] |
| Role-specific quick-start sent | [ ] | [ ] | [ ] |
| Support route shared | [ ] | [ ] | [ ] |

## Known Pilot Limitations

Set these expectations before pilot launch:

- PDF export styling is board-ready groundwork, but final visual design may still be improved later.
- Excel export is intentionally simple: Summary, Domain Scores, and Actions sheets.
- Evidence support is text-note based only. File uploads and external storage are out of scope.
- Programme Intelligence region and cohort filters may remain disabled when no safe data exists.
- Production account creation still depends on Clerk setup and approved operator steps.
- No automated email delivery, report scheduling, or background report delivery is included.
- Pilot support may need operator assistance for user-role corrections.
- Browser smoke testing is manual unless a later PR adds production-safe automated smoke tests.

## Support And Escalation Checklist

Define support ownership before onboarding users:

- [ ] Pilot support owner named.
- [ ] Technical escalation owner named.
- [ ] Data-protection escalation owner named.
- [ ] Support channel or inbox confirmed.
- [ ] Expected response window communicated to pilot users.
- [ ] Incident notes location agreed.
- [ ] Login and Clerk issues route to the support owner first.
- [ ] Assessment access or assignment issues route to Company Admin, then support owner.
- [ ] Export failures route to technical escalation.
- [ ] Suspected tenant-isolation failure is treated as urgent and escalated immediately.
- [ ] Production outage or health-check failure triggers the deployment rollback runbook.

## Go / No-Go Checklist

The pilot can proceed only when each item is complete or explicitly accepted by the go/no-go owner.

- [ ] Live URL loads over HTTPS.
- [ ] `/api/healthz` returns `200 OK` with database status `ok`.
- [ ] GitHub Actions deployment workflow is working.
- [ ] Production Clerk auth is active.
- [ ] Demo/development mode is hidden and demo auth routes return 404.
- [ ] First Super Admin account is verified.
- [ ] At least one pilot company is created.
- [ ] At least one Company Admin is verified and scoped correctly.
- [ ] At least one Company User is verified, scoped correctly, and assigned an assessment.
- [ ] Browser smoke-test checklist passes for the pilot roles.
- [ ] Tenant-isolation smoke checks pass with at least two companies or an approved test method.
- [ ] CSV, PDF, and Excel exports work for permitted admin roles.
- [ ] Support and escalation owners are named.
- [ ] Known limitations are shared with pilot stakeholders.
- [ ] Backup/restore and rollback responsibilities are understood.
- [ ] Go/no-go owner records the decision.

No-go triggers:

- Demo auth is reachable in production.
- Production health check fails.
- Tenant-isolation smoke checks fail.
- Company Admin or Company User can access another company's data.
- Required pilot accounts cannot sign in.
- Assessments cannot be assigned, scored, and completed.
- All report export formats fail.
- No support owner is available during pilot launch.
