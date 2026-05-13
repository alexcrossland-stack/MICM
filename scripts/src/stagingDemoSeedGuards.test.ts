import { describe, expect, it } from "vitest";
import {
  assertStagingDemoSeedAllowed,
  STAGING_DEMO_SEED_FLAG,
} from "./stagingDemoSeedGuards";

describe("staging demo seed guardrails", () => {
  it("requires the explicit staging demo seed flag", () => {
    expect(() =>
      assertStagingDemoSeedAllowed({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://localhost:5432/micm_demo",
      }),
    ).toThrow(STAGING_DEMO_SEED_FLAG);
  });

  it("refuses to run in production", () => {
    expect(() =>
      assertStagingDemoSeedAllowed({
        NODE_ENV: "production",
        [STAGING_DEMO_SEED_FLAG]: "true",
        DATABASE_URL: "postgresql://localhost:5432/micm_demo",
      }),
    ).toThrow("NODE_ENV=production");
  });

  it("refuses production-like database URLs", () => {
    expect(() =>
      assertStagingDemoSeedAllowed({
        NODE_ENV: "staging",
        [STAGING_DEMO_SEED_FLAG]: "true",
        DATABASE_URL: "postgresql://localhost:5432/micm_production",
      }),
    ).toThrow("DATABASE_URL");
  });

  it("allows explicitly flagged non-production database URLs", () => {
    expect(() =>
      assertStagingDemoSeedAllowed({
        NODE_ENV: "staging",
        [STAGING_DEMO_SEED_FLAG]: "true",
        DATABASE_URL: "postgresql://localhost:5432/micm_demo_dataset",
      }),
    ).not.toThrow();
  });
});
