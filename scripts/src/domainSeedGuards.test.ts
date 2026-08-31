import { describe, expect, it } from "vitest";
import { assertEmptyDomainCatalogue } from "./domainSeedGuards";

describe("catalogue bootstrap guard", () => {
  it("accepts only a wholly empty catalogue", () => {
    expect(() => assertEmptyDomainCatalogue([0, 0, 0])).not.toThrow();
    for (const counts of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ])
      expect(() => assertEmptyDomainCatalogue(counts)).toThrow();
  });
});
