import { describe, it, expect } from "vitest";
import {
  buildTimeScale,
  interpolateTime,
  ceilToHour,
  minutesToTime,
  parseTime,
} from "../index";
import type { OCRWord, TimeScaleEntry } from "../types";

// ─── buildTimeScale: time format parsing ────────────────────────────────────

describe("buildTimeScale", () => {
  const IMAGE_WIDTH = 800;
  const IMAGE_HEIGHT = 1200;

  describe("time format variants", () => {
    it("parses HH:mm format (e.g., 08:00, 09:00, 14:30)", () => {
      const words: OCRWord[] = [
        { text: "08:00", bounds: { x: 10, y: 200, width: 40, height: 15 } },
        { text: "09:00", bounds: { x: 10, y: 300, width: 40, height: 15 } },
        { text: "10:00", bounds: { x: 10, y: 400, width: 40, height: 15 } },
      ];
      const result = buildTimeScale(words, IMAGE_WIDTH, IMAGE_HEIGHT);
      expect(result.timeScale.length).toBeGreaterThanOrEqual(3);
      expect(result.timeScale.find((e) => e.time === "08:00")).toBeDefined();
      expect(result.timeScale.find((e) => e.time === "09:00")).toBeDefined();
      expect(result.timeScale.find((e) => e.time === "10:00")).toBeDefined();
    });

    it("parses H:mm format (e.g., 8:00, 9:30)", () => {
      const words: OCRWord[] = [
        { text: "8:00", bounds: { x: 10, y: 200, width: 40, height: 15 } },
        { text: "9:30", bounds: { x: 10, y: 300, width: 40, height: 15 } },
        { text: "10:00", bounds: { x: 10, y: 400, width: 40, height: 15 } },
      ];
      const result = buildTimeScale(words, IMAGE_WIDTH, IMAGE_HEIGHT);
      expect(result.timeScale.length).toBeGreaterThanOrEqual(3);
      expect(result.timeScale.find((e) => e.time === "08:00")).toBeDefined();
      expect(result.timeScale.find((e) => e.time === "09:30")).toBeDefined();
    });

    it("parses HH.mm format (e.g., 08.00, 14.30)", () => {
      const words: OCRWord[] = [
        { text: "08.00", bounds: { x: 10, y: 200, width: 40, height: 15 } },
        { text: "14.30", bounds: { x: 10, y: 500, width: 40, height: 15 } },
        { text: "16.00", bounds: { x: 10, y: 600, width: 40, height: 15 } },
      ];
      const result = buildTimeScale(words, IMAGE_WIDTH, IMAGE_HEIGHT);
      expect(result.timeScale.length).toBeGreaterThanOrEqual(3);
      expect(result.timeScale.find((e) => e.time === "08:00")).toBeDefined();
      expect(result.timeScale.find((e) => e.time === "14:30")).toBeDefined();
    });

    it("parses bare integer format (e.g., 8, 9, 14)", () => {
      const words: OCRWord[] = [
        { text: "8", bounds: { x: 10, y: 200, width: 20, height: 15 } },
        { text: "9", bounds: { x: 10, y: 300, width: 20, height: 15 } },
        { text: "14", bounds: { x: 10, y: 600, width: 20, height: 15 } },
      ];
      const result = buildTimeScale(words, IMAGE_WIDTH, IMAGE_HEIGHT);
      expect(result.timeScale.length).toBeGreaterThanOrEqual(3);
      expect(result.timeScale.find((e) => e.time === "08:00")).toBeDefined();
      expect(result.timeScale.find((e) => e.time === "09:00")).toBeDefined();
      expect(result.timeScale.find((e) => e.time === "14:00")).toBeDefined();
    });
  });

  describe("status bar filtering", () => {
    it("filters out words in top 8% of image height (status bar area)", () => {
      // imageHeight=1200, top 8% = y < 96
      const words: OCRWord[] = [
        { text: "12:30", bounds: { x: 10, y: 50, width: 40, height: 15 } }, // status bar - should be filtered
        { text: "08:00", bounds: { x: 10, y: 200, width: 40, height: 15 } },
        { text: "09:00", bounds: { x: 10, y: 300, width: 40, height: 15 } },
      ];
      const result = buildTimeScale(words, IMAGE_WIDTH, IMAGE_HEIGHT);
      expect(result.timeScale.length).toBe(2);
      expect(result.timeScale.find((e) => e.time === "12:30")).toBeUndefined();
      expect(result.timeScale.find((e) => e.time === "08:00")).toBeDefined();
      expect(result.timeScale.find((e) => e.time === "09:00")).toBeDefined();
    });
  });

  describe("anchor threshold", () => {
    it("returns empty timeScale when fewer than 2 time words found", () => {
      const words: OCRWord[] = [
        { text: "08:00", bounds: { x: 10, y: 200, width: 40, height: 15 } },
      ];
      const result = buildTimeScale(words, IMAGE_WIDTH, IMAGE_HEIGHT);
      expect(result.timeScale).toEqual([]);
      expect(result.timeColumnMaxX).toBe(0);
    });

    it("returns non-empty timeScale when exactly 2 time words found", () => {
      const words: OCRWord[] = [
        { text: "08:00", bounds: { x: 10, y: 200, width: 40, height: 15 } },
        { text: "09:00", bounds: { x: 10, y: 300, width: 40, height: 15 } },
      ];
      const result = buildTimeScale(words, IMAGE_WIDTH, IMAGE_HEIGHT);
      expect(result.timeScale.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("hour range filtering", () => {
    it("filters time labels to hour range 7-22 (rejects h < 7 or h > 22)", () => {
      const words: OCRWord[] = [
        { text: "5:00", bounds: { x: 10, y: 150, width: 40, height: 15 } },  // rejected: h < 7
        { text: "8:00", bounds: { x: 10, y: 200, width: 40, height: 15 } },
        { text: "9:00", bounds: { x: 10, y: 300, width: 40, height: 15 } },
        { text: "23:00", bounds: { x: 10, y: 700, width: 40, height: 15 } }, // rejected: h > 22
      ];
      const result = buildTimeScale(words, IMAGE_WIDTH, IMAGE_HEIGHT);
      expect(result.timeScale.find((e) => e.time === "05:00")).toBeUndefined();
      expect(result.timeScale.find((e) => e.time === "23:00")).toBeUndefined();
      expect(result.timeScale.find((e) => e.time === "08:00")).toBeDefined();
      expect(result.timeScale.find((e) => e.time === "09:00")).toBeDefined();
    });
  });
});

// ─── interpolateTime ────────────────────────────────────────────────────────

describe("interpolateTime", () => {
  const ts: TimeScaleEntry[] = [
    { y: 200, time: "08:00" },
    { y: 400, time: "10:00" },
  ];

  it("returns correct interpolated value between 2 anchors", () => {
    // y=300 is halfway between 200 and 400 → midway between 08:00 (480) and 10:00 (600) → 540 (09:00)
    expect(interpolateTime(300, ts)).toBe(540);
  });

  it("extrapolates below last anchor using linear pixel-per-minute ratio", () => {
    // pxPerMin = (400-200) / (600-480) = 200/120 ≈ 1.667
    // y=500 is 100px below last anchor (400)
    // extra minutes = 100 / (200/120) = 60
    // 600 + 60 = 660 (11:00)
    expect(interpolateTime(500, ts)).toBe(660);
  });

  it("caps extrapolation at 1320 (22:00)", () => {
    // Very far below → should be capped at 22:00 = 1320
    expect(interpolateTime(5000, ts)).toBe(1320);
  });

  it("returns 510 (08:30 default) when < 2 anchors", () => {
    expect(interpolateTime(300, [])).toBe(510);
    expect(interpolateTime(300, [{ y: 200, time: "08:00" }])).toBe(510);
  });

  it("extrapolates above first anchor (capped at min 420 = 07:00)", () => {
    // y=100 is 100px above first anchor (200)
    // pxPerMin = 200/120 ≈ 1.667
    // minutes back = 100 / (200/120) = 60
    // 480 - 60 = 420 (07:00)
    expect(interpolateTime(100, ts)).toBe(420);

    // Very far above → should be capped at 07:00 = 420
    expect(interpolateTime(-5000, ts)).toBe(420);
  });
});

// ─── ceilToHour ─────────────────────────────────────────────────────────────

describe("ceilToHour", () => {
  it("ceilToHour(45) returns 60 (1 hour)", () => {
    expect(ceilToHour(45)).toBe(60);
  });

  it("ceilToHour(61) returns 120 (2 hours)", () => {
    expect(ceilToHour(61)).toBe(120);
  });

  it("ceilToHour(90) returns 120 (2 hours)", () => {
    expect(ceilToHour(90)).toBe(120);
  });

  it("ceilToHour(121) returns 180 (3 hours)", () => {
    expect(ceilToHour(121)).toBe(180);
  });

  it("ceilToHour(30) returns 60 (minimum 1 hour)", () => {
    expect(ceilToHour(30)).toBe(60);
  });
});

// ─── minutesToTime (decoupled from snapTo30) ────────────────────────────────

describe("minutesToTime", () => {
  it('minutesToTime(510) returns "08:30" (pure format, no snap)', () => {
    expect(minutesToTime(510)).toBe("08:30");
  });

  it('minutesToTime(495) returns "08:15" (no longer snaps to 30)', () => {
    expect(minutesToTime(495)).toBe("08:15");
  });
});
