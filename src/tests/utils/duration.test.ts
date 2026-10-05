import { describe, expect, test } from "bun:test";
import { parseDurationMs } from "../../utils/duration";

describe("parseDurationMs", () => {
    test("passes finite non-negative numbers through as milliseconds", () => {
        expect(parseDurationMs(10000)).toBe(10000);
        expect(parseDurationMs(0)).toBe(0);
    });

    test("rejects non-finite and negative numbers", () => {
        expect(parseDurationMs(Number.NaN)).toBeUndefined();
        expect(parseDurationMs(Number.POSITIVE_INFINITY)).toBeUndefined();
        expect(parseDurationMs(-1)).toBeUndefined();
    });

    test("parses duration strings with units", () => {
        expect(parseDurationMs("10s")).toBe(10000);
        expect(parseDurationMs("500ms")).toBe(500);
        expect(parseDurationMs("2m")).toBe(120000);
        expect(parseDurationMs("1h")).toBe(3600000);
        expect(parseDurationMs("1.5s")).toBe(1500);
    });

    test("treats a bare number string as milliseconds and ignores surrounding whitespace", () => {
        expect(parseDurationMs("10000")).toBe(10000);
        expect(parseDurationMs(" 10s ")).toBe(10000);
    });

    test("returns undefined for malformed values", () => {
        expect(parseDurationMs("soon")).toBeUndefined();
        expect(parseDurationMs("10s2")).toBeUndefined();
        expect(parseDurationMs("-5s")).toBeUndefined();
        expect(parseDurationMs("")).toBeUndefined();
    });
});
