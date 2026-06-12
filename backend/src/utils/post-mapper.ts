import type { Post, PostMedia, User } from "@prisma/client";

import { env } from "../config/env";

const MEDIA_PREFIX = env.MEDIA_PUBLIC_PREFIX;

type PostAuthor = Pick<User, "id" | "nickname" | "avatarUrl" | "level">;
type QuotedPost = Pick<Post, "id" | "content" | "source" | "createdAt"> & {
  author: PostAuthor;
  media: PostMedia[];
};

export interface PostWithRelations extends Post {
  author: PostAuthor;
  media: PostMedia[];
  repostOf?: QuotedPost | null;
  likedByMe?: boolean;
  repostedByMe?: boolean;
  followedByMe?: boolean;
}

export function toFeedItem(post: PostWithRelations) {
  return {
    id: post.id,
    author: {
      id: post.author.id,
      nickname: post.author.nickname,
      avatarUrl: withMediaPrefix(post.author.avatarUrl),
      level: post.author.level,
      isFollowed: Boolean(post.followedByMe)
    },
    content: post.content,
    source: post.source,
    createdAt: post.createdAt,
    channel: post.channel,
    media: post.media
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        id: item.id,
        type: item.type,
        url: withMediaPrefix(item.url)
      })),
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    repostsCount: post.repostsCount,
    isLiked: Boolean(post.likedByMe),
    isReposted: Boolean(post.repostedByMe),
    repostOf: post.repostOf
      ? {
          id: post.repostOf.id,
          author: {
            id: post.repostOf.author.id,
            nickname: post.repostOf.author.nickname,
            avatarUrl: withMediaPrefix(post.repostOf.author.avatarUrl),
            level: post.repostOf.author.level
          },
          content: post.repostOf.content,
          source: post.repostOf.source,
          createdAt: post.repostOf.createdAt,
          media: post.repostOf.media
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((item) => ({
              id: item.id,
              type: item.type,
              url: withMediaPrefix(item.url)
            }))
        }
      : null
  };
}

export function withMediaPrefix(url: string | null): string | null {
  if (!url) {
    return null;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `${MEDIA_PREFIX}${url}`;
}
