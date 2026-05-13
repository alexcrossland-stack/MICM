type Environment = Record<string, string | undefined>;

export type ServerEnvironment = {
  nodeEnv: string;
  port: number;
  isProduction: boolean;
  demoAuthEnabled: boolean;
};

const ALWAYS_REQUIRED = ["PORT", "DATABASE_URL"];
const PRODUCTION_REQUIRED = [
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
];

function isBlank(value: string | undefined) {
  return value == null || value.trim().length === 0;
}

function parsePort(rawPort: string | undefined) {
  if (isBlank(rawPort)) return null;
  const port = Number(rawPort);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

export function validateServerEnvironment(env: Environment = process.env): ServerEnvironment {
  const nodeEnv = env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const missing = [
    ...ALWAYS_REQUIRED.filter((key) => isBlank(env[key])),
    ...(isProduction ? PRODUCTION_REQUIRED.filter((key) => isBlank(env[key])) : []),
  ];
  const errors: string[] = [];

  if (missing.length > 0) {
    errors.push(`Missing required environment variables: ${missing.join(", ")}.`);
  }

  const port = parsePort(env.PORT);
  if (env.PORT && port == null) {
    errors.push("PORT must be an integer between 1 and 65535.");
  }

  if (isProduction && env.ENABLE_DEMO_AUTH === "true") {
    errors.push("ENABLE_DEMO_AUTH must not be true when NODE_ENV=production.");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid server environment configuration. ${errors.join(" ")}`);
  }

  return {
    nodeEnv,
    port: port as number,
    isProduction,
    demoAuthEnabled: !isProduction && env.ENABLE_DEMO_AUTH === "true",
  };
}
