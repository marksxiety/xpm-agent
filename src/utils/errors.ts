import type { ApiResponse } from "../types";
import { ERROR_CODES, ELYSIA_CODE_MAP, type ClassifiedError, type ErrorCode } from "../types/error";
import { respond } from "./response";

export function classifyPm2Error(error: unknown): ClassifiedError {
  const rawMessage = error instanceof Error ? error.message : String((error as { msg?: string })?.msg ?? error);
  const lowercasedMessage = rawMessage.toLowerCase();

  if (/process.*not found|process or namespace not found|app not found|no process found/.test(lowercasedMessage))
    return { code: "PROCESS_NOT_FOUND", ...ERROR_CODES.PROCESS_NOT_FOUND };
  if (/script not found/.test(lowercasedMessage))
    return { code: "SCRIPT_NOT_FOUND", ...ERROR_CODES.SCRIPT_NOT_FOUND };
  if (/econnrefused|connect|etimedout|daemon/.test(lowercasedMessage))
    return { code: "PM2_DAEMON_UNAVAILABLE", ...ERROR_CODES.PM2_DAEMON_UNAVAILABLE };
  return {
    code: "PM2_OPERATION_FAILED",
    ...ERROR_CODES.PM2_OPERATION_FAILED,
    message: `${ERROR_CODES.PM2_OPERATION_FAILED.message}: ${rawMessage}`,
  };
}

export function formatValidationMessage(message: string): string {
  try {
    const parsed = JSON.parse(message);
    return parsed.summary ?? message;
  } catch {
    return message;
  }
}

export function formatElysiaErrorResponse(code: string | number, error: unknown): ApiResponse<null> {
  if (code === "VALIDATION") {
    const rawMessage = error instanceof Error ? error.message : String(error);
    return respond(`Validation failed: ${formatValidationMessage(rawMessage)}`, null, {
      success: false,
      status: 422,
      code: "VALIDATION_FAILED",
    });
  }
  const mappedCode = ELYSIA_CODE_MAP[code] as ErrorCode | undefined;
  if (mappedCode) {
    const descriptor = ERROR_CODES[mappedCode];
    const appendsDetail = mappedCode === "INTERNAL_SERVER_ERROR" || mappedCode === "UNKNOWN";
    const detail =
      appendsDetail && error instanceof Error && error.message.length > 0 ? `: ${error.message}` : "";
    return respond(`${descriptor.message}${detail}`, null, {
      success: false,
      status: descriptor.status,
      code: mappedCode,
    });
  }
  const classified = classifyPm2Error(error);
  return respond(classified.message, null, { success: false, status: classified.status, code: classified.code });
}