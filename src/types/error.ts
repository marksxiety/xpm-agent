export type ErrorCode =
  | "PROCESS_NOT_FOUND"
  | "SCRIPT_NOT_FOUND"
  | "PM2_DAEMON_UNAVAILABLE"
  | "PM2_OPERATION_FAILED"
  | "INVALID_PROCESS_ID"
  | "INVALID_PROCESS_CONFIGURATION"
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "PARSE"
  | "INVALID_COOKIE_SIGNATURE"
  | "INVALID_FILE_TYPE"
  | "CORS_ORIGIN_NOT_ALLOWED"
  | "INTERNAL_SERVER_ERROR"
  | "UNKNOWN";

export interface ApiErrorDescriptor {
  status: number;
  message: string;
}

export interface ClassifiedError extends ApiErrorDescriptor {
  code: ErrorCode;
}

export const ERROR_CODES: Record<ErrorCode, ApiErrorDescriptor> = {
  PROCESS_NOT_FOUND: { status: 404, message: "Process not found" },
  SCRIPT_NOT_FOUND: { status: 400, message: "Script not found — check the 'script' path in your request" },
  PM2_DAEMON_UNAVAILABLE: { status: 503, message: "Cannot connect to PM2 daemon" },
  PM2_OPERATION_FAILED: { status: 500, message: "PM2 operation failed" },
  INVALID_PROCESS_ID: { status: 400, message: "Invalid process id" },
  INVALID_PROCESS_CONFIGURATION: { status: 422, message: "Invalid process configuration" },
  VALIDATION_FAILED: { status: 422, message: "Validation failed" },
  UNAUTHORIZED: { status: 401, message: "Unauthorized" },
  NOT_FOUND: { status: 404, message: "Route not found" },
  PARSE: { status: 400, message: "Malformed request body" },
  INVALID_COOKIE_SIGNATURE: { status: 401, message: "Invalid cookie signature" },
  INVALID_FILE_TYPE: { status: 400, message: "Invalid file type" },
  CORS_ORIGIN_NOT_ALLOWED: { status: 403, message: "Origin not allowed by CORS policy" },
  INTERNAL_SERVER_ERROR: { status: 500, message: "Internal server error" },
  UNKNOWN: { status: 500, message: "Unexpected error" },
};

export const ELYSIA_CODE_MAP: Record<string, ErrorCode> = {
  VALIDATION: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  PARSE: "PARSE",
  INVALID_COOKIE_SIGNATURE: "INVALID_COOKIE_SIGNATURE",
  INVALID_FILE_TYPE: "INVALID_FILE_TYPE",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  UNKNOWN: "UNKNOWN",
};