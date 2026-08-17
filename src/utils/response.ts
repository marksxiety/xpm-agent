import type { ApiResponse } from "../types";

export interface RespondOptions {
    success?: boolean;
    status?: number;
}

export const respond = <T>(message: string, info: T | null = null, options: RespondOptions = {}): ApiResponse<T> => {
    const success = options.success ?? true;
    return {
        success,
        message,
        info,
        status: options.status ?? (success ? 200 : 500),
    };
};
