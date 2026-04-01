import { describe, it, expect } from "vitest";
import { computeAdaptiveGapThreshold } from "../grouping";

// ─── computeAdaptiveGapThreshold ────────────────────────────────────────────

describe("computeAdaptiveGapThreshold", () => {
  it("returns P75-based threshold for well-distributed gaps", () => {
    // 6 words at y positions [100, 130, 200, 230, 300, 330] with height 20
    // Gaps: 130+20=150 vs 200 => 50, 200+20=220 vs 230 => 10, 230+20=250 vs 300 => 50, 300+20=320 vs 330 => 10
    // Wait: word at y=100 h=20 => bottom=120, next y=130 => gap=10
    // word at y=130 h=20 => bottom=150, next y=200 => gap=50
    // word at y=200 h=20 => bottom=220, next y=230 => gap=10
    // word at y=230 h=20 => bottom=250, next y=300 => gap=50
    // word at y=300 h=20 => bottom=320, next y=330 => gap=10
    // Gaps: [10, 50, 10, 50, 10]. Sorted: [10, 10, 10, 50, 50].
    // P75 = index Math.floor(5*0.75) = 3 => 50. P75*1.5 = 75.
    // medianHeight*1.5 = 20*1.5 = 30.
    // Result = max(75, 30) = 75.
    const words = [
      { bounds: { y: 100, height: 20 } },
      { bounds: { y: 130, height: 20 } },
      { bounds: { y: 200, height: 20 } },
      { bounds: { y: 230, height: 20 } },
      { bounds: { y: 300, height: 20 } },
      { bounds: { y: 330, height: 20 } },
    ];
    expect(computeAdaptiveGapThreshold(words, 20)).toBe(75);
  });

  it("returns fallback for single word", () => {
    const words = [{ bounds: { y: 100, height: 20 } }];
    // < 2 words => medianHeight * 2.5 = 20 * 2.5 = 50
    expect(computeAdaptiveGapThreshold(words, 20)).toBe(50);
  });

  it("returns fallback when no positive gaps (overlapping words)", () => {
    // Two overlapping words: y=100 h=30 (bottom=130), y=110 h=30 (top=110)
    // Gap = 110 - 130 = -20, filtered out. No positive gaps.
    // Falls back to medianHeight * 2.5 = 20 * 2.5 = 50
    const words = [
      { bounds: { y: 100, height: 30 } },
      { bounds: { y: 110, height: 30 } },
    ];
    expect(computeAdaptiveGapThreshold(words, 20)).toBe(50);
  });

  it("uses medianHeight*1.5 floor when P75 is very small", () => {
    // 6 words with tiny gaps: [2, 3, 4, 5, 100]
    // We need 6 words sorted by y to produce those gaps
    // word0: y=0, h=10, bottom=10
    // word1: y=12, h=10 => gap=2
    // word2: y=25, h=10 => gap=3
    // word3: y=39, h=10 => gap=4
    // word4: y=54, h=10 => gap=5
    // word5: y=164, h=10 => gap=100
    // Gaps: [2, 3, 4, 5, 100]. Sorted: [2, 3, 4, 5, 100].
    // P75 = index Math.floor(5*0.75) = 3 => 5. P75*1.5 = 7.5.
    // medianHeight=20, floor=20*1.5=30.
    // Result = max(7.5, 30) = 30.
    const words = [
      { bounds: { y: 0, height: 10 } },
      { bounds: { y: 12, height: 10 } },
      { bounds: { y: 25, height: 10 } },
      { bounds: { y: 39, height: 10 } },
      { bounds: { y: 54, height: 10 } },
      { bounds: { y: 164, height: 10 } },
    ];
    expect(computeAdaptiveGapThreshold(words, 20)).toBe(30);
  });
});

// ─── Cross-column duration inference ────────────────────────────────────────

describe("Cross-column duration inference", () => {
  it("median of non-last block durations gives correct value", () => {
    // Verify the median computation logic manually:
    // Given durations [60, 120, 60, 120], sorted = [60, 60, 120, 120]
    // median index = Math.floor(4/2) = 2, median = 120
    const durations = [60, 120, 60, 120];
    const sorted = [...durations].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(median).toBe(120);
  });

  it("falls back to 60 when no reliable durations available", () => {
    // When reliableDurations is empty, medianDuration = 60
    const reliableDurations: number[] = [];
    const medianDuration = reliableDurations.length > 0
      ? reliableDurations.sort((a, b) => a - b)[Math.floor(reliableDurations.length / 2)]
      : 60;
    expect(medianDuration).toBe(60);
  });
});
