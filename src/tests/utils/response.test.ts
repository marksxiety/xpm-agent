import { describe, expect, test } from "bun:test";

import { respond } from "../../utils/response";

describe("respond", () => {
    test("returns a successful response with default status and no info", () => {
        expect(respond("ok")).toEqual({
            success: true,
            message: "ok",
            info: null,
            status: 200,
        });
    });

    test("includes the provided info payload", () => {
        const info = { pid: 1234, name: "app" };
        expect(respond("ok", info)).toEqual({
            success: true,
            message: "ok",
            info,
            status: 200,
        });
    });

    test("defaults status to 500 when success is false", () => {
        expect(respond("failed", null, { success: false })).toEqual({
            success: false,
            message: "failed",
            info: null,
            status: 500,
        });
    });

    test("honors explicit status and success overrides", () => {
        expect(respond("not found", null, { success: false, status: 404 })).toEqual({
            success: false,
            message: "not found",
            info: null,
            status: 404,
        });
    });

    test("honors an explicit status override while keeping success true", () => {
        expect(respond("created", null, { status: 201 })).toEqual({
            success: true,
            message: "created",
            info: null,
            status: 201,
        });
    });
});