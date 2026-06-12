import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";

import { env } from "../config/env";

interface TokenPayload {
  userId: number;
  sessionId: number;
  type: "access" | "refresh";
}

export function signAccessToken(userId: number, sessionId: number): string {
  const expiresIn = env.ACCESS_TOKEN_EXPIRES_IN as SignOptions["expiresIn"];
  return jwt.sign({ userId, sessionId, type: "access" } satisfies TokenPayload, env.JWT_ACCESS_SECRET, {
    expiresIn
  });
}

export function signRefreshToken(userId: number, sessionId: number): string {
  const expiresIn = env.REFRESH_TOKEN_EXPIRES_IN as SignOptions["expiresIn"];
  return jwt.sign({ userId, sessionId, type: "refresh" } satisfies TokenPayload, env.JWT_REFRESH_SECRET, {
    expiresIn
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
