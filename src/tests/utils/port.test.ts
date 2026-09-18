import { describe, expect, test } from "bun:test";
import { formatPortError, resolveServerPort } from "../../utils/port";

describe("resolveServerPort", () => {
    test("accepts a numeric string and returns it as a number", () => {
        expect(resolveServerPort("4000")).toEqual({ ok: true, port: 4000 });
    });

    test("trims surrounding whitespace", () => {
        expect(resolveServerPort("  8080  ")).toEqual({ ok: true, port: 8080 });
    });

    test("accepts the boundary ports 1 and 65535", () => {
        expect(resolveServerPort("1")).toEqual({ ok: true, port: 1 });
        expect(resolveServerPort("65535")).toEqual({ ok: true, port: 65535 });
    });

    test("rejects a missing port with guidance", () => {
        const result = resolveServerPort(undefined);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.message).toContain("SERVER_PORT is not set");
    });

    test("rejects an empty or whitespace-only port", () => {
        expect(resolveServerPort("").ok).toBe(false);
        expect(resolveServerPort("   ").ok).toBe(false);
    });

    test("rejects non-numeric values", () => {
        const result = resolveServerPort("abc");
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain("whole number");
            expect(result.message).toContain("abc");
        }
    });

    test("rejects fractional values", () => {
        expect(resolveServerPort("80.5").ok).toBe(false);
    });

    test("rejects ports outside 1-65535", () => {
        expect(resolveServerPort("0").ok).toBe(false);
        expect(resolveServerPort("-1").ok).toBe(false);
        expect(resolveServerPort("65536").ok).toBe(false);
    });
});

describe("formatPortError", () => {
    test("reports a busy port when the error code is EADDRINUSE", () => {
        const error = Object.assign(new Error("listen failed"), { code: "EADDRINUSE" });
        const message = formatPortError(4000, error);
        expect(message).toContain("port 4000 is already in use");
        expect(message).toContain("SERVER_PORT");
    });

    test("reports a busy port when only the message mentions it", () => {
        const message = formatPortError(4000, new Error("Failed to start server. Is port 4000 in use?"));
        expect(message).toContain("port 4000 is already in use");
    });

    test("includes the underlying detail for other bind failures", () => {
        const error = Object.assign(new Error("permission denied"), { code: "EACCES" });
        expect(formatPortError(4000, error)).toBe("unable to bind port 4000: permission denied");
    });

    test("stringifies non-Error failures", () => {
        expect(formatPortError(4000, "boom")).toBe("unable to bind port 4000: boom");
    });
});
