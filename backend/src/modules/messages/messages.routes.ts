import { NotificationType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { withMediaPrefix } from "../../utils/post-mapper";
import { fail, ok } from "../../utils/response";
import { getBlockedUserIds } from "../../utils/block";

const listMessagesQuerySchema = z.object({
  tab: z.enum(["all", "unread", "likes", "comments", "reposts", "follows"]).default("all"),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(30).default(12)
});

const tabTypeMap = {
  likes: NotificationType.LIKE,
  comments: NotificationType.COMMENT,
  reposts: NotificationType.REPOST,
  follows: NotificationType.FOLLOW
} as const;

export const messagesRouter = Router();

messagesRouter.use(requireAuth);

messagesRouter.get("/", async (req, res) => {
  const { tab, cursor, limit } = listMessagesQuerySchema.parse(req.query);
  const cursorId = decodeCursor(cursor);
  const targetUserId = req.auth!.userId;

  const blockedUserIds = await getBlockedUserIds(prisma, targetUserId);

  const where = {
    targetUserId,
    actorUserId: { notIn: blockedUserIds },
    ...(tab === "unread" ? { isRead: false } : {}),
    ...(tab in tabTypeMap ? { type: tabTypeMap[tab as keyof typeof tabTypeMap] } : {}),
    ...(cursorId ? { id: { lt: cursorId } } : {})
  };

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: [{ id: "desc" }],
    take: limit + 1,
    include: {
      actorUser: {
        select: {
          id: true,
          nickname: true,
          avatarUrl: true
        }
      },
      post: {
        select: {
          id: true,
          content: true
        }
      }
    }
  });

  const hasMore = notifications.length > limit;
  const slice = hasMore ? notifications.slice(0, limit) : notifications;

  ok(res, {
    items: slice.map((item) => ({
      id: item.id,
      type: item.type,
      content: item.content,
      isRead: item.isRead,
      createdAt: item.createdAt,
      actor: {
        id: item.actorUser.id,
        nickname: item.actorUser.nickname,
        avatarUrl: withMediaPrefix(item.actorUser.avatarUrl)
      },
      post: item.post
        ? {
            id: item.post.id,
            content: item.post.content
          }
        : null
    })),
    nextCursor: hasMore ? encodeCursor(slice[slice.length - 1]?.id ?? null) : null
  });
});

messagesRouter.get("/unread-count", async (req, res) => {
  const targetUserId = req.auth!.userId;
  const blockedUserIds = await getBlockedUserIds(prisma, targetUserId);

  const unreadCount = await prisma.notification.count({
    where: {
      targetUserId,
      isRead: false,
      actorUserId: { notIn: blockedUserIds }
    }
  });

  ok(res, { unreadCount });
});

messagesRouter.post("/:id/read", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    fail(res, 400, "无效的消息ID");
    return;
  }

  const notification = await prisma.notification.findFirst({
    where: {
      id,
      targetUserId: req.auth!.userId
    },
    select: {
      id: true,
      isRead: true
    }
  });

  if (!notification) {
    fail(res, 404, "消息不存在");
    return;
  }

  if (!notification.isRead) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { isRead: true }
    });
  }

  ok(res, { id: notification.id, isRead: true }, "已标记已读");
});

messagesRouter.post("/read-all", async (req, res) => {
  await prisma.notification.updateMany({
    where: {
      targetUserId: req.auth!.userId,
      isRead: false
    },
    data: {
      isRead: true
    }
  });

  ok(res, null, "全部标记已读");
});
