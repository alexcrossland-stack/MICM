import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { securityHeaders } from "./securityHeaders";

const originalNodeEnv = process.env.NODE_ENV;

function makeTestApp(nodeEnv: string) {
  process.env.NODE_ENV = nodeEnv;
  const app = express();
  app.use(securityHeaders());
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  return app;
}

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("security headers", () => {
  it("sets baseline browser hardening headers", async () => {
    const response = await request(makeTestApp("development")).get("/healthz");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["permissions-policy"]).toBe(
      "camera=(), microphone=(), geolocation=(), payment=()",
    );
  });

  it("sets HSTS only in production", async () => {
    const productionResponse = await request(makeTestApp("production")).get("/healthz");
    const developmentResponse = await request(makeTestApp("development")).get("/healthz");

    expect(productionResponse.headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(developmentResponse.headers["strict-transport-security"]).toBeUndefined();
  });
});
