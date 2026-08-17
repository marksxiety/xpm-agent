import type { ApiResponse } from "../types";

export const SuccessResponse = <T>(message: string, info: T): ApiResponse<T> => ({
  success: true,
  message,
  info,
});
