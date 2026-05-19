import cors from "cors";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createCorsOptions, getAllowedCorsOrigins } from "./corsPolicy";

function makeTestApp(env: Record<string, string | undefined>) {
  const app = express();
  app.use(cors(createCorsOptions(env)));
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  return app;
}

describe("CORS policy", () => {
  it("allows the default production application origin", async () => {
    const app = makeTestApp({ NODE_ENV: "production" });

    const response = await request(app)
      .get("/healthz")
      .set("Origin", "https://app.micm-mm.com");

    expect(response.headers["access-control-allow-origin"]).toBe("https://app.micm-mm.com");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("allows configured additional production origins", () => {
    expect(getAllowedCorsOrigins({
      NODE_ENV: "production",
      CORS_ALLOWED_ORIGINS: "https://app.micm-mm.com, https://staging.micm-mm.com",
    })).toEqual(new Set(["https://app.micm-mm.com", "https://staging.micm-mm.com"]));
  });

  it("does not expose credentialed CORS headers to arbitrary production origins", async () => {
    const app = makeTestApp({ NODE_ENV: "production" });

    const response = await request(app)
      .get("/healthz")
      .set("Origin", "https://evil.example");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("keeps non-production CORS convenient for local tooling", async () => {
    const app = makeTestApp({ NODE_ENV: "development" });

    const response = await request(app)
      .get("/healthz")
      .set("Origin", "http://localhost:5173");

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });
});
