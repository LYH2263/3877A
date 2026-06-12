import fs from "node:fs";
import path from "node:path";

import { FeedChannel, MediaType } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { fail, ok } from "../../utils/response";
import { withMediaPrefix } from "../../utils/post-mapper";
import { toSingleFeedItem } from "../posts/post.presenter";

const mediaDir = path.resolve(env.UPLOAD_DIR, "media");
fs.mkdirSync(mediaDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, mediaDir);
  },
  filename: (_req, file, cb) => {
    const suffix = path.extname(file.originalname) || ".bin";
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${suffix}`;
    cb(null, name);
  }
});

const upload = multer({ storage, limits: { files: 9, fileSize: 30 * 1024 * 1024 } });

const MAX_DRAFTS_PER_USER = 50;

const draftContentSchema = z.object({
  content: z.string().trim().min(3, "正文至少 3 个字符").max(1000, "正文最多 1000 个字符").optional().default(""),
  channel: z.enum(["hot", "city"]).default("hot")
});

const draftCreateSchema = draftContentSchema;

export const draftsRouter = Router();

draftsRouter.get("/", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;

  const drafts = await prisma.draft.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      media: {
        orderBy: [{ sortOrder: "asc" }]
      }
    }
  });

  ok(
    res,
    drafts.map((draft) => ({
      id: draft.id,
      content: draft.content,
      channel: draft.channel,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      media: draft.media.map((m) => ({
        id: m.id,
        type: m.type,
        url: withMediaPrefix(m.url),
        sortOrder: m.sortOrder
      })),
      mediaCount: draft.media.length
    }))
  );
});

draftsRouter.get("/:id", requireAuth, async (req, res) => {
  const draftId = Number(req.params.id);
  if (!Number.isFinite(draftId)) {
    fail(res, 400, "无效的草稿ID");
    return;
  }

  const userId = req.auth!.userId;

  const draft = await prisma.draft.findUnique({
    where: { id: draftId, userId },
    include: {
      media: {
        orderBy: [{ sortOrder: "asc" }]
      }
    }
  });

  if (!draft) {
    fail(res, 404, "草稿不存在");
    return;
  }

  ok(res, {
    id: draft.id,
    content: draft.content,
    channel: draft.channel,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    media: draft.media.map((m) => ({
      id: m.id,
      type: m.type,
      url: withMediaPrefix(m.url),
      sortOrder: m.sortOrder
    }))
  });
});

draftsRouter.post("/", requireAuth, upload.array("media", 9), async (req, res) => {
  const parsed = draftCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? "参数错误", parsed.error.flatten());
    return;
  }

  const userId = req.auth!.userId;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];

  const videos = files.filter((file) => file.mimetype.startsWith("video/"));
  const images = files.filter((file) => file.mimetype.startsWith("image/"));

  if (videos.length > 1) {
    fail(res, 400, "最多上传 1 个视频");
    return;
  }

  if (videos.length === 1 && images.length > 0) {
    fail(res, 400, "视频和图片不能混传");
    return;
  }

  if (images.length > 9) {
    fail(res, 400, "最多上传 9 张图片");
    return;
  }

  const draftCount = await prisma.draft.count({ where: { userId } });
  if (draftCount >= MAX_DRAFTS_PER_USER) {
    fail(res, 409, `草稿数量已达上限（${MAX_DRAFTS_PER_USER} 条），请先删除部分草稿`);
    return;
  }

  const draft = await prisma.draft.create({
    data: {
      userId,
      content: parsed.data.content,
      channel: parsed.data.channel as FeedChannel,
      media: {
        create: files.map((file, index) => ({
          type: file.mimetype.startsWith("video/") ? MediaType.video : MediaType.image,
          url: `/uploads/media/${file.filename}`,
          sortOrder: index
        }))
      }
    },
    include: {
      media: {
        orderBy: [{ sortOrder: "asc" }]
      }
    }
  });

  ok(
    res,
    {
      id: draft.id,
      content: draft.content,
      channel: draft.channel,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      media: draft.media.map((m) => ({
        id: m.id,
        type: m.type,
        url: withMediaPrefix(m.url),
        sortOrder: m.sortOrder
      }))
    },
    "草稿保存成功",
    201
  );
});

draftsRouter.put("/:id", requireAuth, upload.array("media", 9), async (req, res) => {
  const draftId = Number(req.params.id);
  if (!Number.isFinite(draftId)) {
    fail(res, 400, "无效的草稿ID");
    return;
  }

  const parsed = draftContentSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? "参数错误", parsed.error.flatten());
    return;
  }

  const userId = req.auth!.userId;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];

  const existing = await prisma.draft.findUnique({
    where: { id: draftId, userId },
    include: { media: true }
  });

  if (!existing) {
    fail(res, 404, "草稿不存在");
    return;
  }

  if (files.length > 0) {
    const videos = files.filter((file) => file.mimetype.startsWith("video/"));
    const images = files.filter((file) => file.mimetype.startsWith("image/"));

    if (videos.length > 1) {
      fail(res, 400, "最多上传 1 个视频");
      return;
    }

    if (videos.length === 1 && images.length > 0) {
      fail(res, 400, "视频和图片不能混传");
      return;
    }

    if (images.length > 9) {
      fail(res, 400, "最多上传 9 张图片");
      return;
    }
  }

  const draft = await prisma.$transaction(async (tx) => {
    if (files.length > 0) {
      await tx.draftMedia.deleteMany({ where: { draftId } });
    }

    return tx.draft.update({
      where: { id: draftId, userId },
      data: {
        content: parsed.data.content,
        channel: parsed.data.channel as FeedChannel,
        ...(files.length > 0
          ? {
              media: {
                create: files.map((file, index) => ({
                  type: file.mimetype.startsWith("video/") ? MediaType.video : MediaType.image,
                  url: `/uploads/media/${file.filename}`,
                  sortOrder: index
                }))
              }
            }
          : {})
      },
      include: {
        media: {
          orderBy: [{ sortOrder: "asc" }]
        }
      }
    });
  });

  ok(res, {
    id: draft.id,
    content: draft.content,
    channel: draft.channel,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    media: draft.media.map((m) => ({
      id: m.id,
      type: m.type,
      url: withMediaPrefix(m.url),
      sortOrder: m.sortOrder
    }))
  }, "草稿更新成功");
});

draftsRouter.delete("/:id", requireAuth, async (req, res) => {
  const draftId = Number(req.params.id);
  if (!Number.isFinite(draftId)) {
    fail(res, 400, "无效的草稿ID");
    return;
  }

  const userId = req.auth!.userId;

  const existing = await prisma.draft.findUnique({
    where: { id: draftId, userId }
  });

  if (!existing) {
    fail(res, 404, "草稿不存在");
    return;
  }

  await prisma.draft.delete({ where: { id: draftId, userId } });

  ok(res, null, "草稿已删除");
});

draftsRouter.post("/:id/publish", requireAuth, async (req, res) => {
  const draftId = Number(req.params.id);
  if (!Number.isFinite(draftId)) {
    fail(res, 400, "无效的草稿ID");
    return;
  }

  const userId = req.auth!.userId;

  const draft = await prisma.draft.findUnique({
    where: { id: draftId, userId },
    include: { media: true }
  });

  if (!draft) {
    fail(res, 404, "草稿不存在");
    return;
  }

  if (draft.content.trim().length < 3) {
    fail(res, 400, "正文至少 3 个字符");
    return;
  }

  if (draft.content.length > 1000) {
    fail(res, 400, "正文最多 1000 个字符");
    return;
  }

  const topicMatches = Array.from(draft.content.matchAll(/#([^#\s]+)#/g)).map((item) => item[1]);
  const topicKeywords = Array.from(new Set(topicMatches)).slice(0, 8);

  const post = await prisma.$transaction(async (tx) => {
    const createdPost = await tx.post.create({
      data: {
        authorId: userId,
        content: draft.content,
        source: "Web",
        channel: draft.channel,
        hotScore: 0,
        media: {
          create: draft.media.map((m) => ({
            type: m.type,
            url: m.url,
            sortOrder: m.sortOrder
          }))
        }
      }
    });

    for (const keyword of topicKeywords) {
      const topic = await tx.topic.upsert({
        where: { keyword },
        create: {
          keyword,
          rank: 999,
          heat: 10000,
          tag: "新"
        },
        update: {
          heat: {
            increment: 1000
          }
        }
      });

      await tx.postTopic.upsert({
        where: {
          postId_topicId: {
            postId: createdPost.id,
            topicId: topic.id
          }
        },
        update: {},
        create: {
          postId: createdPost.id,
          topicId: topic.id
        }
      });
    }

    await tx.draft.delete({ where: { id: draftId } });

    return createdPost;
  });

  const item = await toSingleFeedItem(post.id, userId);
  if (!item) {
    fail(res, 500, "发布成功但读取失败");
    return;
  }

  ok(res, item, "发布成功", 201);
});
