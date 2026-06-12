import type { NextFunction, Request, Response } from "express";

import { prisma } from "../config/prisma";
import { fail } from "../utils/response";
import { verifyAccessToken } from "../utils/auth";

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.access_token as string | undefined;
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.type !== "access") {
      next();
      return;
    }

    const session = await prisma.authSession.findFirst({
      where: {
        id: payload.sessionId,
        userId: payload.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      }
    });

    if (!session) {
      next();
      return;
    }

    req.auth = {
      userId: payload.userId,
      sessionId: payload.sessionId
    };
    next();
  } catch {
    next();
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    fail(res, 401, "请先登录");
    return;
  }
  next();
}
