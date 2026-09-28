import { describe, expect, it } from "vitest";
import { formatTimestamp, parseTimestamp } from "./time";

describe("formatTimestamp", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(760)).toBe("12:40");
    expect(formatTimestamp(3723.9)).toBe("1:02:03");
  });
});

describe("parseTimestamp", () => {
  it("parses m:ss, h:mm:ss, and plain seconds", () => {
    expect(parseTimestamp("12:40")).toBe(760);
    expect(parseTimestamp("1:02:03")).toBe(3723);
    expect(parseTimestamp("760")).toBe(760);
  });

  it("rejects bad input", () => {
    expect(() => parseTimestamp("abc")).toThrow("Invalid timestamp");
    expect(() => parseTimestamp("12:")).toThrow("Invalid timestamp");
  });
});
