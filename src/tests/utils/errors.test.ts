import { describe, expect, test } from "bun:test";

const { classifyPm2Error, formatElysiaErrorResponse } = await import("../../utils/errors");

describe("classifyPm2Error", () => {
    test("returns 404 for process not found errors", () => {
        const error = new Error("Process or namespace not found");
        const result = classifyPm2Error(error);
        expect(result).toEqual({ code: "PROCESS_NOT_FOUND", status: 404, message: "Process not found" });
    });

    test("returns 400 for script not found errors", () => {
        const error = new Error("Script not found");
        const result = classifyPm2Error(error);
        expect(result).toEqual({
            code: "SCRIPT_NOT_FOUND",
            status: 400,
            message: "Script not found — check the 'script' path in your request",
        });
    });

    test("returns 503 for connection errors", () => {
        const error = new Error("ECONNREFUSED: connect");
        const result = classifyPm2Error(error);
        expect(result).toEqual({ code: "PM2_DAEMON_UNAVAILABLE", status: 503, message: "Cannot connect to PM2 daemon" });
    });

    test("returns 500 for unexpected errors", () => {
        const error = new Error("Unexpected error");
        const result = classifyPm2Error(error);
        expect(result).toEqual({
            code: "PM2_OPERATION_FAILED",
            status: 500,
            message: "PM2 operation failed: Unexpected error",
        });
    });
});

describe("formatElysiaErrorResponse", () => {
    test("returns 422 validation response with formatted summary", () => {
        const error = new Error(JSON.stringify({ summary: "name is required" }));
        const result = formatElysiaErrorResponse("VALIDATION", error);
        expect(result).toEqual({
            success: false,
            message: "Validation failed: name is required",
            info: null,
            status: 422,
            code: "VALIDATION_FAILED",
        });
    });

    test("returns mapped descriptor for known Elysia codes", () => {
        const result = formatElysiaErrorResponse("NOT_FOUND", new Error("ignored"));
        expect(result).toEqual({
            success: false,
            message: "Route not found",
            info: null,
            status: 404,
            code: "NOT_FOUND",
        });
    });

    test("appends error detail for internal server errors", () => {
        const result = formatElysiaErrorResponse("INTERNAL_SERVER_ERROR", new Error("boom"));
        expect(result).toEqual({
            success: false,
            message: "Internal server error: boom",
            info: null,
            status: 500,
            code: "INTERNAL_SERVER_ERROR",
        });
    });

    test("falls back to PM2 classification for unmapped codes", () => {
        const result = formatElysiaErrorResponse("SOME_UNKNOWN_CODE", new Error("Process or namespace not found"));
        expect(result).toEqual({
            success: false,
            message: "Process not found",
            info: null,
            status: 404,
            code: "PROCESS_NOT_FOUND",
        });
    });
});