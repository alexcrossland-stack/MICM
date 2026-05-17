# GitHub-Managed VPS Deployment

This runbook covers deploying MICM to the existing virtual server from GitHub Actions. It does not replace the production deployment runbook in `docs/PRODUCTION_DEPLOYMENT.md`; it documents the VPS-specific automation.

## Deployment Scope

- Deploys from `main` only.
- Connects to the VPS over SSH using GitHub Actions secrets.
- Pulls the latest `main` branch in the existing server checkout.
- Installs dependencies with the lockfile.
- Applies committed Drizzle migrations with `pnpm --filter @workspace/db run migrate`.
- Builds the workspace.
- Restarts the existing PM2 apps: `micm-api` and `micm-web`.
- Runs the API health check at `http://localhost:3000/api/healthz`.

Never use `pnpm --filter @workspace/db run push:dev` for this VPS. `push:dev` is only for disposable local databases.

## Required GitHub Secrets

Configure these in GitHub under **Settings -> Secrets and variables -> Actions**:

| Secret | Purpose |
|---|---|
| `VPS_HOST` | VPS hostname or IP address |
| `VPS_USER` | SSH user, for example the server deploy user |
| `VPS_SSH_KEY` | Private SSH key allowed to connect to the VPS |
| `VPS_APP_PATH` | Existing server checkout path, for example `/opt/MICM` |

Do not store database URLs, Clerk keys, `.env` files, passwords, or production secrets in the repository. Runtime application secrets should remain on the VPS or in the chosen server secret-management mechanism.

## Deploy SSH Key Setup

Create a dedicated deploy key from an operator machine:

```bash
ssh-keygen -t ed25519 -C "micm-github-actions-deploy" -f micm_github_actions_deploy
```

Install the public key on the VPS for the deploy user:

```bash
ssh-copy-id -i micm_github_actions_deploy.pub <deploy-user>@<vps-host>
```

Then add the private key contents from `micm_github_actions_deploy` to the `VPS_SSH_KEY` GitHub secret. Do not commit either key file.

Before enabling production deployment, verify the deploy user can run the required commands in the app path:

```bash
cd /opt/MICM
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run migrate
pnpm run build
pm2 restart micm-api micm-web --update-env
pm2 save
curl -f http://localhost:3000/api/healthz
```

## Running The Workflow

The workflow runs automatically after changes are merged to `main`. It can also be started manually from GitHub Actions, but the job is guarded so it only deploys when the workflow ref is `main`.

Deployment sequence:

1. Merge a validated PR to `main`.
2. Confirm the normal CI workflow is green.
3. Open the **Deploy VPS** workflow run.
4. Confirm the deploy job reaches the health-check step successfully.
5. Run the smoke-test checklist below against the public URL.

## Rollback Process

If deployment fails before PM2 restart, fix the failed step and rerun the workflow after confirming the database state.

If deployment succeeds but smoke tests fail:

1. Capture the failed commit SHA and workflow run URL.
2. SSH to the VPS.
3. Change to the app path.
4. Check out the last known-good commit.
5. Run `pnpm install --frozen-lockfile`.
6. Review whether any migrations were applied and whether the old app version is compatible with the current schema.
7. Run `pnpm run build`.
8. Run `pm2 restart micm-api micm-web --update-env`.
9. Run `pm2 save`.
10. Confirm `curl -f http://localhost:3000/api/healthz` passes.
11. Record the rollback in the deployment notes before attempting a new deployment.

Do not manually edit production data during rollback unless there is a reviewed database recovery plan.

## Smoke-Test Checklist

After each successful deploy, verify:

- [ ] `GET /api/healthz` returns healthy status through the public URL.
- [ ] PM2 shows `micm-api` and `micm-web` online.
- [ ] The sign-in page loads.
- [ ] Demo auth remains unavailable in production.
- [ ] Super Admin can load Dashboard, Reports, Analytics, and Programme Intelligence.
- [ ] Company Admin can load same-company Dashboard, Reports, Analytics, assessments, evidence notes, targets, and exports.
- [ ] Company User can load assigned assessments and permitted evidence notes.
- [ ] Company User cannot see export controls or Programme Intelligence.
- [ ] CSV, PDF, and Excel exports download for permitted admin roles.
- [ ] Assessment results and report pages render with seeded or approved test data.
- [ ] Cross-company direct access attempts are blocked for Company Admin and Company User roles.
- [ ] Clerk keys and allowed domains match the deployed staging or production environment.
