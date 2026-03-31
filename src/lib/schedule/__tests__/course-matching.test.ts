import { describe, it, expect } from "vitest";
import {
  COURSE_CODE_PATTERN,
  ROOM_CODE_PATTERN,
  identifyCourses,
  mergeAdjacentCourseTokens,
} from "../course-match";

// ─── COURSE_CODE_PATTERN (MATCH-01) ────────────────────────────────────────

describe("COURSE_CODE_PATTERN", () => {
  describe("valid course codes", () => {
    it("matches 4 letters + 4 digits (COMP3115)", () => {
      expect(COURSE_CODE_PATTERN.test("COMP3115")).toBe(true);
    });

    it("matches with dash separator (COMP-3115)", () => {
      expect(COURSE_CODE_PATTERN.test("COMP-3115")).toBe(true);
    });

    it("matches with space separator (COMP 3115)", () => {
      expect(COURSE_CODE_PATTERN.test("COMP 3115")).toBe(true);
    });

    it("matches 2 letters + 4 digits (GE2401)", () => {
      expect(COURSE_CODE_PATTERN.test("GE2401")).toBe(true);
    });

    it("matches 2 letters + 3 digits (PE101)", () => {
      expect(COURSE_CODE_PATTERN.test("PE101")).toBe(true);
    });

    it("matches 4 letters + 4 digits (MATH2225)", () => {
      expect(COURSE_CODE_PATTERN.test("MATH2225")).toBe(true);
    });

    it("matches spaces around dash (COMP - 3115)", () => {
      expect(COURSE_CODE_PATTERN.test("COMP - 3115")).toBe(true);
    });
  });

  describe("invalid course codes", () => {
    it("rejects too short (A1)", () => {
      expect(COURSE_CODE_PATTERN.test("A1")).toBe(false);
    });

    it("rejects 5 digits (COMP31150)", () => {
      expect(COURSE_CODE_PATTERN.test("COMP31150")).toBe(false);
    });

    it("rejects 5 letters (ABCDE3115)", () => {
      expect(COURSE_CODE_PATTERN.test("ABCDE3115")).toBe(false);
    });
  });
});

// ─── ROOM_CODE_PATTERN ─────────────────────────────────────────────────────

describe("ROOM_CODE_PATTERN", () => {
  it("matches OEM704 (3 letters + 3 digits)", () => {
    expect(ROOM_CODE_PATTERN.test("OEM704")).toBe(true);
  });

  it("matches DLB601 (3 letters + 3 digits)", () => {
    expect(ROOM_CODE_PATTERN.test("DLB601")).toBe(true);
  });

  it("matches AAB123 (3 letters + 3 digits)", () => {
    expect(ROOM_CODE_PATTERN.test("AAB123")).toBe(true);
  });

  it("does not match single letter + digit", () => {
    expect(ROOM_CODE_PATTERN.test("A1")).toBe(false);
  });
});

// ─── mergeAdjacentCourseTokens (MATCH-01) ──────────────────────────────────

describe("mergeAdjacentCourseTokens", () => {
  it("merges ['COMP', '3115'] to ['COMP3115']", () => {
    expect(mergeAdjacentCourseTokens(["COMP", "3115"])).toEqual(["COMP3115"]);
  });

  it("merges ['COMP', '3115', 'OEM704'] to ['COMP3115', 'OEM704']", () => {
    expect(mergeAdjacentCourseTokens(["COMP", "3115", "OEM704"])).toEqual([
      "COMP3115",
      "OEM704",
    ]);
  });

  it("does not merge ['Hello', 'World']", () => {
    expect(mergeAdjacentCourseTokens(["Hello", "World"])).toEqual([
      "Hello",
      "World",
    ]);
  });

  it("merges consecutive pairs ['COMP', '3115', 'GE', '2401']", () => {
    expect(
      mergeAdjacentCourseTokens(["COMP", "3115", "GE", "2401"])
    ).toEqual(["COMP3115", "GE2401"]);
  });

  it("does not merge when second is not digits ['COMP', 'Hello']", () => {
    expect(mergeAdjacentCourseTokens(["COMP", "Hello"])).toEqual([
      "COMP",
      "Hello",
    ]);
  });
});

// ─── identifyCourses (MATCH-02, MATCH-03) ──────────────────────────────────

describe("identifyCourses", () => {
  describe("MATCH-02: spatial location classification", () => {
    it("classifies text below course code as location", () => {
      const result = identifyCourses([
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
          texts: ["COMP3115", "OEM704"],
        },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("COMP3115");
      expect(result[0].location).toBe("OEM704");
    });

    it("classifies known room code below course code as location", () => {
      const result = identifyCourses([
        {
          dayOfWeek: 2,
          startTime: "10:00",
          endTime: "11:00",
          texts: ["GE2401", "DLB601"],
        },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("GE2401");
      expect(result[0].location).toBe("DLB601");
    });

    it("skips pure text between code and room code", () => {
      const result = identifyCourses([
        {
          dayOfWeek: 3,
          startTime: "11:00",
          endTime: "12:00",
          texts: ["COMP3115", "Software", "OEM704"],
        },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("COMP3115");
      expect(result[0].location).toBe("OEM704");
    });

    it("handles code appearing below room code (D-05 priority)", () => {
      const result = identifyCourses([
        {
          dayOfWeek: 4,
          startTime: "13:00",
          endTime: "14:00",
          texts: ["OEM704", "COMP3115"],
        },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("COMP3115");
      // OEM704 is ABOVE the first code, so it should NOT be location
      expect(result[0].location).toBe("");
    });
  });

  describe("MATCH-03: no misidentification", () => {
    it("does not swap course code and room code", () => {
      const result = identifyCourses([
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
          texts: ["COMP3115", "OEM704"],
        },
      ]);
      expect(result[0].name).toBe("COMP3115");
      expect(result[0].location).toBe("OEM704");
    });

    it("classifies 2-letter prefix course code correctly", () => {
      const result = identifyCourses([
        {
          dayOfWeek: 2,
          startTime: "10:00",
          endTime: "11:00",
          texts: ["GE2401", "AAB123"],
        },
      ]);
      expect(result[0].name).toBe("GE2401");
      expect(result[0].location).toBe("AAB123");
    });

    it("returns empty location when no text below code", () => {
      const result = identifyCourses([
        {
          dayOfWeek: 3,
          startTime: "11:00",
          endTime: "12:00",
          texts: ["COMP3115"],
        },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("COMP3115");
      expect(result[0].location).toBe("");
    });

    it("skips card with no course code matches", () => {
      const result = identifyCourses([
        {
          dayOfWeek: 4,
          startTime: "13:00",
          endTime: "14:00",
          texts: ["Hello", "World"],
        },
      ]);
      expect(result).toHaveLength(0);
    });
  });

  describe("D-02: normalization", () => {
    it("normalizes COMP-3115 to COMP3115 in course name", () => {
      const result = identifyCourses([
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
          texts: ["COMP-3115", "OEM704"],
        },
      ]);
      expect(result[0].name).toBe("COMP3115");
    });

    it("normalizes COMP 3115 to COMP3115 in course name", () => {
      const result = identifyCourses([
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
          texts: ["COMP 3115", "DLB601"],
        },
      ]);
      expect(result[0].name).toBe("COMP3115");
    });

    it("preserves location text as-is (no normalization)", () => {
      const result = identifyCourses([
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
          texts: ["COMP3115", "OEM704"],
        },
      ]);
      expect(result[0].location).toBe("OEM704");
    });
  });

  describe("OCR split-code merging integration", () => {
    it("merges split OCR tokens before matching", () => {
      const result = identifyCourses([
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
          texts: ["COMP", "3115", "OEM704"],
        },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("COMP3115");
      expect(result[0].location).toBe("OEM704");
    });
  });

  describe("dayOfWeek and time passthrough", () => {
    it("preserves dayOfWeek, startTime, endTime from card", () => {
      const result = identifyCourses([
        {
          dayOfWeek: 5,
          startTime: "14:00",
          endTime: "16:00",
          texts: ["MATH2225", "WLB601"],
        },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].dayOfWeek).toBe(5);
      expect(result[0].startTime).toBe("14:00");
      expect(result[0].endTime).toBe("16:00");
    });
  });
});
