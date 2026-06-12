import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { fail } from "../utils/response";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    fail(res, 400, "请求参数不合法", error.flatten());
    return;
  }

  if (error instanceof Error) {
    fail(res, 500, error.message);
    return;
  }

  fail(res, 500, "服务器异常");
}
