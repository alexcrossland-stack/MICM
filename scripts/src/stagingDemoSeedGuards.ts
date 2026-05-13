export const STAGING_DEMO_SEED_FLAG = "ENABLE_STAGING_DEMO_SEED";

const BLOCKED_DATABASE_TOKENS = ["prod", "production", "live"];

export function assertStagingDemoSeedAllowed(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to run staging demo seed while NODE_ENV=production.",
    );
  }

  if (env[STAGING_DEMO_SEED_FLAG] !== "true") {
    throw new Error(
      `Refusing to run staging demo seed unless ${STAGING_DEMO_SEED_FLAG}=true.`,
    );
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for staging demo seed.");
  }

  const normalizedUrl = databaseUrl.toLowerCase();
  const blockedToken = BLOCKED_DATABASE_TOKENS.find((token) =>
    normalizedUrl.includes(token),
  );
  if (blockedToken) {
    throw new Error(
      `Refusing to run staging demo seed against a DATABASE_URL containing "${blockedToken}".`,
    );
  }
}
