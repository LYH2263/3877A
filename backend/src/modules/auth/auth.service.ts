import type { Response } from "express";

import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { parseDurationToMs } from "../../utils/date";
import { sha256, signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/auth";

export async function issueAuthCookies(res: Response, userId: number, userAgent?: string, ipAddress?: string) {
  const session = await prisma.authSession.create({
    data: {
      userId,
      refreshTokenHash: "",
      userAgent,
      ipAddress,
      expiresAt: new Date(Date.now() + parseDurationToMs(env.REFRESH_TOKEN_EXPIRES_IN))
    }
  });

  const accessToken = signAccessToken(userId, session.id);
  const refreshToken = signRefreshToken(userId, session.id);

  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + parseDurationToMs(env.REFRESH_TOKEN_EXPIRES_IN))
    }
  });

  setAuthCookies(res, accessToken, refreshToken);

  return {
    sessionId: session.id,
    accessToken,
    refreshToken
  };
}

export async function rotateAuthCookies(res: Response, refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);

  if (payload.type !== "refresh") {
    throw new Error("无效的刷新令牌");
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
    throw new Error("登录状态已过期");
  }

  if (session.refreshTokenHash !== sha256(refreshToken)) {
    throw new Error("刷新令牌校验失败");
  }

  const nextAccessToken = signAccessToken(payload.userId, payload.sessionId);
  const nextRefreshToken = signRefreshToken(payload.userId, payload.sessionId);

  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: sha256(nextRefreshToken),
      expiresAt: new Date(Date.now() + parseDurationToMs(env.REFRESH_TOKEN_EXPIRES_IN))
    }
  });

  setAuthCookies(res, nextAccessToken, nextRefreshToken);

  return payload;
}

export async function revokeSessionByRefreshToken(refreshToken: string | undefined) {
  if (!refreshToken) {
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);

    await prisma.authSession.updateMany({
      where: {
        id: payload.sessionId,
        userId: payload.userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  } catch {
    // ignore invalid refresh token during logout
  }
}

export function clearAuthCookies(res: Response) {
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/"
  };

  res.clearCookie("access_token", options);
  res.clearCookie("refresh_token", options);
}

function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const baseCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/"
  };

  res.cookie("access_token", accessToken, {
    ...baseCookieOptions,
    maxAge: parseDurationToMs(env.ACCESS_TOKEN_EXPIRES_IN)
  });

  res.cookie("refresh_token", refreshToken, {
    ...baseCookieOptions,
    maxAge: parseDurationToMs(env.REFRESH_TOKEN_EXPIRES_IN)
  });
}
