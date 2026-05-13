import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

const COMMIT_ENV_KEYS = [
  "GITHUB_SHA",
  "REPLIT_GIT_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "RENDER_GIT_COMMIT",
  "SOURCE_VERSION",
];

function getCommitMetadata() {
  const commit = COMMIT_ENV_KEYS
    .map((key) => process.env[key])
    .find((value) => value && /^[0-9a-f]{7,40}$/i.test(value));
  return commit ? commit.slice(0, 12) : null;
}

router.get("/healthz", async (req: any, res) => {
  let databaseStatus: "ok" | "degraded" = "ok";

  try {
    await pool.query("select 1");
  } catch (err) {
    databaseStatus = "degraded";
    req.log?.warn({ err }, "Health check database ping failed");
  }

  const data = HealthCheckResponse.parse({
    status: databaseStatus === "ok" ? "ok" : "degraded",
    checkedAt: new Date().toISOString(),
    version: process.env.npm_package_version ?? null,
    commit: getCommitMetadata(),
    database: {
      status: databaseStatus,
    },
  });

  res.status(databaseStatus === "ok" ? 200 : 503).json(data);
});

export default router;
