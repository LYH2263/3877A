import type { Request, Response } from "express";

import { fail } from "../utils/response";

export function notFound(_req: Request, res: Response) {
  fail(res, 404, "接口不存在");
}
