import { describe, it, expect } from "vitest";
import {
  detectHeaders,
  buildColumnIntervals,
  assignDayByInterval,
  DAY_KEYWORDS,
} from "../day-detect";
import type { OCRWord, GridColumn, CVBlock, ColumnInterval } from "../types";

// ─── detectHeaders ──────────────────────────────────────────────────────────

describe("detectHeaders", () => {
  const IMAGE_HEIGHT = 1200; // 25% region = y <= 300

  describe("with headers", () => {
    it("detects English abbreviated headers (Mon, Tue, Wed, Thu, Fri)", () => {
      const words: OCRWord[] = [
        { text: "Mon", bounds: { x: 80, y: 50, width: 40, height: 15 } },
        { text: "Tue", bounds: { x: 180, y: 50, width: 40, height: 15 } },
        { text: "Wed", bounds: { x: 280, y: 50, width: 40, height: 15 } },
        { text: "Thu", bounds: { x: 380, y: 50, width: 40, height: 15 } },
        { text: "Fri", bounds: { x: 480, y: 50, width: 40, height: 15 } },
      ];
      const result = detectHeaders(words, IMAGE_HEIGHT);
      expect(result).toHaveLength(5);
      expect(result.map(h => h.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
    });

    it("detects Chinese day headers (\u4e00, \u4e8c, \u4e09, \u56db, \u4e94)", () => {
      const words: OCRWord[] = [
        { text: "\u4e00", bounds: { x: 80, y: 80, width: 20, height: 15 } },
        { text: "\u4e8c", bounds: { x: 180, y: 80, width: 20, height: 15 } },
        { text: "\u4e09", bounds: { x: 280, y: 80, width: 20, height: 15 } },
        { text: "\u56db", bounds: { x: 380, y: 80, width: 20, height: 15 } },
        { text: "\u4e94", bounds: { x: 480, y: 80, width: 20, height: 15 } },
      ];
      const result = detectHeaders(words, IMAGE_HEIGHT);
      expect(result).toHaveLength(5);
      expect(result.map(h => h.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
    });

    it("detects full English day names (Monday, Tuesday, ...)", () => {
      const words: OCRWord[] = [
        { text: "Monday", bounds: { x: 80, y: 60, width: 60, height: 15 } },
        { text: "Friday", bounds: { x: 480, y: 60, width: 60, height: 15 } },
      ];
      const result = detectHeaders(words, IMAGE_HEIGHT);
      expect(result).toHaveLength(2);
      expect(result[0].dayOfWeek).toBe(1);
      expect(result[1].dayOfWeek).toBe(5);
    });

    it("deduplicates same dayOfWeek (keeps leftmost)", () => {
      const words: OCRWord[] = [
        { text: "Mon", bounds: { x: 80, y: 50, width: 40, height: 15 } },
        { text: "Mon", bounds: { x: 580, y: 50, width: 40, height: 15 } }, // duplicate
      ];
      const result = detectHeaders(words, IMAGE_HEIGHT);
      expect(result).toHaveLength(1);
      expect(result[0].xCenter).toBe(100); // 80 + 40/2 = 100 (leftmost)
    });

    it("ignores words below 25% region", () => {
      const words: OCRWord[] = [
        { text: "Mon", bounds: { x: 80, y: 400, width: 40, height: 15 } }, // y=400 > 300 (25% of 1200)
        { text: "Tue", bounds: { x: 180, y: 50, width: 40, height: 15 } },
      ];
      const result = detectHeaders(words, IMAGE_HEIGHT);
      expect(result).toHaveLength(1);
      expect(result[0].dayOfWeek).toBe(2); // Only Tue detected
    });
  });
});

// ─── buildColumnIntervals ───────────────────────────────────────────────────

describe("buildColumnIntervals", () => {
  describe("with grid columns (Priority 1)", () => {
    it("builds intervals from grid column boundaries", () => {
      const gridColumns: GridColumn[] = [
        { left: 100, right: 220, center: 160, index: 0 },
        { left: 220, right: 340, center: 280, index: 1 },
        { left: 340, right: 460, center: 400, index: 2 },
        { left: 460, right: 580, center: 520, index: 3 },
        { left: 580, right: 700, center: 640, index: 4 },
      ];
      const result = buildColumnIntervals({
        gridColumns,
        headers: [],
        cvBlocks: [],
        timeColumnMaxX: 60,
        imageWidth: 800,
      });
      expect(result).toHaveLength(5);
      expect(result.map(iv => iv.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
      expect(result[0].xMin).toBe(100);
      expect(result[0].xMax).toBe(220);
      expect(result[4].xMin).toBe(580);
      expect(result[4].xMax).toBe(700);
    });

    it("filters grid columns with center < timeColumnMaxX", () => {
      const gridColumns: GridColumn[] = [
        { left: 0, right: 60, center: 30, index: 0 },  // time column, should be filtered
        { left: 60, right: 180, center: 120, index: 1 },
        { left: 180, right: 300, center: 240, index: 2 },
        { left: 300, right: 420, center: 360, index: 3 },
        { left: 420, right: 540, center: 480, index: 4 },
        { left: 540, right: 660, center: 600, index: 5 },
      ];
      const result = buildColumnIntervals({
        gridColumns,
        headers: [],
        cvBlocks: [],
        timeColumnMaxX: 60,
        imageWidth: 800,
      });
      expect(result).toHaveLength(5); // time column filtered out
      expect(result[0].xMin).toBe(60); // starts from the first non-time column
    });

    it("maps headers to grid columns when both available", () => {
      const gridColumns: GridColumn[] = [
        { left: 100, right: 220, center: 160, index: 0 },
        { left: 220, right: 340, center: 280, index: 1 },
        { left: 340, right: 460, center: 400, index: 2 },
        { left: 460, right: 580, center: 520, index: 3 },
        { left: 580, right: 700, center: 640, index: 4 },
      ];
      const headers = [
        { dayOfWeek: 1, xCenter: 155 },
        { dayOfWeek: 2, xCenter: 275 },
        { dayOfWeek: 3, xCenter: 395 },
        { dayOfWeek: 4, xCenter: 515 },
        { dayOfWeek: 5, xCenter: 635 },
      ];
      const result = buildColumnIntervals({
        gridColumns,
        headers,
        cvBlocks: [],
        timeColumnMaxX: 60,
        imageWidth: 800,
      });
      expect(result).toHaveLength(5);
      // Grid boundaries used, but dayOfWeek from headers
      expect(result[0].dayOfWeek).toBe(1);
      expect(result[0].xMin).toBe(100);
      expect(result[0].xMax).toBe(220);
      expect(result[4].dayOfWeek).toBe(5);
    });

    it("7-day when > 5 grid columns and no headers", () => {
      const gridColumns: GridColumn[] = [];
      for (let i = 0; i < 7; i++) {
        gridColumns.push({
          left: 60 + i * 100,
          right: 60 + (i + 1) * 100,
          center: 60 + i * 100 + 50,
          index: i,
        });
      }
      const result = buildColumnIntervals({
        gridColumns,
        headers: [],
        cvBlocks: [],
        timeColumnMaxX: 50,
        imageWidth: 800,
      });
      expect(result).toHaveLength(7);
      expect(result.map(iv => iv.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });
  });

  describe("with headers only (Priority 2)", () => {
    it("builds intervals from header midpoints", () => {
      const headers = [
        { dayOfWeek: 1, xCenter: 150 },
        { dayOfWeek: 2, xCenter: 250 },
        { dayOfWeek: 3, xCenter: 350 },
        { dayOfWeek: 4, xCenter: 450 },
        { dayOfWeek: 5, xCenter: 550 },
      ];
      const result = buildColumnIntervals({
        gridColumns: [],
        headers,
        cvBlocks: [],
        timeColumnMaxX: 80,
        imageWidth: 700,
      });
      expect(result).toHaveLength(5);
      // First column: xMin=80 (timeColumnMaxX), xMax=midpoint(150,250)=200
      expect(result[0].xMin).toBe(80);
      expect(result[0].xMax).toBe(200);
      expect(result[0].dayOfWeek).toBe(1);
      // Last column: xMin=midpoint(450,550)=500, xMax=700 (imageWidth)
      expect(result[4].xMin).toBe(500);
      expect(result[4].xMax).toBe(700);
      expect(result[4].dayOfWeek).toBe(5);
      // Middle column: midpoints of adjacent headers
      expect(result[2].xMin).toBe(300); // midpoint(250,350)
      expect(result[2].xMax).toBe(400); // midpoint(350,450)
    });

    it("5-day when 5 headers detected", () => {
      const headers = [
        { dayOfWeek: 1, xCenter: 150 },
        { dayOfWeek: 2, xCenter: 250 },
        { dayOfWeek: 3, xCenter: 350 },
        { dayOfWeek: 4, xCenter: 450 },
        { dayOfWeek: 5, xCenter: 550 },
      ];
      const result = buildColumnIntervals({
        gridColumns: [],
        headers,
        cvBlocks: [],
        timeColumnMaxX: 80,
        imageWidth: 700,
      });
      expect(result.map(iv => iv.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
    });

    it("7-day when any header.dayOfWeek > 5", () => {
      const headers = [
        { dayOfWeek: 1, xCenter: 120 },
        { dayOfWeek: 2, xCenter: 200 },
        { dayOfWeek: 3, xCenter: 280 },
        { dayOfWeek: 4, xCenter: 360 },
        { dayOfWeek: 5, xCenter: 440 },
        { dayOfWeek: 6, xCenter: 520 },
      ];
      const result = buildColumnIntervals({
        gridColumns: [],
        headers,
        cvBlocks: [],
        timeColumnMaxX: 60,
        imageWidth: 700,
      });
      expect(result).toHaveLength(6);
      expect(result[5].dayOfWeek).toBe(6);
    });
  });

  describe("clustering fallback (Priority 3)", () => {
    it("clusters CV blocks by x-coordinate gaps", () => {
      // 15 blocks in 5 distinct x-clusters
      const cvBlocks: CVBlock[] = [];
      const clusterXPositions = [120, 240, 360, 480, 600];
      for (const cx of clusterXPositions) {
        // 3 blocks per cluster at different y positions
        for (let row = 0; row < 3; row++) {
          cvBlocks.push({
            x: cx - 10,
            y: 100 + row * 100,
            width: 80,
            height: 60,
          });
        }
      }
      const result = buildColumnIntervals({
        gridColumns: [],
        headers: [],
        cvBlocks,
        timeColumnMaxX: 50,
        imageWidth: 700,
      });
      expect(result).toHaveLength(5);
    });

    it("defaults to 5 days when <= 5 clusters", () => {
      const cvBlocks: CVBlock[] = [
        { x: 100, y: 200, width: 80, height: 60 },
        { x: 100, y: 300, width: 80, height: 60 },
        { x: 250, y: 200, width: 80, height: 60 },
        { x: 250, y: 300, width: 80, height: 60 },
        { x: 400, y: 200, width: 80, height: 60 },
      ];
      const result = buildColumnIntervals({
        gridColumns: [],
        headers: [],
        cvBlocks,
        timeColumnMaxX: 50,
        imageWidth: 600,
      });
      expect(result.every(iv => iv.dayOfWeek <= 5)).toBe(true);
    });

    it("expands to 7 days when > 5 clusters", () => {
      const cvBlocks: CVBlock[] = [];
      // 7 well-separated clusters
      const clusterXPositions = [80, 170, 260, 350, 440, 530, 620];
      for (const cx of clusterXPositions) {
        cvBlocks.push({ x: cx, y: 200, width: 60, height: 60 });
        cvBlocks.push({ x: cx, y: 350, width: 60, height: 60 });
      }
      const result = buildColumnIntervals({
        gridColumns: [],
        headers: [],
        cvBlocks,
        timeColumnMaxX: 50,
        imageWidth: 750,
      });
      expect(result).toHaveLength(7);
      expect(result.map(iv => iv.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });
  });
});

// ─── assignDayByInterval ────────────────────────────────────────────────────

describe("assignDayByInterval", () => {
  // Shared intervals: 5 columns spanning x=100-600
  const intervals5: ColumnInterval[] = [
    { dayOfWeek: 1, xMin: 100, xMax: 200, xCenter: 150 },
    { dayOfWeek: 2, xMin: 200, xMax: 300, xCenter: 250 },
    { dayOfWeek: 3, xMin: 300, xMax: 400, xCenter: 350 },
    { dayOfWeek: 4, xMin: 400, xMax: 500, xCenter: 450 },
    { dayOfWeek: 5, xMin: 500, xMax: 600, xCenter: 550 },
  ];

  describe("5-day assignment", () => {
    it("assigns block center=150 to Monday (day 1)", () => {
      expect(assignDayByInterval(150, intervals5)).toBe(1);
    });

    it("assigns block center=350 to Wednesday (day 3)", () => {
      expect(assignDayByInterval(350, intervals5)).toBe(3);
    });

    it("assigns block center=550 to Friday (day 5)", () => {
      expect(assignDayByInterval(550, intervals5)).toBe(5);
    });
  });

  describe("7-day assignment", () => {
    const intervals7: ColumnInterval[] = [
      ...intervals5,
      { dayOfWeek: 6, xMin: 600, xMax: 700, xCenter: 650 },
      { dayOfWeek: 7, xMin: 700, xMax: 800, xCenter: 750 },
    ];

    it("assigns block center in 6th column to Saturday (day 6)", () => {
      expect(assignDayByInterval(650, intervals7)).toBe(6);
    });

    it("assigns block center in 7th column to Sunday (day 7)", () => {
      expect(assignDayByInterval(750, intervals7)).toBe(7);
    });
  });

  describe("irregular column widths", () => {
    const irregularIntervals: ColumnInterval[] = [
      { dayOfWeek: 1, xMin: 100, xMax: 200, xCenter: 150 },  // 100px wide
      { dayOfWeek: 2, xMin: 200, xMax: 230, xCenter: 215 },  // 30px narrow
      { dayOfWeek: 3, xMin: 230, xMax: 400, xCenter: 315 },  // 170px wide
    ];

    it("narrow column (30px) still gets correct assignment", () => {
      expect(assignDayByInterval(215, irregularIntervals)).toBe(2);
    });

    it("wide column (170px) still gets correct assignment", () => {
      expect(assignDayByInterval(300, irregularIntervals)).toBe(3);
    });
  });

  describe("boundary cases", () => {
    it("block exactly on left boundary assigned to that column", () => {
      // center=200 is the left edge of Col2, which uses >= xMin
      expect(assignDayByInterval(200, intervals5)).toBe(2);
    });

    it("block outside all intervals (left) falls back to nearest", () => {
      // center=50 is left of all intervals -> nearest is Col1 (xCenter=150)
      expect(assignDayByInterval(50, intervals5)).toBe(1);
    });

    it("block outside all intervals (right) falls back to nearest", () => {
      // center=700 is right of all intervals -> nearest is Col5 (xCenter=550)
      expect(assignDayByInterval(700, intervals5)).toBe(5);
    });

    it("block on last interval right boundary is inclusive", () => {
      // center=600 is exactly on the right edge of the last column (xMax=600)
      expect(assignDayByInterval(600, intervals5)).toBe(5);
    });
  });
});

// ─── DAY_KEYWORDS validation ────────────────────────────────────────────────

describe("DAY_KEYWORDS", () => {
  it("maps English abbreviated days correctly", () => {
    expect(DAY_KEYWORDS["mon"]).toBe(1);
    expect(DAY_KEYWORDS["tue"]).toBe(2);
    expect(DAY_KEYWORDS["wed"]).toBe(3);
    expect(DAY_KEYWORDS["thu"]).toBe(4);
    expect(DAY_KEYWORDS["fri"]).toBe(5);
    expect(DAY_KEYWORDS["sat"]).toBe(6);
    expect(DAY_KEYWORDS["sun"]).toBe(7);
  });

  it("maps Chinese day characters correctly", () => {
    expect(DAY_KEYWORDS["\u4e00"]).toBe(1);
    expect(DAY_KEYWORDS["\u4e8c"]).toBe(2);
    expect(DAY_KEYWORDS["\u4e09"]).toBe(3);
    expect(DAY_KEYWORDS["\u56db"]).toBe(4);
    expect(DAY_KEYWORDS["\u4e94"]).toBe(5);
    expect(DAY_KEYWORDS["\u516d"]).toBe(6);
    expect(DAY_KEYWORDS["\u65e5"]).toBe(7);
  });
});
