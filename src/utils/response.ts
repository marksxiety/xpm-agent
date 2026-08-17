import type { ApiResponse } from "../types";

export const respond = <T>(
  message: string,
  info: T | null = null,
  overrides: Partial<Pick<ApiResponse<T>, "success" | "status">> = {},
): ApiResponse<T> => {
  const success = overrides.success ?? true;
  return {
    success,
    message,
    info,
    status: overrides.status ?? (success ? 200 : 500),
  };
};