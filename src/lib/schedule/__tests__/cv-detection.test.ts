import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ─── Helper: mirrors Python contour filter logic from detect_course_blocks() ──

function shouldKeepContour(
  area: number,
  x: number,
  y: number,
  bw: number,
  bh: number,
  imageWidth: number,
  imageHeight: number,
): boolean {
  const minArea = imageWidth * imageHeight * 0.0025;
  const maxArea = imageWidth * imageHeight * 0.3;
  if (area < minArea || area > maxArea) return false;
  if (bw < 20 || bh < 20) return false;
  if (y < imageHeight * 0.10) return false;
  if (bw > imageWidth * 0.6) return false;
  if (bh < imageHeight * 0.02) return false;
  const aspectRatio =
    Math.min(bw, bh) > 0 ? Math.max(bw / bh, bh / bw) : 999;
  if (aspectRatio > 6) return false;
  return true;
}

// ─── CV Detection Filters ───────────────────────────────────────────────────

describe("CV Detection Filters", () => {
  it("rejects contours below min_area threshold", () => {
    // Image 1000x2000 → min_area = 1000*2000*0.0025 = 5000
    // area=3000 < 5000 → rejected
    expect(shouldKeepContour(3000, 100, 500, 50, 60, 1000, 2000)).toBe(false);
  });

  it("rejects thin border remnants (high aspect ratio)", () => {
    // Image 1000x1000 → min_area = 2500, h*0.02 = 20
    // 200x30 contour: bh=30 >= 20, aspect = 200/30 = 6.67 > 6 → rejected
    expect(shouldKeepContour(8000, 100, 500, 200, 30, 1000, 1000)).toBe(false);
  });

  it("accepts valid course blocks", () => {
    // Image 1000x2000 → min_area = 5000, h*0.02 = 40
    // 150x60 contour: area=9000 >= 5000, bh=60 >= 40, aspect=2.5 → accepted
    expect(shouldKeepContour(9000, 100, 500, 150, 60, 1000, 2000)).toBe(true);
  });

  it("rejects contours in header zone (y < 10% of height)", () => {
    // Image 1000x2000 → 10% = 200, y=50 < 200 → rejected
    expect(shouldKeepContour(9000, 100, 50, 150, 60, 1000, 2000)).toBe(false);
  });

  it("rejects contours spanning >60% of image width", () => {
    // bw=650 > 1000*0.6=600 → rejected
    expect(shouldKeepContour(40000, 100, 500, 650, 60, 1000, 2000)).toBe(
      false,
    );
  });

  it("accepts blocks at aspect ratio boundary (ratio <= 6)", () => {
    // Image 1000x2000 → min_area = 5000, h*0.02 = 40
    // 100x60 contour: area=6000 >= 5000, bh=60 >= 40, aspect = 100/60 = 1.67 → accepted
    expect(shouldKeepContour(6000, 100, 500, 100, 60, 1000, 2000)).toBe(true);
  });

  it("rejects very elongated blocks (aspect ratio > 6)", () => {
    // Image 500x500 → min_area = 625, h*0.02 = 10
    // 300x30 contour: area=6000, aspect = 300/30 = 10 > 6 → rejected
    expect(shouldKeepContour(6000, 50, 200, 300, 30, 500, 500)).toBe(false);
  });

  it("rejects contours with bh < 2% of image height", () => {
    // Image 1000x2000 → 2% = 40, bh=30 < 40 → rejected
    expect(shouldKeepContour(9000, 100, 500, 150, 30, 1000, 2000)).toBe(false);
  });
});

// ─── HSV Threshold Constants ────────────────────────────────────────────────

describe("HSV Threshold Constants", () => {
  const PYTHON_SCRIPT = path.resolve(
    __dirname,
    "../../../../scripts/detect-blocks.py",
  );
  const src = readFileSync(PYTHON_SCRIPT, "utf-8");

  it("sat_mask uses S>=15", () => {
    expect(src).toContain("0, 15, 80");
  });

  it("gray_mask uses V:120-240", () => {
    expect(src).toContain("0, 0, 120");
    expect(src).toContain("180, 30, 240");
  });

  it("min_area uses 0.0025 multiplier", () => {
    expect(src).toContain("0.0025");
  });

  it("has aspect ratio filter with cutoff 6", () => {
    expect(src).toContain("aspect_ratio");
    expect(src).toContain("> 6");
  });
});
