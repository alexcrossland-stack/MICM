import type { CorsOptions } from "cors";

type Environment = Record<string, string | undefined>;

const DEFAULT_PRODUCTION_ORIGINS = ["https://app.micm-mm.com"];

function parseAllowedOrigins(rawOrigins: string | undefined) {
  return (rawOrigins ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function getAllowedCorsOrigins(env: Environment = process.env) {
  const configuredOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  return new Set(configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_PRODUCTION_ORIGINS);
}

export function createCorsOptions(env: Environment = process.env): CorsOptions {
  const isProduction = env.NODE_ENV === "production";
  const allowedProductionOrigins = getAllowedCorsOrigins(env);

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (!isProduction) {
        callback(null, true);
        return;
      }

      callback(null, allowedProductionOrigins.has(origin));
    },
  };
}
