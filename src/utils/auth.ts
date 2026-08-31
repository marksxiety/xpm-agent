import { timingSafeEqual } from "node:crypto";

const BEARER_PREFIX = "Bearer ";

export function isValidBearerToken(authorizationHeader: string | null, expectedToken: string): boolean {
  if (!authorizationHeader || !authorizationHeader.startsWith(BEARER_PREFIX)) return false;
  return safeEqual(authorizationHeader.slice(BEARER_PREFIX.length), expectedToken);
}

function safeEqual(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}