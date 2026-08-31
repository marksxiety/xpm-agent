import { describe, expect, test } from "bun:test";
import { isValidBearerToken } from "../../utils/auth";

describe("isValidBearerToken", () => {
  const token = "secret-token";

  test("accepts a matching bearer token", () => {
    expect(isValidBearerToken(`Bearer ${token}`, token)).toBe(true);
  });

  test("rejects a missing header", () => {
    expect(isValidBearerToken(null, token)).toBe(false);
  });

  test("rejects an empty header", () => {
    expect(isValidBearerToken("", token)).toBe(false);
  });

  test("rejects a non-bearer header", () => {
    expect(isValidBearerToken(token, token)).toBe(false);
    expect(isValidBearerToken("Basic abc123", token)).toBe(false);
  });

  test("rejects a mismatched token", () => {
    expect(isValidBearerToken("Bearer wrong", token)).toBe(false);
  });

  test("rejects a bearer header with an empty value", () => {
    expect(isValidBearerToken("Bearer ", token)).toBe(false);
  });

  test("rejects when the expected token is empty", () => {
    expect(isValidBearerToken(`Bearer ${token}`, "")).toBe(false);
  });
});