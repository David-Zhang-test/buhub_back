import { describe, it, expect } from "vitest";
import { dedup, mergeSameName } from "../dedup";
import { identifyCourses } from "../course-match";
import type { ParsedCourse } from "../types";

// Helper: build a card (the input format to identifyCourses)
function card(day: number, start: string, end: string, texts: string[]) {
  return { dayOfWeek: day, startTime: start, endTime: end, texts };
}

describe("integration -- full pipeline dedup + merge (ROBUST-01)", () => {

  describe("with-scale / with-headers format", () => {
    it("produces correct courses from typical HKBU schedule", () => {
      // Simulate: 3 courses on Mon/Tue/Wed, with one OCR duplicate on Mon
      const cards = [
        card(1, "09:00", "11:00", ["COMP3115", "OEM704"]),
        card(1, "09:02", "10:58", ["COMP3115", "OEM704"]),  // OCR noise duplicate
        card(2, "14:00", "16:00", ["MATH2225", "DLB601"]),
        card(3, "10:00", "12:00", ["GE2401", "AAB405"]),
      ];
      const courses = mergeSameName(dedup(identifyCourses(cards)));
      expect(courses).toHaveLength(3);
      expect(courses.find(c => c.name === "COMP3115")).toBeDefined();
      expect(courses.find(c => c.name === "MATH2225")).toBeDefined();
      expect(courses.find(c => c.name === "GE2401")).toBeDefined();
    });

    it("preserves lecture + tutorial of same course (multi-session)", () => {
      const cards = [
        card(1, "09:00", "11:00", ["COMP3115", "Lecture", "OEM704"]),
        card(1, "14:00", "16:00", ["COMP3115", "Tutorial", "DLB601"]),
      ];
      const courses = mergeSameName(dedup(identifyCourses(cards)));
      expect(courses).toHaveLength(2);
      const morningSession = courses.find(c => c.startTime === "09:00");
      const afternoonSession = courses.find(c => c.startTime === "14:00");
      expect(morningSession).toBeDefined();
      expect(afternoonSession).toBeDefined();
      expect(morningSession!.location).toContain("OEM704");
      expect(afternoonSession!.location).toContain("DLB601");
    });
  });

  describe("with-scale / no-headers format", () => {
    it("handles courses across multiple days without day header context", () => {
      // Days are pre-assigned by column detection (upstream), we test dedup correctness
      const cards = [
        card(1, "08:00", "10:00", ["COMP3115", "OEM704"]),
        card(2, "08:00", "10:00", ["COMP3115", "OEM704"]),  // Same course, different day = keep both
        card(3, "13:00", "15:00", ["MATH2225", "DLB601"]),
      ];
      const courses = mergeSameName(dedup(identifyCourses(cards)));
      expect(courses).toHaveLength(3);
      // COMP3115 appears on day 1 and day 2 separately
      const comp = courses.filter(c => c.name === "COMP3115");
      expect(comp).toHaveLength(2);
      expect(comp.map(c => c.dayOfWeek).sort()).toEqual([1, 2]);
    });
  });

  describe("no-scale / with-headers format", () => {
    it("handles courses with estimated times from block height", () => {
      // Times are pre-computed by estimateNoTimescale, we test dedup on the output
      const cards = [
        card(1, "08:30", "09:30", ["COMP3115", "OEM704"]),
        card(1, "08:30", "09:30", ["COMP3115"]),  // Duplicate, no location
        card(4, "10:00", "12:00", ["GE2401", "AAB405"]),
      ];
      const courses = mergeSameName(dedup(identifyCourses(cards)));
      expect(courses).toHaveLength(2);
      const comp = courses.find(c => c.name === "COMP3115");
      expect(comp).toBeDefined();
      expect(comp!.location).toBe("OEM704");  // Richest data kept
    });
  });

  describe("no-scale / no-headers format", () => {
    it("handles minimal format -- courses with estimated times and inferred days", () => {
      const cards = [
        card(1, "08:30", "09:30", ["COMP3115", "OEM704"]),
        card(2, "08:30", "09:30", ["MATH2225", "DLB601"]),
        card(3, "08:30", "09:30", ["GE2401", "AAB405"]),
      ];
      const courses = mergeSameName(dedup(identifyCourses(cards)));
      expect(courses).toHaveLength(3);
      expect(courses.map(c => c.name).sort()).toEqual(["COMP3115", "GE2401", "MATH2225"]);
    });

    it("handles complex scenario: duplicates + multi-session + different days", () => {
      const cards = [
        // Monday: COMP3115 lecture + OCR duplicate + afternoon tutorial
        card(1, "09:00", "11:00", ["COMP3115", "OEM704"]),
        card(1, "09:03", "10:57", ["COMP3115"]),             // OCR noise
        card(1, "14:00", "16:00", ["COMP3115", "DLB601"]),   // Afternoon tutorial
        // Tuesday: MATH2225
        card(2, "10:00", "12:00", ["MATH2225", "DLB601"]),
        card(2, "10:02", "11:58", ["MATH2225", "DLB601"]),   // OCR noise
        // Wednesday: GE2401
        card(3, "13:00", "15:00", ["GE2401", "AAB405"]),
      ];
      const courses = mergeSameName(dedup(identifyCourses(cards)));
      // Expected: COMP3115 Mon morning, COMP3115 Mon afternoon, MATH2225 Tue, GE2401 Wed = 4
      expect(courses).toHaveLength(4);
      const comp = courses.filter(c => c.name === "COMP3115");
      expect(comp).toHaveLength(2);  // lecture + tutorial preserved
      const math = courses.filter(c => c.name === "MATH2225");
      expect(math).toHaveLength(1);  // duplicates merged
    });
  });
});
