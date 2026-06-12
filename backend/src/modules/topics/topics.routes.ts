import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { fail, ok } from "../../utils/response";
import { FEED_POST_INCLUDE, toFeedItems } from "../posts/post.presenter";

const feedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(20).default(10)
});

export const topicsRouter = Router();

topicsRouter.get("/topics/:topicId/feed", async (req, res) => {
  const topicId = Number(req.params.topicId);
  if (!Number.isFinite(topicId)) {
    fail(res, 400, "无效的话题ID");
    return;
  }

  const topic = await prisma.topic.findUnique({ where: { id: topicId } });
  if (!topic) {
    fail(res, 404, "话题不存在");
    return;
  }

  const { cursor, limit } = feedQuerySchema.parse(req.query);
  const cursorId = decodeCursor(cursor);

  const postTopics = await prisma.postTopic.findMany({
    where: {
      topicId,
      ...(cursorId ? { postId: { lt: cursorId } } : {})
    },
    orderBy: [{ postId: "desc" }],
    take: limit + 1,
    include: {
      post: {
        include: FEED_POST_INCLUDE
      }
    }
  });

  const hasMore = postTopics.length > limit;
  const slice = hasMore ? postTopics.slice(0, limit) : postTopics;
  const posts = slice.map((item) => item.post);

  const items = await toFeedItems(posts, req.auth?.userId);

  ok(res, {
    topic,
    items,
    nextCursor: hasMore ? encodeCursor(slice[slice.length - 1]?.postId ?? null) : null
  });
});

topicsRouter.get("/topics/by-keyword/:keyword/feed", async (req, res) => {
  const keyword = decodeURIComponent(req.params.keyword || "").trim();
  if (!keyword) {
    fail(res, 400, "无效的话题关键词");
    return;
  }

  const topic = await prisma.topic.findFirst({
    where: {
      keyword: {
        equals: keyword,
        mode: "insensitive"
      }
    }
  });

  if (!topic) {
    ok(res, { topic: { id: 0, keyword, rank: 0, heat: 0, tag: "新" }, items: [], nextCursor: null });
    return;
  }

  const { cursor, limit } = feedQuerySchema.parse(req.query);
  const cursorId = decodeCursor(cursor);

  const postTopics = await prisma.postTopic.findMany({
    where: {
      topicId: topic.id,
      ...(cursorId ? { postId: { lt: cursorId } } : {})
    },
    orderBy: [{ postId: "desc" }],
    take: limit + 1,
    include: {
      post: {
        include: FEED_POST_INCLUDE
      }
    }
  });

  const hasMore = postTopics.length > limit;
  const slice = hasMore ? postTopics.slice(0, limit) : postTopics;
  const items = await toFeedItems(
    slice.map((item) => item.post),
    req.auth?.userId
  );

  ok(res, {
    topic,
    items,
    nextCursor: hasMore ? encodeCursor(slice[slice.length - 1]?.postId ?? null) : null
  });
});
