import { describe, expect, test } from "bun:test";

const { classifyPm2Error } = await import("../../utils/errors");

describe("classifyPm2Error", () => {
    test("returns 404 for process not found errors", () => {
        const error = new Error("Process or namespace not found");
        const result = classifyPm2Error(error);
        expect(result).toEqual({ status: 404, message: "Process not found" });
    });

    test("returns 400 for script not found errors", () => {
        const error = new Error("Script not found");
        const result = classifyPm2Error(error);
        expect(result).toEqual({ status: 400, message: "Script not found — check the 'script' path in your request" });
    });

    test("returns 503 for connection errors", () => {
        const error = new Error("ECONNREFUSED: connect");
        const result = classifyPm2Error(error);
        expect(result).toEqual({ status: 503, message: "Cannot connect to PM2 daemon" });
    });

    test("returns 500 for unexpected errors", () => {
        const error = new Error("Unexpected error");
        const result = classifyPm2Error(error);
        expect(result).toEqual({ status: 500, message: "PM2 operation failed: Unexpected error" });
    });
});