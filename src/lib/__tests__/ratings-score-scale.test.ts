import { describe, it, expect } from "vitest";
import {
  convertSubmittedScoreTo05,
  aggregateDimensionDisplay,
} from "../ratings";

// The rating pipeline keeps storage on a 0..5 scale so historical rows stay
// valid, while the mobile form collects 0..100 and the read aggregates ×20 to
// display 0..100. These tests pin the math so a future refactor can't silently
// drift.

describe("convertSubmittedScoreTo05 — submit-side 0..100 → 0..5 conversion", () => {
  it("converts a 0..100 form value into the storage value the read math expects", () => {
    expect(convertSubmittedScoreTo05(0)).toBe(0);
    expect(convertSubmittedScoreTo05(20)).toBe(1);
    expect(convertSubmittedScoreTo05(40)).toBe(2);
    expect(convertSubmittedScoreTo05(50)).toBe(2.5);
    expect(convertSubmittedScoreTo05(70)).toBe(3.5);
    expect(convertSubmittedScoreTo05(100)).toBe(5);
  });

  it("clamps out-of-range values into [0, 5]", () => {
    expect(convertSubmittedScoreTo05(-10)).toBe(0);
    expect(convertSubmittedScoreTo05(200)).toBe(5);
    expect(convertSubmittedScoreTo05(101)).toBe(5);
  });

  it("treats non-finite input as 0", () => {
    expect(convertSubmittedScoreTo05(Number.NaN)).toBe(0);
    expect(convertSubmittedScoreTo05(Number.POSITIVE_INFINITY)).toBe(0);
    expect(convertSubmittedScoreTo05(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("preserves the 5-step granularity that the form emits", () => {
    // The form steps in 5s on the 0..100 scale → 0.25 on the 0..5 scale.
    expect(convertSubmittedScoreTo05(5)).toBe(0.25);
    expect(convertSubmittedScoreTo05(15)).toBe(0.75);
    expect(convertSubmittedScoreTo05(85)).toBe(4.25);
  });
});

describe("aggregateDimensionDisplay — read-side 0..5 → 0..100 averaging", () => {
  it("returns 0 when there are no ratings", () => {
    expect(aggregateDimensionDisplay([])).toBe(0);
  });

  it("multiplies a single stored value by 20 to display 0..100", () => {
    expect(aggregateDimensionDisplay([0])).toBe(0);
    expect(aggregateDimensionDisplay([1])).toBe(20);
    expect(aggregateDimensionDisplay([2.5])).toBe(50);
    expect(aggregateDimensionDisplay([5])).toBe(100);
  });

  it("averages multiple stored values, then scales to 0..100", () => {
    expect(aggregateDimensionDisplay([1, 1, 1])).toBe(20);
    expect(aggregateDimensionDisplay([1, 3, 5])).toBe(60); // mean = 3, ×20 = 60
    expect(aggregateDimensionDisplay([0, 5])).toBe(50);
  });

  it("rounds to two decimals to match the SQL aggregate", () => {
    // mean = 1/3 ≈ 0.3333, ×20 = 6.6666… → rounded to 6.67
    expect(aggregateDimensionDisplay([1, 0, 0])).toBe(6.67);
  });
});

describe("end-to-end: form input → stored value → displayed score", () => {
  // Helper that simulates the full pipeline for a single dimension across many
  // raters, so the test reads like the user-facing scenario.
  function pipeline(formInputs: number[]): number {
    const stored = formInputs.map(convertSubmittedScoreTo05);
    return aggregateDimensionDisplay(stored);
  }

  it("matches the user spec: three users entering 20/20/20 → display 20", () => {
    expect(pipeline([20, 20, 20])).toBe(20);
  });

  it("a single rater sees their own score reflected verbatim", () => {
    expect(pipeline([0])).toBe(0);
    expect(pipeline([20])).toBe(20);
    expect(pipeline([55])).toBe(55);
    expect(pipeline([100])).toBe(100);
  });

  it("averages mixed user inputs", () => {
    // (40 + 60 + 80) / 3 = 60
    expect(pipeline([40, 60, 80])).toBe(60);
    // (0 + 100) / 2 = 50
    expect(pipeline([0, 100])).toBe(50);
  });

  it("never displays above 100, even if the form somehow submitted >100", () => {
    expect(pipeline([200, 200])).toBe(100);
    expect(pipeline([100, 200])).toBe(100);
  });
});

describe("overall-score formula — average of per-dimension displayed scores", () => {
  // Mirrors the JS overall computation: scores.reduce(...) / scores.length over
  // the displayed dimension values.
  function overallFromForm(formInputs: number[]): number {
    const stored = formInputs.map(convertSubmittedScoreTo05);
    const dimensionDisplay = stored.map((v) => aggregateDimensionDisplay([v]));
    if (dimensionDisplay.length === 0) return 0;
    const avg =
      dimensionDisplay.reduce((sum, v) => sum + v, 0) / dimensionDisplay.length;
    return Math.round(avg * 100) / 100;
  }

  it("matches the user spec: dimensions 20/20/20 → overall 20", () => {
    expect(overallFromForm([20, 20, 20])).toBe(20);
  });

  it("averages across dimensions for a single rater", () => {
    expect(overallFromForm([60, 80, 100])).toBe(80);
    expect(overallFromForm([0, 50, 100])).toBe(50);
  });
});
