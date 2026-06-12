import { NotificationType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { fail, ok } from "../../utils/response";
import { FEED_POST_INCLUDE, toFeedItems } from "../posts/post.presenter";
import { withMediaPrefix } from "../../utils/post-mapper";
import { createNotificationIfAllowed } from "../messages/notification.service";
import { decodeCursor, encodeCursor } from "../../utils/cursor";

export const usersRouter = Router();

const profileFeedQuerySchema = z.object({
  tab: z.enum(["posts", "media", "likes"]).default("posts"),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(20).default(10)
});

usersRouter.post("/:userId/follow", requireAuth, async (req, res) => {
  const targetUserId = Number(req.params.userId);
  const currentUserId = req.auth!.userId;

  if (!Number.isFinite(targetUserId)) {
    fail(res, 400, "无效的用户ID");
    return;
  }

  if (targetUserId === currentUserId) {
    fail(res, 400, "不能关注自己");
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) {
    fail(res, 404, "用户不存在");
    return;
  }

  const existing = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: currentUserId,
        followingId: targetUserId
      }
    }
  });

  if (existing) {
    await prisma.$transaction(async (tx) => {
      const [currentUser, targetUser] = await Promise.all([
        tx.user.findUnique({ where: { id: currentUserId }, select: { followingCount: true } }),
        tx.user.findUnique({ where: { id: targetUserId }, select: { followersCount: true } })
      ]);

      await tx.follow.delete({ where: { id: existing.id } });
      await tx.user.update({
        where: { id: currentUserId },
        data: { followingCount: Math.max(0, (currentUser?.followingCount ?? 0) - 1) }
      });
      await tx.user.update({
        where: { id: targetUserId },
        data: { followersCount: Math.max(0, (targetUser?.followersCount ?? 0) - 1) }
      });
    });
    ok(res, { isFollowed: false });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.follow.create({ data: { followerId: currentUserId, followingId: targetUserId } });
    await tx.user.update({ where: { id: currentUserId }, data: { followingCount: { increment: 1 } } });
    await tx.user.update({ where: { id: targetUserId }, data: { followersCount: { increment: 1 } } });
    await createNotificationIfAllowed(tx, {
      targetUserId,
      actorUserId: currentUserId,
      type: NotificationType.FOLLOW,
      content: "关注了你"
    });
  });

  ok(res, { isFollowed: true });
});

usersRouter.get("/:userId/profile", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    fail(res, 400, "无效的用户ID");
    return;
  }

  const currentUserId = req.auth?.userId;
  const isSelf = currentUserId === userId;

  const [user, postsCount, mediaCount, likesCountVisible, postAgg, followRelation] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.post.count({
      where: { authorId: userId }
    }),
    prisma.post.count({
      where: {
        authorId: userId,
        media: { some: {} }
      }
    }),
    isSelf ? prisma.like.count({ where: { userId } }) : Promise.resolve(null),
    prisma.post.aggregate({
      where: { authorId: userId },
      _sum: {
        likesCount: true,
        commentsCount: true,
        repostsCount: true
      }
    }),
    currentUserId && !isSelf
      ? prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: currentUserId,
              followingId: userId
            }
          },
          select: { id: true }
        })
      : Promise.resolve(null)
  ]);

  if (!user) {
    fail(res, 404, "用户不存在");
    return;
  }

  ok(res, {
    user: {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: withMediaPrefix(user.avatarUrl),
      level: user.level,
      bio: user.bio,
      followersCount: user.followersCount,
      followingCount: user.followingCount,
      createdAt: user.createdAt
    },
    relationship: {
      isSelf,
      isFollowed: Boolean(followRelation)
    },
    summary: {
      postsCount,
      mediaCount,
      likesCountVisible,
      totalLikes: postAgg._sum.likesCount ?? 0,
      totalComments: postAgg._sum.commentsCount ?? 0,
      totalReposts: postAgg._sum.repostsCount ?? 0
    }
  });
});

usersRouter.get("/:userId/profile/posts", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    fail(res, 400, "无效的用户ID");
    return;
  }

  const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!userExists) {
    fail(res, 404, "用户不存在");
    return;
  }

  const { tab, cursor, limit } = profileFeedQuerySchema.parse(req.query);
  const cursorId = decodeCursor(cursor);
  const currentUserId = req.auth?.userId;

  if (tab === "likes") {
    if (!currentUserId) {
      fail(res, 401, "请先登录", undefined, "UNAUTHORIZED");
      return;
    }

    if (currentUserId !== userId) {
      fail(res, 403, "无权查看他人的点赞列表", undefined, "FORBIDDEN");
      return;
    }

    const likes = await prisma.like.findMany({
      where: {
        userId,
        ...(cursorId ? { id: { lt: cursorId } } : {})
      },
      orderBy: [{ id: "desc" }],
      take: limit + 1,
      include: {
        post: { include: FEED_POST_INCLUDE }
      }
    });

    const hasMore = likes.length > limit;
    const slice = hasMore ? likes.slice(0, limit) : likes;
    const items = await toFeedItems(
      slice.map((item) => item.post),
      currentUserId
    );

    ok(res, {
      items,
      nextCursor: hasMore ? encodeCursor(slice[slice.length - 1]?.id ?? null) : null
    });
    return;
  }

  const posts = await prisma.post.findMany({
    where: {
      authorId: userId,
      ...(cursorId ? { id: { lt: cursorId } } : {}),
      ...(tab === "media" ? { media: { some: {} } } : {})
    },
    orderBy: [{ id: "desc" }],
    take: limit + 1,
    include: FEED_POST_INCLUDE
  });

  const hasMore = posts.length > limit;
  const slice = hasMore ? posts.slice(0, limit) : posts;
  const items = await toFeedItems(slice, currentUserId);

  ok(res, {
    items,
    nextCursor: hasMore ? encodeCursor(slice[slice.length - 1]?.id ?? null) : null
  });
});
