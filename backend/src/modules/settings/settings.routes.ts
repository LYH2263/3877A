import fs from "node:fs";
import path from "node:path";

import bcrypt from "bcryptjs";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { withMediaPrefix } from "../../utils/post-mapper";
import { fail, ok } from "../../utils/response";

const profileSchema = z
  .object({
    nickname: z.string().trim().min(2, "昵称至少 2 个字符").max(24, "昵称最多 24 个字符").optional(),
    bio: z.string().trim().max(160, "简介最多 160 字").optional(),
    avatarUrl: z.string().trim().max(500, "头像地址过长").optional()
  })
  .superRefine((value, ctx) => {
    if (value.nickname === undefined && value.bio === undefined && value.avatarUrl === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "至少修改一个字段"
      });
    }

    if (value.avatarUrl !== undefined && value.avatarUrl.length > 0) {
      const isHttpUrl = /^https?:\/\//i.test(value.avatarUrl);
      const isUploadPath = value.avatarUrl.startsWith("/uploads/");
      if (!isHttpUrl && !isUploadPath) {
        ctx.addIssue({
          code: "custom",
          path: ["avatarUrl"],
          message: "头像地址需为 http(s) 链接或 /uploads/ 开头路径"
        });
      }

      if (isHttpUrl) {
        try {
          new URL(value.avatarUrl);
        } catch {
          ctx.addIssue({
            code: "custom",
            path: ["avatarUrl"],
            message: "请输入有效头像链接"
          });
        }
      }
    }
  });

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z.string().min(8, "新密码至少 8 位").max(64, "新密码最多 64 位")
  })
  .superRefine((value, ctx) => {
    if (!/[A-Za-z]/.test(value.newPassword) || !/\d/.test(value.newPassword)) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "新密码需包含字母和数字"
      });
    }

    if (value.currentPassword === value.newPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "新密码不能与当前密码相同"
      });
    }
  });

const notificationSchema = z.object({
  notifyLike: z.boolean(),
  notifyComment: z.boolean(),
  notifyRepost: z.boolean(),
  notifyFollow: z.boolean()
});

const avatarUploadDir = path.resolve(env.UPLOAD_DIR, "avatar");
fs.mkdirSync(avatarUploadDir, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, avatarUploadDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".png";
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      cb(null, filename);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("仅支持图片文件"));
      return;
    }
    cb(null, true);
  }
});

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

settingsRouter.get("/me", async (req, res) => {
  const userId = req.auth!.userId;

  const [user, settings] = await prisma.$transaction([
    prisma.user.findUnique({
      where: { id: userId }
    }),
    prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId }
    })
  ]);

  if (!user) {
    fail(res, 404, "用户不存在");
    return;
  }

  ok(res, {
    profile: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatarUrl: withMediaPrefix(user.avatarUrl),
      level: user.level,
      bio: user.bio,
      followersCount: user.followersCount,
      followingCount: user.followingCount,
      createdAt: user.createdAt
    },
    notifications: {
      notifyLike: settings.notifyLike,
      notifyComment: settings.notifyComment,
      notifyRepost: settings.notifyRepost,
      notifyFollow: settings.notifyFollow
    }
  });
});

settingsRouter.post("/avatar", (req, res) => {
  avatarUpload.single("avatar")(req, res, async (error: unknown) => {
    if (error) {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        fail(res, 400, "头像图片大小不能超过 5MB");
        return;
      }

      if (error instanceof Error) {
        fail(res, 400, error.message || "头像上传失败");
        return;
      }

      fail(res, 400, "头像上传失败");
      return;
    }

    if (!req.file) {
      fail(res, 400, "请先选择头像图片");
      return;
    }

    const relativeUrl = `/uploads/avatar/${req.file.filename}`;

    const updated = await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { avatarUrl: relativeUrl }
    });

    ok(
      res,
      {
        profile: {
          id: updated.id,
          email: updated.email,
          nickname: updated.nickname,
          avatarUrl: withMediaPrefix(updated.avatarUrl),
          level: updated.level,
          bio: updated.bio,
          followersCount: updated.followersCount,
          followingCount: updated.followingCount,
          createdAt: updated.createdAt
        }
      },
      "头像上传成功"
    );
  });
});

settingsRouter.patch("/profile", async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? "参数错误", parsed.error.flatten());
    return;
  }

  const payload = parsed.data;
  const userId = req.auth!.userId;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(payload.nickname !== undefined ? { nickname: payload.nickname } : {}),
      ...(payload.bio !== undefined ? { bio: payload.bio.length > 0 ? payload.bio : null } : {}),
      ...(payload.avatarUrl !== undefined ? { avatarUrl: payload.avatarUrl.length > 0 ? payload.avatarUrl : null } : {})
    }
  });

  ok(res, {
    profile: {
      id: updated.id,
      email: updated.email,
      nickname: updated.nickname,
      avatarUrl: withMediaPrefix(updated.avatarUrl),
      level: updated.level,
      bio: updated.bio,
      followersCount: updated.followersCount,
      followingCount: updated.followingCount,
      createdAt: updated.createdAt
    }
  }, "资料已更新");
});

settingsRouter.post("/password", async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? "参数错误", parsed.error.flatten());
    return;
  }

  const userId = req.auth!.userId;
  const credential = await prisma.userCredential.findUnique({
    where: { userId }
  });

  if (!credential) {
    fail(res, 404, "用户凭证不存在");
    return;
  }

  const matched = await bcrypt.compare(parsed.data.currentPassword, credential.passwordHash);
  if (!matched) {
    fail(res, 400, "当前密码错误");
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.userCredential.update({
    where: { userId },
    data: { passwordHash }
  });

  ok(res, null, "密码修改成功");
});

settingsRouter.patch("/notifications", async (req, res) => {
  const parsed = notificationSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? "参数错误", parsed.error.flatten());
    return;
  }

  const settings = await prisma.userSettings.upsert({
    where: { userId: req.auth!.userId },
    update: parsed.data,
    create: {
      userId: req.auth!.userId,
      ...parsed.data
    }
  });

  ok(
    res,
    {
      notifyLike: settings.notifyLike,
      notifyComment: settings.notifyComment,
      notifyRepost: settings.notifyRepost,
      notifyFollow: settings.notifyFollow
    },
    "通知偏好已更新"
  );
});
