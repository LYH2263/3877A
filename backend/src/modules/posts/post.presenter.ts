import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { toFeedItem, type PostWithRelations } from "../../utils/post-mapper";

const feedAuthorSelect = {
  id: true,
  nickname: true,
  avatarUrl: true,
  level: true
} satisfies Prisma.UserSelect;

export const FEED_POST_INCLUDE = {
  author: { select: feedAuthorSelect },
  media: true,
  repostOf: {
    include: {
      author: { select: feedAuthorSelect },
      media: true
    }
  }
} satisfies Prisma.PostInclude;

type MinimalPost = Prisma.PostGetPayload<{ include: typeof FEED_POST_INCLUDE }>;

export async function toFeedItems(posts: MinimalPost[], currentUserId?: number) {
  if (posts.length === 0) {
    return [];
  }

  if (!currentUserId) {
    return posts.map((post) => toFeedItem({ ...post, likedByMe: false, repostedByMe: false, followedByMe: false }));
  }

  const postIds = posts.map((post) => post.id);
  const authorIds = Array.from(new Set(posts.map((post) => post.authorId)));

  const [likes, reposts, follows] = await Promise.all([
    prisma.like.findMany({
      where: {
        userId: currentUserId,
        postId: { in: postIds }
      },
      select: { postId: true }
    }),
    prisma.repost.findMany({
      where: {
        userId: currentUserId,
        postId: { in: postIds }
      },
      select: { postId: true }
    }),
    prisma.follow.findMany({
      where: {
        followerId: currentUserId,
        followingId: { in: authorIds }
      },
      select: { followingId: true }
    })
  ]);

  const likedSet = new Set(likes.map((item) => item.postId));
  const repostSet = new Set(reposts.map((item) => item.postId));
  const followSet = new Set(follows.map((item) => item.followingId));

  return posts.map((post) =>
    toFeedItem({
      ...(post as PostWithRelations),
      likedByMe: likedSet.has(post.id),
      repostedByMe: repostSet.has(post.id),
      followedByMe: followSet.has(post.authorId)
    })
  );
}

export async function toSingleFeedItem(postId: number, currentUserId?: number) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: FEED_POST_INCLUDE
  });

  if (!post) {
    return null;
  }

  const [item] = await toFeedItems([post], currentUserId);
  return item;
}
