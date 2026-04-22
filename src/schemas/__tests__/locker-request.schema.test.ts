import { describe, it, expect } from "vitest";
import { createLockerRequestSchema } from "../locker-request.schema";

const valid = {
  fullName: "Chan Tai Man",
  studentId: "23456789",
  phoneNumber: "91234567",
  residenceAddress: "Room 123, Residential Hall 1, HKBU",
  dropOffDate: "2026-05-06",
  pickupDate: null,
};

describe("createLockerRequestSchema", () => {
  it("accepts a valid payload", () => {
    expect(() => createLockerRequestSchema.parse(valid)).not.toThrow();
  });

  it("requires fullName", () => {
    expect(() => createLockerRequestSchema.parse({ ...valid, fullName: "" })).toThrow();
  });

  it("requires studentId of non-zero length", () => {
    expect(() => createLockerRequestSchema.parse({ ...valid, studentId: "" })).toThrow();
  });

  it("requires phoneNumber of non-zero length", () => {
    expect(() => createLockerRequestSchema.parse({ ...valid, phoneNumber: "" })).toThrow();
  });

  it("requires residenceAddress of non-zero length", () => {
    expect(() => createLockerRequestSchema.parse({ ...valid, residenceAddress: "" })).toThrow();
  });

  it("rejects dropOffDate outside the allow-list", () => {
    expect(() => createLockerRequestSchema.parse({ ...valid, dropOffDate: "2026-05-04" })).toThrow();
  });

  it("accepts null pickupDate", () => {
    expect(() => createLockerRequestSchema.parse({ ...valid, pickupDate: null })).not.toThrow();
  });

  it("strips unknown extra fields (default zod behavior)", () => {
    const result = createLockerRequestSchema.parse({ ...valid, extra: "x" } as unknown as typeof valid);
    expect(result).not.toHaveProperty("extra");
  });
});
