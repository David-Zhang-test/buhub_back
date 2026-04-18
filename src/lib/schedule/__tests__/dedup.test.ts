import { describe, it, expect } from "vitest";
import {
  dedup,
  mergeSameName,
  TIME_TOLERANCE_MINUTES,
  SESSION_GAP_MINUTES,
} from "../dedup";
import type { ParsedCourse } from "../types";

/** Factory for creating ParsedCourse with sensible defaults. */
function course(overrides: Partial<ParsedCourse> = {}): ParsedCourse {
  return {
    name: "COMP3115",
    location: "OEM704",
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "11:00",
    ...overrides,
  };
}

// ─── dedup — time-tolerant (DEDUP-01) ────────────────────────────────────────

describe("dedup — time-tolerant (DEDUP-01)", () => {
  it("exports TIME_TOLERANCE_MINUTES = 5", () => {
    expect(TIME_TOLERANCE_MINUTES).toBe(5);
  });

  it("merges courses with identical times", () => {
    const input = [
      course(),
      course(),
    ];
    const result = dedup(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(course());
  });

  it("merges courses within 5min tolerance", () => {
    const input = [
      course({ startTime: "09:00", endTime: "11:00" }),
      course({ startTime: "09:03", endTime: "10:58" }),
    ];
    const result = dedup(input);
    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe("09:00");
    expect(result[0].endTime).toBe("11:00");
  });

  it("keeps richest location data — empty vs non-empty", () => {
    const input = [
      course({ location: "" }),
      course({ location: "OEM704" }),
    ];
    const result = dedup(input);
    expect(result).toHaveLength(1);
    expect(result[0].location).toBe("OEM704");
  });

  it("keeps richest location data — shorter vs longer", () => {
    const input = [
      course({ location: "OEM704" }),
      course({ location: "OEM704 Lab B" }),
    ];
    const result = dedup(input);
    expect(result).toHaveLength(1);
    expect(result[0].location).toBe("OEM704 Lab B");
  });

  it("does not merge when time difference exceeds tolerance", () => {
    const input = [
      course({ startTime: "09:00", endTime: "11:00" }),
      course({ startTime: "09:08", endTime: "11:00" }),
    ];
    const result = dedup(input);
    expect(result).toHaveLength(2);
  });

  it("does not merge different days", () => {
    const input = [
      course({ dayOfWeek: 1 }),
      course({ dayOfWeek: 2 }),
    ];
    const result = dedup(input);
    expect(result).toHaveLength(2);
  });

  it("does not merge different names", () => {
    const input = [
      course({ name: "COMP3115" }),
      course({ name: "MATH2225" }),
    ];
    const result = dedup(input);
    expect(result).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(dedup([])).toEqual([]);
  });

  it("handles single course", () => {
    const input = [course()];
    const result = dedup(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(course());
  });
});

// ─── mergeSameName — gap threshold (DEDUP-02) ───────────────────────────────

describe("mergeSameName — gap threshold (DEDUP-02)", () => {
  it("exports SESSION_GAP_MINUTES = 5", () => {
    expect(SESSION_GAP_MINUTES).toBe(5);
  });

  it("merges overlapping same-name same-day courses", () => {
    const input = [
      course({ startTime: "09:00", endTime: "10:00" }),
      course({ startTime: "09:30", endTime: "11:00" }),
    ];
    const result = mergeSameName(input);
    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe("09:00");
    expect(result[0].endTime).toBe("11:00");
  });

  it("merges adjacent sessions within 5min gap (OCR noise)", () => {
    const input = [
      course({ startTime: "09:00", endTime: "10:00" }),
      course({ startTime: "10:03", endTime: "11:00" }),
    ];
    const result = mergeSameName(input);
    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe("09:00");
    expect(result[0].endTime).toBe("11:00");
  });

  it("preserves separate sessions with gap >5min", () => {
    const input = [
      course({ startTime: "09:00", endTime: "11:00" }),
      course({ startTime: "14:00", endTime: "16:00" }),
    ];
    const result = mergeSameName(input);
    expect(result).toHaveLength(2);
    expect(result[0].startTime).toBe("09:00");
    expect(result[0].endTime).toBe("11:00");
    expect(result[1].startTime).toBe("14:00");
    expect(result[1].endTime).toBe("16:00");
  });

  it("preserves different locations for separate sessions", () => {
    const input = [
      course({ startTime: "09:00", endTime: "11:00", location: "OEM704" }),
      course({ startTime: "14:00", endTime: "16:00", location: "DLB601" }),
    ];
    const result = mergeSameName(input);
    expect(result).toHaveLength(2);
    expect(result[0].location).toBe("OEM704");
    expect(result[1].location).toBe("DLB601");
  });

  it("handles zero-gap (adjacent, endTime == startTime) with same location", () => {
    const input = [
      course({ startTime: "09:00", endTime: "10:00", location: "FSC801C" }),
      course({ startTime: "10:00", endTime: "11:00", location: "FSC801C" }),
    ];
    const result = mergeSameName(input);
    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe("09:00");
    expect(result[0].endTime).toBe("11:00");
  });

  it("keeps back-to-back same-name sessions when locations are disjoint", () => {
    // c8c regression: same course code in adjacent blocks with different
    // section rooms should NOT merge — they represent different sections.
    const input = [
      course({ startTime: "09:00", endTime: "10:30", location: "FSC801C" }),
      course({ startTime: "10:30", endTime: "11:30", location: "FSC801D" }),
    ];
    const result = mergeSameName(input);
    expect(result).toHaveLength(2);
    expect(result[0].location).toBe("FSC801C");
    expect(result[1].location).toBe("FSC801D");
  });

  it("handles exactly 5min gap (boundary) — merged", () => {
    const input = [
      course({ startTime: "09:00", endTime: "10:00" }),
      course({ startTime: "10:05", endTime: "11:00" }),
    ];
    const result = mergeSameName(input);
    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe("09:00");
    expect(result[0].endTime).toBe("11:00");
  });

  it("handles 6min gap (boundary) — preserved as separate", () => {
    const input = [
      course({ startTime: "09:00", endTime: "10:00" }),
      course({ startTime: "10:06", endTime: "11:06" }),
    ];
    const result = mergeSameName(input);
    expect(result).toHaveLength(2);
  });

  it("mixed scenario: dedup + multi-session preservation", () => {
    // 2 near-duplicates at 09:00 + 1 at 14:00
    const input = [
      course({ startTime: "09:00", endTime: "11:00" }),
      course({ startTime: "09:02", endTime: "10:58" }),
      course({ startTime: "14:00", endTime: "16:00" }),
    ];
    // After dedup: should be 2 courses (morning + afternoon)
    const afterDedup = dedup(input);
    expect(afterDedup).toHaveLength(2);
    // After mergeSameName: morning + afternoon preserved separately (gap > 30min)
    const afterMerge = mergeSameName(afterDedup);
    expect(afterMerge).toHaveLength(2);
    expect(afterMerge[0].startTime).toBe("09:00");
    expect(afterMerge[1].startTime).toBe("14:00");
  });
});
