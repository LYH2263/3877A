import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma";
import { ok } from "../../utils/response";
import { FEED_POST_INCLUDE, toFeedItems } from "../posts/post.presenter";
import { withMediaPrefix } from "../../utils/post-mapper";

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "请输入搜索关键词"),
  type: z.enum(["all", "post", "user", "topic"]).default("all"),
  limit: z.coerce.number().min(1).max(30).default(20)
});

const suggestQuerySchema = z.object({
  q: z.string().trim().min(1, "请输入搜索关键词"),
  limit: z.coerce.number().min(1).max(20).default(8)
});

export const searchRouter = Router();

searchRouter.get("/search/suggest", async (req, res) => {
  const { q, limit } = suggestQuerySchema.parse(req.query);
  const half = Math.max(1, Math.ceil(limit / 2));

  const [topics, users] = await Promise.all([
    prisma.topic.findMany({
      where: {
        keyword: {
          contains: q,
          mode: "insensitive"
        }
      },
      orderBy: [{ rank: "asc" }, { heat: "desc" }],
      take: half
    }),
    prisma.user.findMany({
      where: {
        nickname: {
          contains: q,
          mode: "insensitive"
        }
      },
      orderBy: [{ followersCount: "desc" }, { id: "desc" }],
      take: half
    })
  ]);

  const suggestions = [
    ...topics.map((topic) => ({
      id: `topic-${topic.id}`,
      type: "topic" as const,
      label: `#${topic.keyword}#`,
      keyword: topic.keyword,
      subtitle: `热度 ${topic.heat}`
    })),
    ...users.map((user) => ({
      id: `user-${user.id}`,
      type: "user" as const,
      label: user.nickname,
      keyword: user.nickname,
      subtitle: `${user.followersCount} 粉丝`
    }))
  ].slice(0, limit);

  ok(res, suggestions);
});

searchRouter.get("/search", async (req, res) => {
  const { q, type, limit } = searchQuerySchema.parse(req.query);
  const currentUserId = req.auth?.userId;

  const shouldSearchPosts = type === "all" || type === "post";
  const shouldSearchUsers = type === "all" || type === "user";
  const shouldSearchTopics = type === "all" || type === "topic";

  const posts = shouldSearchPosts
    ? await prisma.post.findMany({
        where: {
          content: {
            contains: q,
            mode: "insensitive"
          }
        },
        orderBy: [{ hotScore: "desc" }, { id: "desc" }],
        take: limit,
        include: FEED_POST_INCLUDE
      })
    : [];

  const users = shouldSearchUsers
    ? await prisma.user.findMany({
      where: {
        OR: [
          {
            nickname: {
              contains: q,
              mode: "insensitive"
            }
          },
          {
            bio: {
              contains: q,
              mode: "insensitive"
            }
          }
        ]
      },
      orderBy: [{ followersCount: "desc" }, { id: "desc" }],
      take: limit
      })
    : [];

  const topics = shouldSearchTopics
    ? await prisma.topic.findMany({
      where: {
        keyword: {
          contains: q,
          mode: "insensitive"
        }
      },
      orderBy: [{ rank: "asc" }, { heat: "desc" }],
      take: limit
      })
    : [];

  const feedItems = await toFeedItems(posts, currentUserId);

  ok(res, {
    query: q,
    type,
    posts: feedItems,
    users: users.map((user) => ({
      id: user.id,
      nickname: user.nickname,
      avatarUrl: withMediaPrefix(user.avatarUrl),
      bio: user.bio,
      level: user.level,
      followersCount: user.followersCount,
      followingCount: user.followingCount
    })),
    topics: topics.map((topic) => ({
      id: topic.id,
      keyword: topic.keyword,
      rank: topic.rank,
      heat: topic.heat,
      tag: topic.tag
    }))
  });
});
