import { describe, expect, test } from "bun:test";
import { checkBootSecurity } from "../../utils/boot";

describe("checkBootSecurity", () => {
  test("allows boot when AUTH_TOKEN is set", () => {
    expect(checkBootSecurity({ AUTH_TOKEN: "secret" })).toEqual({ allowed: true });
  });

  test("rejects boot when AUTH_TOKEN is missing", () => {
    const result = checkBootSecurity({});

    expect(result.allowed).toBe(false);
    expect(result.error).toContain("AUTH_TOKEN");
  });

  test("rejects boot for an empty or whitespace-only token", () => {
    expect(checkBootSecurity({ AUTH_TOKEN: "" }).allowed).toBe(false);
    expect(checkBootSecurity({ AUTH_TOKEN: "   " }).allowed).toBe(false);
  });

  test("allows boot with ALLOW_INSECURE=true and warns", () => {
    const result = checkBootSecurity({ ALLOW_INSECURE: "true" });

    expect(result.allowed).toBe(true);
    expect(result.warning).toContain("insecure");
  });

  test("ignores ALLOW_INSECURE values other than 'true'", () => {
    expect(checkBootSecurity({ ALLOW_INSECURE: "1" }).allowed).toBe(false);
    expect(checkBootSecurity({ ALLOW_INSECURE: "yes" }).allowed).toBe(false);
  });
});
