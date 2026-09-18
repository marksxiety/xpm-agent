import { describe, expect, test } from "bun:test";
import { findListeningPids, formatPortError, formatPortInUseError, parseTasklistImageName, resolveServerPort } from "../../utils/port";

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

describe("formatPortInUseError", () => {
    test("names the owning process when the PID and image name are known", () => {
        const message = formatPortInUseError(4000, 5552, "node.exe");
        expect(message).toContain("port 4000 is already in use by PID 5552 (node.exe)");
        expect(message).toContain("SERVER_PORT");
    });

    test("falls back to the PID alone when the image name is unknown", () => {
        expect(formatPortInUseError(4000, 5552)).toContain("port 4000 is already in use by PID 5552");
    });

    test("omits the owner when no PID is available", () => {
        expect(formatPortInUseError(4000)).toContain("port 4000 is already in use —");
    });
});

const NETSTAT_SAMPLE = [
    "Active Connections",
    "",
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    0.0.0.0:4000           0.0.0.0:0              LISTENING       5552",
    "  TCP    192.168.36.212:4000    192.168.36.212:52948   ESTABLISHED     5552",
    "  TCP    192.168.36.212:52948   192.168.36.212:4000    ESTABLISHED     14324",
    "  TCP    127.0.0.1:4000         0.0.0.0:0              LISTENING       777",
    "  TCP    [::]:4000              [::]:0                 LISTENING       5552",
    "  TCP    [::1]:4000             [::]:0                 LISTENING       888",
    "  TCP    0.0.0.0:40000          0.0.0.0:0              LISTENING       999",
    "  TCP    0.0.0.0:49152          0.0.0.0:0              LISTENING       321",
    "  UDP    0.0.0.0:4000           *:*                                    123",
    "  TCP    192.168.36.212:4000    0.0.0.0:0              TIME_WAIT       0",
].join("\n");

describe("findListeningPids", () => {
    test("detects listeners on every interface and both address families", () => {
        expect(findListeningPids(NETSTAT_SAMPLE, 4000)).toEqual([5552, 777, 888]);
    });

    test("ignores established and TIME_WAIT connections to the port", () => {
        const establishedOnly = [
            "  TCP    192.168.36.212:4000    192.168.36.212:52948   ESTABLISHED     5552",
            "  TCP    192.168.36.212:52948   192.168.36.212:4000    ESTABLISHED     14324",
            "  TCP    192.168.36.212:4000    192.168.36.212:53111   TIME_WAIT       0",
        ].join("\n");
        expect(findListeningPids(establishedOnly, 4000)).toEqual([]);
    });

    test("ignores a different port that shares the same digits", () => {
        expect(findListeningPids("  TCP    0.0.0.0:40000          0.0.0.0:0              LISTENING       999", 4000)).toEqual([]);
    });

    test("ignores UDP rows, headers, and malformed lines", () => {
        expect(findListeningPids("Active Connections\n\n  Proto  Local Address\n  UDP    0.0.0.0:4000           *:*", 4000)).toEqual([]);
    });

    test("returns an empty list when nothing listens", () => {
        expect(findListeningPids("", 4000)).toEqual([]);
    });
});

describe("parseTasklistImageName", () => {
    test("extracts the image name from CSV output", () => {
        expect(parseTasklistImageName('"node.exe","5552","Console","1","101,212 K"')).toBe("node.exe");
    });

    test("returns undefined when tasklist reports no matching task", () => {
        expect(parseTasklistImageName("INFO: No tasks are running which match the specified criteria.")).toBeUndefined();
    });

    test("returns undefined for empty output", () => {
        expect(parseTasklistImageName("")).toBeUndefined();
    });
});
