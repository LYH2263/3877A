import fs from "node:fs";
import path from "node:path";

import { FeedChannel, MediaType, NotificationType } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { fail, ok } from "../../utils/response";
import { toSingleFeedItem } from "./post.presenter";
import { withMediaPrefix } from "../../utils/post-mapper";
import { createNotificationIfAllowed } from "../messages/notification.service";
import { isEitherBlocked, getMutuallyBlockedUserIds } from "../../utils/block";

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

const createPostSchema = z.object({
  content: z.string().trim().min(3, "正文至少 3 个字符").max(1000, "正文最多 1000 个字符"),
  channel: z.enum(["hot", "city"]).default("hot")
});

const commentBodySchema = z.object({
  content: z.string().trim().min(1, "评论不能为空").max(500, "评论最多 500 字"),
  parentId: z.coerce.number().int().positive().optional()
});

const commentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(30).default(10)
});

const repostBodySchema = z.object({
  content: z.string().trim().max(280, "短评最多 280 字").optional().default("")
});

const editPostSchema = z.object({
  content: z.string().trim().min(3, "正文至少 3 个字符").max(1000, "正文最多 1000 个字符"),
  mediaOrder: z.array(z.number()).optional()
});

function calculateHotScore(likesCount: number, commentsCount: number, repostsCount: number) {
  return likesCount * 4 + commentsCount * 6 + repostsCount * 8;
}

export const postsRouter = Router();

postsRouter.post("/", requireAuth, upload.array("media", 9), async (req, res) => {
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? "参数错误", parsed.error.flatten());
    return;
  }

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

  const topicMatches = Array.from(parsed.data.content.matchAll(/#([^#\s]+)#/g)).map((item) => item[1]);
  const topicKeywords = Array.from(new Set(topicMatches)).slice(0, 8);

  const post = await prisma.post.create({
    data: {
      authorId: req.auth!.userId,
      content: parsed.data.content,
      source: "Web",
      channel: parsed.data.channel as FeedChannel,
      hotScore: 0,
      media: {
        create: files.map((file, index) => ({
          type: file.mimetype.startsWith("video/") ? MediaType.video : MediaType.image,
          url: `/uploads/media/${file.filename}`,
          sortOrder: index
        }))
      }
    }
  });

  for (const keyword of topicKeywords) {
    const topic = await prisma.topic.upsert({
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

    await prisma.postTopic.upsert({
      where: {
        postId_topicId: {
          postId: post.id,
          topicId: topic.id
        }
      },
      update: {},
      create: {
        postId: post.id,
        topicId: topic.id
      }
    });
  }

  const item = await toSingleFeedItem(post.id, req.auth!.userId);
  if (!item) {
    fail(res, 500, "发布成功但读取失败");
    return;
  }

  ok(res, item, "发布成功", 201);
});

postsRouter.get("/:postId", async (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) {
    fail(res, 400, "无效的动态ID");
    return;
  }

  const rawPost = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, isDeleted: true, repostOfId: true, authorId: true }
  });

  if (!rawPost) {
    fail(res, 404, "动态不存在");
    return;
  }

  if (rawPost.isDeleted) {
    fail(res, 404, "动态不存在");
    return;
  }

  const item = await toSingleFeedItem(postId, req.auth?.userId);
  if (!item) {
    fail(res, 404, "动态不存在");
    return;
  }

  ok(res, item);
});

postsRouter.post("/:postId/like", requireAuth, async (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) {
    fail(res, 400, "无效的动态ID");
    return;
  }

  const postExists = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, isDeleted: true } });
  if (!postExists || postExists.isDeleted) {
    fail(res, 404, "动态不存在");
    return;
  }

  const userId = req.auth!.userId;

  const blocked = await isEitherBlocked(prisma, userId, postExists.authorId);
  if (blocked) {
    fail(res, 403, "无法点赞该动态", undefined, "FORBIDDEN");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const post = await tx.post.findUnique({
      where: { id: postId },
      select: { authorId: true, likesCount: true, commentsCount: true, repostsCount: true }
    });

    if (!post) {
      throw new Error("POST_NOT_FOUND");
    }

    const existing = await tx.like.findUnique({
      where: {
        userId_postId: {
          userId,
          postId
        }
      }
    });

    if (existing) {
      await tx.like.delete({ where: { id: existing.id } });
      const nextLikesCount = Math.max(0, post.likesCount - 1);
      await tx.post.update({
        where: { id: postId },
        data: {
          likesCount: nextLikesCount,
          hotScore: calculateHotScore(nextLikesCount, post.commentsCount, post.repostsCount)
        }
      });
    } else {
      await tx.like.create({ data: { userId, postId } });
      const nextLikesCount = post.likesCount + 1;
      await tx.post.update({
        where: { id: postId },
        data: {
          likesCount: nextLikesCount,
          hotScore: calculateHotScore(nextLikesCount, post.commentsCount, post.repostsCount)
        }
      });
      await createNotificationIfAllowed(tx, {
        targetUserId: post.authorId,
        actorUserId: userId,
        postId,
        type: NotificationType.LIKE,
        content: "赞了你的动态"
      });
    }
  });

  const item = await toSingleFeedItem(postId, userId);
  if (!item) {
    fail(res, 404, "动态不存在");
    return;
  }

  ok(res, item);
});

postsRouter.post("/:postId/repost", requireAuth, async (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) {
    fail(res, 400, "无效的动态ID");
    return;
  }

  const parsed = repostBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? "参数错误", parsed.error.flatten());
    return;
  }

  const repostComment = parsed.data.content.trim();

  const postExists = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, isDeleted: true } });
  if (!postExists || postExists.isDeleted) {
    fail(res, 404, "动态不存在");
    return;
  }

  const userId = req.auth!.userId;

  const blocked = await isEitherBlocked(prisma, userId, postExists.authorId);
  if (blocked) {
    fail(res, 403, "无法转发该动态", undefined, "FORBIDDEN");
    return;
  }

  let createdRepostPostId: number | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: { authorId: true, likesCount: true, commentsCount: true, repostsCount: true, channel: true }
      });

      if (!post) {
        throw new Error("POST_NOT_FOUND");
      }

      const existing = await tx.repost.findUnique({
        where: {
          userId_postId: {
            userId,
            postId
          }
        }
      });

      if (existing) {
        throw new Error("ALREADY_REPOSTED");
      }

      const repostPost = await tx.post.create({
        data: {
          authorId: userId,
          repostOfId: postId,
          content: repostComment || "转发动态",
          source: "转发",
          channel: post.channel
        },
        select: { id: true }
      });
      createdRepostPostId = repostPost.id;

      await tx.repost.create({
        data: {
          userId,
          postId,
          content: repostComment || null
        }
      });

      const nextRepostsCount = post.repostsCount + 1;
      await tx.post.update({
        where: { id: postId },
        data: {
          repostsCount: nextRepostsCount,
          hotScore: calculateHotScore(post.likesCount, post.commentsCount, nextRepostsCount)
        }
      });

      await createNotificationIfAllowed(tx, {
        targetUserId: post.authorId,
        actorUserId: userId,
        postId,
        type: NotificationType.REPOST,
        content: "转发了你的动态"
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_REPOSTED") {
      fail(res, 409, "你已经转发过这条动态，可到个人主页查看");
      return;
    }

    if (error instanceof Error && error.message === "POST_NOT_FOUND") {
      fail(res, 404, "动态不存在");
      return;
    }

    throw error;
  }

  if (!createdRepostPostId) {
    fail(res, 500, "转发失败，请稍后重试");
    return;
  }

  const [sourcePost, repostPost] = await Promise.all([toSingleFeedItem(postId, userId), toSingleFeedItem(createdRepostPostId, userId)]);
  if (!sourcePost || !repostPost) {
    fail(res, 404, "动态不存在");
    return;
  }

  ok(
    res,
    {
      sourcePost,
      repostPost
    },
    "转发成功"
  );
});

const repliesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(30).default(5)
});

interface CommentWithUser {
  id: number;
  content: string;
  createdAt: Date;
  repliesCount: number;
  user: {
    id: number;
    nickname: string;
    avatarUrl: string | null;
  };
}

interface ReplyWithUserAndParent {
  id: number;
  content: string;
  createdAt: Date;
  parentId: number | null;
  user: {
    id: number;
    nickname: string;
    avatarUrl: string | null;
  };
  parent?: {
    user: {
      id: number;
      nickname: string;
      avatarUrl: string | null;
    };
  } | null;
}

function mapCommentWithReplies(comment: CommentWithUser, replies: ReplyWithUserAndParent[]) {
  return {
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt,
    repliesCount: comment.repliesCount,
    parentId: null as number | null,
    replyToUser: null,
    user: {
      id: comment.user.id,
      nickname: comment.user.nickname,
      avatarUrl: withMediaPrefix(comment.user.avatarUrl)
    },
    replies: replies.map((reply: ReplyWithUserAndParent) => ({
      id: reply.id,
      content: reply.content,
      createdAt: reply.createdAt,
      parentId: reply.parentId,
      user: {
        id: reply.user.id,
        nickname: reply.user.nickname,
        avatarUrl: withMediaPrefix(reply.user.avatarUrl)
      },
      replyToUser: reply.parent && reply.parent.user
        ? {
            id: reply.parent.user.id,
            nickname: reply.parent.user.nickname,
            avatarUrl: withMediaPrefix(reply.parent.user.avatarUrl)
          }
        : null
    })),
    repliesNextCursor: null as string | null
  };
}

postsRouter.get("/:postId/comments", async (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) {
    fail(res, 400, "无效的动态ID");
    return;
  }

  const postExists = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, isDeleted: true } });
  if (!postExists || postExists.isDeleted) {
    fail(res, 404, "动态不存在");
    return;
  }

  const { cursor, limit } = commentsQuerySchema.parse(req.query);
  const cursorId = decodeCursor(cursor);
  const currentUserId = req.auth?.userId;

  const blockedUserIds = currentUserId ? await getMutuallyBlockedUserIds(prisma, currentUserId) : [];

  const comments: CommentWithUser[] = await prisma.comment.findMany({
    where: {
      postId,
      parentId: null,
      userId: { notIn: blockedUserIds },
      ...(cursorId ? { id: { lt: cursorId } } : {})
    },
    orderBy: [{ id: "desc" }],
    take: limit + 1,
    include: {
      user: {
        select: {
          id: true,
          nickname: true,
          avatarUrl: true
        }
      }
    }
  });

  const hasMore = comments.length > limit;
  const slice = hasMore ? comments.slice(0, limit) : comments;

  const commentIds = slice.map((c: CommentWithUser) => c.id);
  const allPreviewReplies: ReplyWithUserAndParent[] = await prisma.comment.findMany({
    where: {
      parentId: { in: commentIds },
      userId: { notIn: blockedUserIds }
    },
    orderBy: [{ id: "asc" }],
    take: 3 * commentIds.length,
    include: {
      user: {
        select: {
          id: true,
          nickname: true,
          avatarUrl: true
        }
      },
      parent: {
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              avatarUrl: true
            }
          }
        }
      }
    }
  });

  const repliesByParent = new Map<number, ReplyWithUserAndParent[]>();
  for (const reply of allPreviewReplies) {
    if (!reply.parentId) continue;
    if (!repliesByParent.has(reply.parentId)) {
      repliesByParent.set(reply.parentId, []);
    }
    const list = repliesByParent.get(reply.parentId)!;
    if (list.length < 3) {
      list.push(reply);
    }
  }

  ok(res, {
    items: slice.map((comment) => mapCommentWithReplies(comment, repliesByParent.get(comment.id) ?? [])),
    nextCursor: hasMore ? encodeCursor(slice[slice.length - 1]?.id ?? null) : null
  });
});

postsRouter.get("/:postId/comments/:commentId/replies", async (req, res) => {
  const postId = Number(req.params.postId);
  const commentId = Number(req.params.commentId);
  if (!Number.isFinite(postId) || !Number.isFinite(commentId)) {
    fail(res, 400, "无效的ID");
    return;
  }

  const postExists = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, isDeleted: true } });
  if (!postExists || postExists.isDeleted) {
    fail(res, 404, "动态不存在");
    return;
  }

  const parentComment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, postId: true, parentId: true }
  });
  if (!parentComment) {
    fail(res, 404, "评论不存在");
    return;
  }
  if (parentComment.postId !== postId) {
    fail(res, 400, "评论不属于该动态");
    return;
  }
  if (parentComment.parentId !== null) {
    fail(res, 400, "仅一级评论支持回复分页");
    return;
  }

  const { cursor, limit } = repliesQuerySchema.parse(req.query);
  const cursorId = decodeCursor(cursor);
  const currentUserId = req.auth?.userId;

  const blockedUserIds = currentUserId ? await getMutuallyBlockedUserIds(prisma, currentUserId) : [];

  const replies: ReplyWithUserAndParent[] = await prisma.comment.findMany({
    where: {
      parentId: commentId,
      userId: { notIn: blockedUserIds },
      ...(cursorId ? { id: { gt: cursorId } } : {})
    },
    orderBy: [{ id: "asc" }],
    take: limit + 1,
    include: {
      user: {
        select: {
          id: true,
          nickname: true,
          avatarUrl: true
        }
      },
      parent: {
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              avatarUrl: true
            }
          }
        }
      }
    }
  });

  const hasMore = replies.length > limit;
  const slice = hasMore ? replies.slice(0, limit) : replies;

  ok(res, {
    items: slice.map((reply: ReplyWithUserAndParent) => ({
      id: reply.id,
      content: reply.content,
      createdAt: reply.createdAt,
      parentId: reply.parentId,
      user: {
        id: reply.user.id,
        nickname: reply.user.nickname,
        avatarUrl: withMediaPrefix(reply.user.avatarUrl)
      },
      replyToUser: reply.parent && reply.parent.user
        ? {
            id: reply.parent.user.id,
            nickname: reply.parent.user.nickname,
            avatarUrl: withMediaPrefix(reply.parent.user.avatarUrl)
          }
        : null
    })),
    nextCursor: hasMore ? encodeCursor(slice[slice.length - 1]?.id ?? null) : null
  });
});

function parseMentions(content: string): string[] {
  const mentionRegex = /@([^\s@]+?)(?=[\s，。！？、；：,.!?;:]|$)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }
  return Array.from(new Set(mentions));
}

postsRouter.post("/:postId/comments", requireAuth, async (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) {
    fail(res, 400, "无效的动态ID");
    return;
  }

  const postExists = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, isDeleted: true } });
  if (!postExists || postExists.isDeleted) {
    fail(res, 404, "动态不存在");
    return;
  }

  const parsed = commentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? "参数错误", parsed.error.flatten());
    return;
  }

  const parentId = parsed.data.parentId ?? null;
  const currentUserId = req.auth!.userId;
  const content = parsed.data.content;

  const blocked = await isEitherBlocked(prisma, currentUserId, postExists.authorId);
  if (blocked) {
    fail(res, 403, "无法评论该动态", undefined, "FORBIDDEN");
    return;
  }

  let parentComment: { id: number; userId: number; parentId: number | null } | null = null;
  if (parentId) {
    parentComment = await prisma.comment.findUnique({
      where: { id: parentId },
      select: { id: true, userId: true, parentId: true }
    });
    if (!parentComment) {
      fail(res, 404, "父评论不存在");
      return;
    }
    if (parentComment.parentId !== null) {
      fail(res, 400, "不支持多级回复，仅允许对一级评论回复");
      return;
    }
  }

  const mentionNicknames = parseMentions(content);
  const mentionedUsers = mentionNicknames.length > 0
    ? await prisma.user.findMany({
        where: { nickname: { in: mentionNicknames } },
        select: { id: true, nickname: true }
      })
    : [];

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        postId,
        userId: currentUserId,
        parentId,
        content
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true
          }
        },
        parent: {
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });

    await tx.post.update({
      where: { id: postId },
      data: {
        commentsCount: {
          increment: 1
        },
        hotScore: {
          increment: 6
        }
      }
    });

    if (parentId) {
      await tx.comment.update({
        where: { id: parentId },
        data: {
          repliesCount: {
            increment: 1
          }
        }
      });
    }

    if (mentionedUsers.length > 0) {
      await tx.commentMention.createMany({
        data: mentionedUsers.map((u) => ({
          commentId: created.id,
          userId: u.id
        })),
        skipDuplicates: true
      });
    }

    const notifiedUserIds = new Set<number>();

    if (parentComment && parentComment.userId !== currentUserId && !notifiedUserIds.has(parentComment.userId)) {
      await createNotificationIfAllowed(tx, {
        targetUserId: parentComment.userId,
        actorUserId: currentUserId,
        postId,
        type: NotificationType.COMMENT,
        content: `回复了你：${content.slice(0, 90)}`
      });
      notifiedUserIds.add(parentComment.userId);
    }

    if (postExists.authorId !== currentUserId && !notifiedUserIds.has(postExists.authorId)) {
      await createNotificationIfAllowed(tx, {
        targetUserId: postExists.authorId,
        actorUserId: currentUserId,
        postId,
        type: NotificationType.COMMENT,
        content: parentId ? `回复了动态并@了你：${content.slice(0, 90)}` : `评论了你：${content.slice(0, 90)}`
      });
      notifiedUserIds.add(postExists.authorId);
    }

    for (const mentionedUser of mentionedUsers) {
      if (mentionedUser.id !== currentUserId && !notifiedUserIds.has(mentionedUser.id)) {
        await createNotificationIfAllowed(tx, {
          targetUserId: mentionedUser.id,
          actorUserId: currentUserId,
          postId,
          type: NotificationType.COMMENT,
          content: `@了你：${content.slice(0, 90)}`
        });
        notifiedUserIds.add(mentionedUser.id);
      }
    }

    return created;
  });

  ok(
    res,
    {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      parentId: comment.parentId,
      user: {
        id: comment.user.id,
        nickname: comment.user.nickname,
        avatarUrl: withMediaPrefix(comment.user.avatarUrl)
      },
      replyToUser: comment.parent
        ? {
            id: comment.parent.user.id,
            nickname: comment.parent.user.nickname,
            avatarUrl: withMediaPrefix(comment.parent.user.avatarUrl)
          }
        : null
    },
    parentId ? "回复成功" : "评论成功",
    201
  );
});

postsRouter.put("/:postId", requireAuth, async (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) {
    fail(res, 400, "无效的动态ID");
    return;
  }

  const parsed = editPostSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? "参数错误", parsed.error.flatten());
    return;
  }

  const userId = req.auth!.userId;

  const existingPost = await prisma.post.findUnique({
    where: { id: postId },
    include: { media: true }
  });

  if (!existingPost) {
    fail(res, 404, "动态不存在");
    return;
  }

  if (existingPost.isDeleted) {
    fail(res, 404, "动态不存在");
    return;
  }

  if (existingPost.authorId !== userId) {
    fail(res, 403, "无权编辑他人动态", undefined, "FORBIDDEN");
    return;
  }

  if (existingPost.repostOfId) {
    fail(res, 400, "转发动态不支持编辑");
    return;
  }

  const mediaOrder = parsed.data.mediaOrder;
  if (mediaOrder) {
    const existingMediaIds = existingPost.media.map((m) => m.id).sort((a, b) => a - b);
    const providedIds = [...mediaOrder].sort((a, b) => a - b);
    if (existingMediaIds.length !== providedIds.length || !existingMediaIds.every((id, idx) => id === providedIds[idx])) {
      fail(res, 400, "媒体排序参数无效");
      return;
    }
  }

  const updatedPost = await prisma.$transaction(async (tx) => {
    await tx.postEditHistory.create({
      data: {
        postId,
        content: existingPost.content,
        mediaSnap: existingPost.media.map((m) => ({
          id: m.id,
          type: m.type,
          url: m.url,
          sortOrder: m.sortOrder
        }))
      }
    });

    if (mediaOrder) {
      await Promise.all(
        mediaOrder.map((mediaId, index) =>
          tx.postMedia.update({
            where: { id: mediaId },
            data: { sortOrder: index }
          })
        )
      );
    }

    const newTopicMatches = Array.from(parsed.data.content.matchAll(/#([^#\s]+)#/g)).map((item) => item[1]);
    const newTopicKeywords = Array.from(new Set(newTopicMatches)).slice(0, 8);

    const oldPostTopics = await tx.postTopic.findMany({
      where: { postId },
      include: { topic: true }
    });
    const oldKeywords = oldPostTopics.map((pt) => pt.topic.keyword);

    const keywordsToRemove = oldKeywords.filter((k) => !newTopicKeywords.includes(k));
    const keywordsToAdd = newTopicKeywords.filter((k) => !oldKeywords.includes(k));

    for (const keyword of keywordsToRemove) {
      const pt = oldPostTopics.find((item) => item.topic.keyword === keyword);
      if (pt) {
        await tx.postTopic.delete({
          where: { postId_topicId: { postId, topicId: pt.topicId } }
        });
        await tx.topic.update({
          where: { id: pt.topicId },
          data: { heat: { decrement: 1000 } }
        });
      }
    }

    for (const keyword of keywordsToAdd) {
      const topic = await tx.topic.upsert({
        where: { keyword },
        create: {
          keyword,
          rank: 999,
          heat: 10000,
          tag: "新"
        },
        update: {
          heat: { increment: 1000 }
        }
      });

      await tx.postTopic.upsert({
        where: { postId_topicId: { postId, topicId: topic.id } },
        update: {},
        create: { postId, topicId: topic.id }
      });
    }

    return tx.post.update({
      where: { id: postId },
      data: {
        content: parsed.data.content,
        isEdited: true,
        editedAt: new Date()
      },
      include: {
        media: true
      }
    });
  });

  const item = await toSingleFeedItem(updatedPost.id, userId);
  if (!item) {
    fail(res, 500, "编辑成功但读取失败");
    return;
  }

  ok(res, item, "编辑成功");
});

postsRouter.delete("/:postId", requireAuth, async (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) {
    fail(res, 400, "无效的动态ID");
    return;
  }

  const userId = req.auth!.userId;

  const existingPost = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, isDeleted: true, repostOfId: true }
  });

  if (!existingPost) {
    fail(res, 404, "动态不存在");
    return;
  }

  if (existingPost.isDeleted) {
    fail(res, 404, "动态不存在");
    return;
  }

  if (existingPost.authorId !== userId) {
    fail(res, 403, "无权删除他人动态", undefined, "FORBIDDEN");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: postId },
      data: {
        isDeleted: true,
        deletedAt: new Date()
      }
    });

    if (existingPost.repostOfId) {
      await tx.repost.deleteMany({
        where: {
          userId,
          postId: existingPost.repostOfId
        }
      });

      const sourcePost = await tx.post.findUnique({
        where: { id: existingPost.repostOfId },
        select: { likesCount: true, commentsCount: true, repostsCount: true }
      });

      if (sourcePost) {
        const nextRepostsCount = Math.max(0, sourcePost.repostsCount - 1);
        await tx.post.update({
          where: { id: existingPost.repostOfId },
          data: {
            repostsCount: nextRepostsCount,
            hotScore: calculateHotScore(sourcePost.likesCount, sourcePost.commentsCount, nextRepostsCount)
          }
        });
      }
    }
  });

  ok(res, null, "删除成功");
});
