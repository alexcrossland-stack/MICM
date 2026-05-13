import { describe, expect, it } from "vitest";
import { formatTargetDate, getTargetPlanningStatus } from "./targetPlanning";

describe("target planning helpers", () => {
  it("flags unset targets as planning needed", () => {
    expect(getTargetPlanningStatus(2.4, null)).toMatchObject({
      gap: null,
      priority: "set_target",
      priorityLabel: "Planning needed",
    });
  });

  it("classifies target gaps by priority", () => {
    expect(getTargetPlanningStatus(2, 3.2)).toMatchObject({
      gap: 1.2,
      priority: "high_gap",
      priorityLabel: "High focus",
    });
    expect(getTargetPlanningStatus(2.5, 3)).toMatchObject({
      gap: 0.5,
      priority: "medium_gap",
      priorityLabel: "Medium focus",
    });
    expect(getTargetPlanningStatus(3.1, 3)).toMatchObject({
      gap: -0.1,
      priority: "on_track",
      priorityLabel: "On track",
    });
  });

  it("formats target dates with relative timing", () => {
    const now = new Date("2026-05-13T12:00:00.000Z");

    expect(formatTargetDate(null, now)).toBe("No date set");
    expect(formatTargetDate("2026-05-13T00:00:00.000Z", now)).toContain(
      "due today",
    );
    expect(formatTargetDate("2026-05-20T00:00:00.000Z", now)).toContain(
      "7 days",
    );
    expect(formatTargetDate("2026-04-30T00:00:00.000Z", now)).toContain(
      "overdue",
    );
  });
});
