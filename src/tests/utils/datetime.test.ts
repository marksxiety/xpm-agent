import { describe, expect, test, setSystemTime } from "bun:test";

import { getCurrentTimeStamp } from "../../utils/datetime";

const FIXED_NOW = new Date("2023-07-22T04:26:40.000Z").getTime();

describe("getCurrentTimeStamp", () => {
    test("returns the current epoch timestamp", () => {
        setSystemTime(FIXED_NOW);

        const timestamp = getCurrentTimeStamp();
        expect(timestamp).toBe(FIXED_NOW);
    });
});