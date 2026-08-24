import { ERROR_CODES, type ClassifiedError } from "../types/error";

export function classifyPm2Error(error: unknown): ClassifiedError {
  const rawMessage = error instanceof Error ? error.message : String((error as any)?.msg ?? error);
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