import axios from "axios";

import type { ApiErrorCode, ApiErrorResponse } from "@/types/models";

export interface ParsedApiError {
  status: number | null;
  code: ApiErrorCode | string | number | null;
  message: string;
}

export function parseApiError(error: unknown): ParsedApiError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? null;
    const data = (error.response?.data ?? null) as ApiErrorResponse | null;

    return {
      status,
      code: data?.code ?? null,
      message: data?.message ?? error.message ?? "请求失败"
    };
  }

  if (error instanceof Error) {
    return {
      status: null,
      code: null,
      message: error.message
    };
  }

  return {
    status: null,
    code: null,
    message: "请求失败"
  };
}
