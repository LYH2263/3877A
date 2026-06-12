import bcrypt from "bcryptjs";
import { Router } from "express";

import { prisma } from "../../config/prisma";
import { validateBody } from "../../middleware/validate";
import { fail, ok } from "../../utils/response";
import { withMediaPrefix } from "../../utils/post-mapper";
import { loginSchema, registerSchema } from "./auth.schema";
import { clearAuthCookies, issueAuthCookies, revokeSessionByRefreshToken, rotateAuthCookies } from "./auth.service";

export const authRouter = Router();

authRouter.post("/register", validateBody(registerSchema), async (req, res) => {
  const { email, password, nickname } = req.body;

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    fail(res, 409, "邮箱已注册", undefined, "CONFLICT");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      nickname,
      avatarUrl: "/uploads/seed/avatar-1.svg",
      level: "会员V1",
      bio: "这个人很懒，还没有留下简介",
      settings: {
        create: {}
      },
      credentials: {
        create: {
          passwordHash
        }
      }
    }
  });

  await issueAuthCookies(res, user.id, req.headers["user-agent"], req.ip);

  ok(res, {
    user: {
      ...user,
      avatarUrl: withMediaPrefix(user.avatarUrl)
    }
  }, "注册成功", 201);
});

authRouter.post("/login", validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      credentials: true
    }
  });

  if (!user || !user.credentials) {
    fail(res, 401, "邮箱或密码错误", undefined, "UNAUTHORIZED");
    return;
  }

  const matched = await bcrypt.compare(password, user.credentials.passwordHash);
  if (!matched) {
    fail(res, 401, "邮箱或密码错误", undefined, "UNAUTHORIZED");
    return;
  }

  await issueAuthCookies(res, user.id, req.headers["user-agent"], req.ip);

  ok(res, {
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatarUrl: withMediaPrefix(user.avatarUrl),
      level: user.level,
      bio: user.bio,
      followersCount: user.followersCount,
      followingCount: user.followingCount,
      createdAt: user.createdAt
    }
  });
});

authRouter.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies?.refresh_token as string | undefined;
  if (!refreshToken) {
    fail(res, 401, "缺少刷新令牌", undefined, "SESSION_EXPIRED");
    return;
  }

  try {
    const payload = await rotateAuthCookies(res, refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      fail(res, 404, "用户不存在", undefined, "NOT_FOUND");
      return;
    }

    ok(res, {
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        avatarUrl: withMediaPrefix(user.avatarUrl),
        level: user.level,
        bio: user.bio,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        createdAt: user.createdAt
      }
    });
  } catch {
    clearAuthCookies(res);
    fail(res, 401, "登录状态已失效，请重新登录", undefined, "SESSION_EXPIRED");
  }
});

authRouter.post("/logout", async (req, res) => {
  const refreshToken = req.cookies?.refresh_token as string | undefined;
  await revokeSessionByRefreshToken(refreshToken);
  clearAuthCookies(res);
  ok(res, null, "已退出登录");
});

authRouter.get("/me", async (req, res) => {
  if (!req.auth) {
    fail(res, 401, "未登录", undefined, "UNAUTHORIZED");
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.auth.userId } });
  if (!user) {
    fail(res, 404, "用户不存在", undefined, "NOT_FOUND");
    return;
  }

  ok(res, {
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatarUrl: withMediaPrefix(user.avatarUrl),
      level: user.level,
      bio: user.bio,
      followersCount: user.followersCount,
      followingCount: user.followingCount,
      createdAt: user.createdAt
    }
  });
});
