import type { ApiResponse } from "../types";

export const respond = <T>(
  message: string,
  info: T | null = null,
  overrides: Partial<Pick<ApiResponse<T>, "success" | "status" | "code">> = {},
): ApiResponse<T> => {
  const success = overrides.success ?? true;
  return {
    success,
    message,
    info,
    status: overrides.status ?? (success ? 200 : 500),
    ...(overrides.code ? { code: overrides.code } : {}),
  };
};