import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { withMediaPrefix } from "../../utils/post-mapper";
import { fail, ok } from "../../utils/response";

const dashboardQuerySchema = z.object({
  days: z.coerce.number().min(3).max(30).default(7)
});

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDateRange(days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const range: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    range.push(toDateKey(current));
  }

  return { start, range };
}

function countByDate(items: Array<{ createdAt: Date }>, range: string[]) {
  const base = Object.fromEntries(range.map((key) => [key, 0]));
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = toDateKey(item.createdAt);
    if (key in acc) {
      acc[key] += 1;
    }
    return acc;
  }, base);
}

export const creatorRouter = Router();

creatorRouter.use(requireAuth);

creatorRouter.get("/dashboard", async (req, res) => {
  const { days } = dashboardQuerySchema.parse(req.query);
  const userId = req.auth!.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      followersCount: true
    }
  });

  if (!user) {
    fail(res, 404, "用户不存在");
    return;
  }

  const { start, range } = buildDateRange(days);

  const [postsAgg, followersIncrement, postsInRange, likesInRange, commentsInRange, repostsInRange, topPosts] = await Promise.all([
    prisma.post.aggregate({
      where: { authorId: userId },
      _count: { id: true },
      _sum: {
        likesCount: true,
        commentsCount: true,
        repostsCount: true
      }
    }),
    prisma.follow.count({
      where: {
        followingId: userId,
        createdAt: { gte: start }
      }
    }),
    prisma.post.findMany({
      where: {
        authorId: userId,
        createdAt: { gte: start }
      },
      select: { createdAt: true }
    }),
    prisma.like.findMany({
      where: {
        createdAt: { gte: start },
        post: { authorId: userId }
      },
      select: { createdAt: true }
    }),
    prisma.comment.findMany({
      where: {
        createdAt: { gte: start },
        post: { authorId: userId }
      },
      select: { createdAt: true }
    }),
    prisma.repost.findMany({
      where: {
        createdAt: { gte: start },
        post: { authorId: userId }
      },
      select: { createdAt: true }
    }),
    prisma.post.findMany({
      where: { authorId: userId },
      orderBy: [{ hotScore: "desc" }, { id: "desc" }],
      take: 5,
      include: {
        media: {
          orderBy: { sortOrder: "asc" },
          take: 1
        }
      }
    })
  ]);

  const postsByDate = countByDate(postsInRange, range);
  const likesByDate = countByDate(likesInRange, range);
  const commentsByDate = countByDate(commentsInRange, range);
  const repostsByDate = countByDate(repostsInRange, range);

  const trend = range.map((date) => {
    const posts = postsByDate[date] ?? 0;
    const likes = likesByDate[date] ?? 0;
    const comments = commentsByDate[date] ?? 0;
    const reposts = repostsByDate[date] ?? 0;

    return {
      date,
      posts,
      likes,
      comments,
      reposts,
      interactions: likes + comments + reposts
    };
  });

  ok(res, {
    creator: {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: withMediaPrefix(user.avatarUrl)
    },
    summary: {
      postsCount: postsAgg._count.id,
      totalLikes: postsAgg._sum.likesCount ?? 0,
      totalComments: postsAgg._sum.commentsCount ?? 0,
      totalReposts: postsAgg._sum.repostsCount ?? 0,
      followersCount: user.followersCount,
      followersNetChange: followersIncrement
    },
    trend,
    topPosts: topPosts.map((post) => ({
      id: post.id,
      content: post.content,
      createdAt: post.createdAt,
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      repostsCount: post.repostsCount,
      hotScore: post.hotScore,
      cover: post.media[0]
        ? {
            type: post.media[0].type,
            url: withMediaPrefix(post.media[0].url)
          }
        : null
    }))
  });
});
