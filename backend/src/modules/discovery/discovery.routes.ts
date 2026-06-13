import { FeedChannel } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../config/prisma";
import { ok } from "../../utils/response";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { FEED_POST_INCLUDE, toFeedItems } from "../posts/post.presenter";
import { withMediaPrefix } from "../../utils/post-mapper";

const feedQuerySchema = z.object({
  channel: z.enum(["hot", "city"]).default("hot"),
  mode: z.enum(["recommended", "trending", "discover"]).default("recommended"),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(20).default(10)
});

export const discoveryRouter = Router();

function parseCompositeCursor(mode: "recommended" | "trending" | "discover", cursor: string | undefined) {
  if (!cursor) {
    return null;
  }

  if (mode === "recommended") {
    const id = decodeCursor(cursor);
    return id ? { id } : null;
  }

  if (mode === "trending") {
    const [hotScoreRaw, idRaw] = cursor.split(":");
    const hotScore = Number(hotScoreRaw);
    const id = Number(idRaw);
    if (!Number.isFinite(hotScore) || !Number.isFinite(id) || id <= 0) {
      return null;
    }
    return { hotScore, id };
  }

  const [commentsRaw, likesRaw, idRaw] = cursor.split(":");
  const commentsCount = Number(commentsRaw);
  const likesCount = Number(likesRaw);
  const id = Number(idRaw);
  if (!Number.isFinite(commentsCount) || !Number.isFinite(likesCount) || !Number.isFinite(id) || id <= 0) {
    return null;
  }
  return { commentsCount, likesCount, id };
}

discoveryRouter.get("/discovery/feed", async (req, res) => {
  const { channel, mode, cursor, limit } = feedQuerySchema.parse(req.query);
  const cursorPayload = parseCompositeCursor(mode, cursor);
  const channelValue = channel as FeedChannel;

  const orderBy =
    mode === "trending"
      ? [{ hotScore: "desc" as const }, { id: "desc" as const }]
      : mode === "discover"
        ? [{ commentsCount: "desc" as const }, { likesCount: "desc" as const }, { id: "desc" as const }]
        : [{ id: "desc" as const }];

  const where =
    mode === "recommended"
      ? {
          channel: channelValue,
          isDeleted: false,
          ...(cursorPayload ? { id: { lt: cursorPayload.id } } : {})
        }
      : mode === "trending"
        ? {
            channel: channelValue,
            isDeleted: false,
            ...(cursorPayload
              ? {
                  OR: [
                    { hotScore: { lt: cursorPayload.hotScore } },
                    { hotScore: cursorPayload.hotScore, id: { lt: cursorPayload.id } }
                  ]
                }
              : {})
          }
        : {
            channel: channelValue,
            isDeleted: false,
            ...(cursorPayload
              ? {
                  OR: [
                    { commentsCount: { lt: cursorPayload.commentsCount } },
                    { commentsCount: cursorPayload.commentsCount, likesCount: { lt: cursorPayload.likesCount } },
                    {
                      commentsCount: cursorPayload.commentsCount,
                      likesCount: cursorPayload.likesCount,
                      id: { lt: cursorPayload.id }
                    }
                  ]
                }
              : {})
          };

  const posts = await prisma.post.findMany({
    where,
    orderBy,
    take: limit + 1,
    include: FEED_POST_INCLUDE
  });

  const hasMore = posts.length > limit;
  const slice = hasMore ? posts.slice(0, limit) : posts;

  const items = await toFeedItems(slice, req.auth?.userId);
  const lastItem = slice[slice.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? mode === "recommended"
        ? encodeCursor(lastItem.id)
        : mode === "trending"
          ? `${lastItem.hotScore}:${lastItem.id}`
          : `${lastItem.commentsCount}:${lastItem.likesCount}:${lastItem.id}`
      : null;

  ok(res, {
    items,
    nextCursor
  });
});

const followingQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(20).default(10)
});

discoveryRouter.get("/discovery/following", requireAuth, async (req, res) => {
  const { cursor, limit } = followingQuerySchema.parse(req.query);
  const currentUserId = req.auth!.userId;
  const cursorId = decodeCursor(cursor);

  const follows = await prisma.follow.findMany({
    where: { followerId: currentUserId },
    select: { followingId: true }
  });
  const followingIds = follows.map((f) => f.followingId);

  if (followingIds.length === 0) {
    ok(res, { items: [], nextCursor: null, followingCount: 0 });
    return;
  }

  const where = {
    authorId: { in: followingIds },
    isDeleted: false,
    ...(cursorId ? { id: { lt: cursorId } } : {})
  };

  const posts = await prisma.post.findMany({
    where,
    orderBy: [{ id: "desc" as const }],
    take: limit + 1,
    include: FEED_POST_INCLUDE
  });

  const hasMore = posts.length > limit;
  const slice = hasMore ? posts.slice(0, limit) : posts;

  const items = await toFeedItems(slice, currentUserId);
  const lastItem = slice[slice.length - 1];
  const nextCursor = hasMore && lastItem ? encodeCursor(lastItem.id) : null;

  ok(res, { items, nextCursor, followingCount: followingIds.length });
});

discoveryRouter.get("/trending", async (_req, res) => {
  const topics = await prisma.topic.findMany({
    orderBy: [{ rank: "asc" }, { id: "asc" }],
    take: 20
  });

  ok(res, topics);
});

discoveryRouter.post("/trending/refresh", async (_req, res) => {
  const topics = await prisma.topic.findMany({ orderBy: { rank: "asc" } });
  if (topics.length === 0) {
    ok(res, []);
    return;
  }

  const adjusted = topics.map((topic) => ({
    ...topic,
    heat: Math.max(10000, topic.heat + Math.floor((Math.random() - 0.45) * 120000))
  }));
  adjusted.sort((a, b) => b.heat - a.heat);

  await prisma.$transaction(
    adjusted.map((topic, index) =>
      prisma.topic.update({
        where: { id: topic.id },
        data: {
          rank: index + 1,
          heat: topic.heat,
          tag: index < 2 ? "沸" : index < 5 ? "热" : "新"
        }
      })
    )
  );

  const refreshed = await prisma.topic.findMany({ orderBy: { rank: "asc" } });
  ok(res, refreshed);
});

discoveryRouter.get("/recommendations", async (req, res) => {
  const latestBatch = await prisma.recommendationBatch.findFirst({
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        orderBy: { order: "asc" },
        include: {
          user: true
        }
      }
    }
  });

  let users = latestBatch?.items.map((item) => item.user) ?? [];

  if (users.length === 0) {
    users = await prisma.user.findMany({
      orderBy: { followersCount: "desc" },
      take: 5
    });
  }

  const currentUserId = req.auth?.userId;
  const followSet = new Set<number>();

  if (currentUserId) {
    const follows = await prisma.follow.findMany({
      where: {
        followerId: currentUserId,
        followingId: { in: users.map((item) => item.id) }
      },
      select: { followingId: true }
    });
    follows.forEach((item) => followSet.add(item.followingId));
  }

  ok(
    res,
    users
      .filter((user) => user.id !== currentUserId)
      .slice(0, 6)
      .map((user) => ({
        id: user.id,
        nickname: user.nickname,
        avatarUrl: withMediaPrefix(user.avatarUrl),
        bio: user.bio,
        isFollowed: followSet.has(user.id)
      }))
  );
});

discoveryRouter.post("/recommendations/refresh", async (req, res) => {
  const currentUserId = req.auth?.userId;
  const users = await prisma.user.findMany({
    where: currentUserId ? { id: { not: currentUserId } } : undefined
  });

  const shuffled = users.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const picked = shuffled.slice(0, 6);
  const batch = await prisma.recommendationBatch.create({ data: {} });
  if (picked.length > 0) {
    await prisma.recommendationItem.createMany({
      data: picked.map((user, index) => ({
        batchId: batch.id,
        userId: user.id,
        order: index + 1
      }))
    });
  }

  const followSet = new Set<number>();
  if (currentUserId && picked.length > 0) {
    const follows = await prisma.follow.findMany({
      where: {
        followerId: currentUserId,
        followingId: { in: picked.map((item) => item.id) }
      },
      select: { followingId: true }
    });
    follows.forEach((item) => followSet.add(item.followingId));
  }

  ok(
    res,
    picked.map((user) => ({
      id: user.id,
      nickname: user.nickname,
      avatarUrl: withMediaPrefix(user.avatarUrl),
      bio: user.bio,
      isFollowed: followSet.has(user.id)
    }))
  );
});
