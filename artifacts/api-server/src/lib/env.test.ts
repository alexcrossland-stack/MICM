import { describe, expect, it } from "vitest";
import { validateServerEnvironment } from "./env";

describe("server environment validation", () => {
  it("accepts minimal development configuration without demo auth", () => {
    expect(validateServerEnvironment({
      NODE_ENV: "development",
      PORT: "8080",
      DATABASE_URL: "postgresql://localhost:5432/micm_dev",
    })).toMatchObject({
      nodeEnv: "development",
      port: 8080,
      isProduction: false,
      demoAuthEnabled: false,
    });
  });

  it("accepts demo auth only outside production", () => {
    expect(validateServerEnvironment({
      NODE_ENV: "development",
      PORT: "8080",
      DATABASE_URL: "postgresql://localhost:5432/micm_dev",
      ENABLE_DEMO_AUTH: "true",
    }).demoAuthEnabled).toBe(true);
  });

  it("requires Clerk keys in production", () => {
    expect(() => validateServerEnvironment({
      NODE_ENV: "production",
      PORT: "8080",
      DATABASE_URL: "postgresql://localhost:5432/micm_prod",
    })).toThrow("CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY");
  });

  it("rejects demo auth in production even when required production variables exist", () => {
    expect(() => validateServerEnvironment({
      NODE_ENV: "production",
      PORT: "8080",
      DATABASE_URL: "postgresql://localhost:5432/micm_prod",
      CLERK_SECRET_KEY: "configured",
      CLERK_PUBLISHABLE_KEY: "configured",
      ENABLE_DEMO_AUTH: "true",
    })).toThrow("ENABLE_DEMO_AUTH must not be true");
  });

  it("reports missing required variables and invalid ports without echoing values", () => {
    expect(() => validateServerEnvironment({
      NODE_ENV: "development",
      PORT: "not-a-port",
    })).toThrow("Missing required environment variables: DATABASE_URL");
    expect(() => validateServerEnvironment({
      NODE_ENV: "development",
      PORT: "not-a-port",
    })).toThrow("PORT must be an integer");
  });
});
