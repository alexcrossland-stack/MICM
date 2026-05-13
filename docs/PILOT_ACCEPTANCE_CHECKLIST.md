# Pilot Acceptance Checklist

Use this template to record whether a MICM pilot is accepted for wider rollout. Complete it in staging first, then repeat for production pilot validation using approved pilot accounts.

## Pilot Record

| Field | Value |
|---|---|
| Pilot name | |
| Environment | |
| Application commit | |
| Pilot start date | |
| Pilot end date | |
| Acceptance owner | |
| Support owner | |
| Go/no-go owner | |
| Decision date | |

Do not paste credentials, production data exports, or personal data into this checklist.

## Participating Companies And Users

| Company | Sector/size | Company Admin users | Company User participants | Notes |
|---|---|---|---|---|
| | | | | |

Required coverage:

- [ ] At least one Super Admin participant is named.
- [ ] At least one Company Admin participant is named.
- [ ] At least one Company User participant is named.
- [ ] At least two companies are available for tenant-isolation checks.

## Required Workflow Acceptance

### Authentication And Roles

- [ ] Super Admin can sign in and access Super Admin navigation.
- [ ] Company Admin can sign in and access own-company management workflows.
- [ ] Company User can sign in and access assigned workflows only.
- [ ] Sign-out works and protected routes require authentication.
- [ ] Demo sign-in is not visible or reachable in production pilot validation.

### Tenant Isolation

- [ ] Company Admin A cannot view Company B users.
- [ ] Company Admin A cannot view Company B assessments.
- [ ] Company Admin A cannot export Company B reports.
- [ ] Company User cannot view unassigned assessments.
- [ ] Direct API attempts with another company ID are rejected or safely scoped.
- [ ] Super Admin retains intended cross-company visibility.

### Assessment Completion

- [ ] Company Admin can create an assessment.
- [ ] Company Admin can assign own-company users.
- [ ] Assigned Company User can complete scoring on the 0-4 maturity scale.
- [ ] Partial completion is blocked from final completion.
- [ ] Missing domain/category guidance is understandable.
- [ ] Fully scored assessments can be marked completed.

### Evidence Notes

- [ ] Permitted users can add criterion-level evidence notes.
- [ ] Existing notes are visible during assessment review.
- [ ] Evidence note counts or previews appear in report context where intended.
- [ ] Unassigned Company Users cannot view or create notes.
- [ ] Cross-company note access is blocked.

### Targets

- [ ] Company Admin can view current-vs-target guidance.
- [ ] Company Admin can update own-company targets.
- [ ] Target dates and priority/focus labels are understandable.
- [ ] Company Admin cannot update another company's targets.
- [ ] Super Admin cross-company capability remains intact.

### Reports And Exports

- [ ] Reports page loads for permitted roles.
- [ ] Company Users do not see export controls.
- [ ] Board-ready, operational detail, and executive summary templates are selectable where expected.
- [ ] CSV export downloads and opens.
- [ ] PDF export downloads and opens.
- [ ] Excel export downloads and contains Summary, Domain Scores, and Actions sheets.
- [ ] Report exports are tenant-scoped.

### Analytics

- [ ] Analytics page loads for permitted users.
- [ ] Current-vs-target and gap-to-target messaging is understandable.
- [ ] Radar overlays render for valid assessment/company selections.
- [ ] Company-scoped analytics do not leak cross-company data.

### Programme Intelligence

- [ ] Programme Intelligence is visible to Super Admin.
- [ ] Company Admins and Company Users cannot access Programme Intelligence UI or API data.
- [ ] Sector, company size, and date filters behave as expected.
- [ ] Region and cohort placeholders are clearly disabled when no data exists.
- [ ] Companies needing support and systemic programme risks summaries are understandable.

### Support Process

- [ ] Pilot users know how to request support.
- [ ] Support owner can triage login issues.
- [ ] Support owner can triage assessment access issues.
- [ ] Support owner can triage export download issues.
- [ ] Suspected tenant-isolation or data-protection issues have an escalation path.
- [ ] Known limitations are documented for pilot users.

## Acceptance Criteria

| Criterion | Required result | Actual result | Status |
|---|---|---|---|
| Login and role access | All pilot roles can sign in and see correct navigation | | |
| Tenant isolation | No cross-company leaks found | | |
| Assessment workflow | Assessment can be assigned, scored, and completed | | |
| Evidence notes | Notes can be created and remain tenant-scoped | | |
| Targets | Own-company target setting works | | |
| Exports | CSV, PDF, and Excel exports work for permitted roles | | |
| Analytics | Company analytics render and remain scoped | | |
| Programme Intelligence | Super Admin-only access confirmed | | |
| Support process | Pilot users know support path | | |

Status values:

- `Pass`
- `Pass with accepted risk`
- `Fail`
- `Not tested`

## Go / No-Go Signoff

Pilot is accepted only when all required workflow criteria are `Pass` or explicitly `Pass with accepted risk`.

| Decision | Owner | Date | Notes |
|---|---|---|---|
| Go / no-go | | | |

No-go triggers:

- Role or tenant-isolation failure.
- Assessment completion failure for assigned users.
- Report export failure across all formats.
- Demo auth reachable in production pilot validation.
- No support owner available.
- Unresolved data-protection concern.

## Follow-Up Actions

| Action | Owner | Due date | Required before full launch? | Status |
|---|---|---|---|---|
| | | | | |
