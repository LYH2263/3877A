import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import {
  createRepost,
  fetchTopicFeedById,
  fetchTopicFeedByKeyword,
  toggleFollow,
  toggleLike
} from "@/api/discovery";
import { addPostToFavorites, removePostFromFavorites } from "@/api/favorites";
import { FeedCard } from "@/components/discovery/feed-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useAuth } from "@/context/auth-context";
import { parseApiError } from "@/lib/api-error";
import type { FavoriteStatus, FeedItem, TopicFeedPayload } from "@/types/models";

function mergeItems(prev: FeedItem[], incoming: FeedItem[]) {
  if (incoming.length === 0) {
    return prev;
  }

  const map = new Map(prev.map((item, index) => [item.id, index]));
  const next = [...prev];

  incoming.forEach((item) => {
    const existingIndex = map.get(item.id);
    if (existingIndex === undefined) {
      next.push(item);
      return;
    }
    next[existingIndex] = item;
  });

  return next;
}

export default function TopicPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const topicId = params.topicId ?? "";

  const [topicData, setTopicData] = useState<TopicFeedPayload | null>(null);
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);

  const title = useMemo(() => {
    if (!topicData) {
      return "话题详情";
    }
    return `#${topicData.topic.keyword}#`;
  }, [topicData]);

  const requireLogin = useCallback(() => {
    setLoginDialogOpen(true);
  }, []);

  const updatePostItem = useCallback((nextItem: FeedItem) => {
    setPosts((prev) => prev.map((item) => (item.id === nextItem.id ? nextItem : item)));
  }, []);

  const removePostItem = useCallback((postId: number) => {
    setPosts((prev) => prev.filter((item) => item.id !== postId));
  }, []);

  const handleEdited = useCallback(
    (updated: FeedItem) => {
      updatePostItem(updated);
    },
    [updatePostItem],
  );

  const handleDeleted = useCallback(
    (postId: number) => {
      removePostItem(postId);
    },
    [removePostItem],
  );

  useEffect(() => {
    if (!topicId.trim()) {
      setLoading(false);
      return;
    }

    let active = true;
    setTopicData(null);
    setPosts([]);
    setCursor(null);
    setLoading(true);

    const run = async () => {
      try {
        const numericId = Number(topicId);
        const payload = Number.isFinite(numericId)
          ? await fetchTopicFeedById(numericId, null, 10)
          : await fetchTopicFeedByKeyword(topicId, null, 10);

        if (!active) {
          return;
        }

        setTopicData(payload);
        setCursor(payload.nextCursor);
        setPosts(payload.items);
      } catch (err) {
        if (!active) {
          return;
        }
        const parsed = parseApiError(err);
        toast.error(parsed.message || "话题详情加载失败");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [topicId]);

  const loadMore = useCallback(async () => {
    if (!topicId.trim() || loadingMore || !cursor) {
      return;
    }

    setLoadingMore(true);
    try {
      const numericId = Number(topicId);
      const payload = Number.isFinite(numericId)
        ? await fetchTopicFeedById(numericId, cursor, 10)
        : await fetchTopicFeedByKeyword(topicId, cursor, 10);

      setTopicData((prev) => prev ?? payload);
      setCursor(payload.nextCursor);
      setPosts((prev) => mergeItems(prev, payload.items));
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message || "加载更多失败");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, topicId]);

  const handleLike = useCallback(
    async (item: FeedItem) => {
      if (!user) {
        requireLogin();
        return;
      }

      const snapshot = item;
      updatePostItem({
        ...item,
        isLiked: !item.isLiked,
        likesCount: item.likesCount + (item.isLiked ? -1 : 1)
      });

      try {
        const payload = await toggleLike(item.id);
        updatePostItem(payload);
      } catch (err) {
        updatePostItem(snapshot);
        const parsed = parseApiError(err);
        toast.error(parsed.message || "点赞操作失败");
      }
    },
    [requireLogin, updatePostItem, user]
  );

  const handleRepost = useCallback(
    async (item: FeedItem, content: string) => {
      if (!user) {
        requireLogin();
        return;
      }

      const snapshot = item;
      updatePostItem({
        ...item,
        isReposted: true,
        repostsCount: item.repostsCount + 1
      });

      try {
        const payload = await createRepost(item.id, content);
        updatePostItem(payload.sourcePost);
        toast.success("转发成功，已发布到你的主页");
      } catch (err) {
        updatePostItem(snapshot);
        const parsed = parseApiError(err);
        toast.error(parsed.message || "转发操作失败");
      }
    },
    [requireLogin, updatePostItem, user]
  );

  const handleFollow = useCallback(
    async (authorId: number) => {
      if (!user) {
        requireLogin();
        return;
      }

      const sample = posts.find((item) => item.author.id === authorId);
      const nextFollowState = sample ? !sample.author.isFollowed : true;
      const snapshot = posts;

      setPosts((prev) =>
        prev.map((item) =>
          item.author.id === authorId
            ? {
                ...item,
                author: {
                  ...item.author,
                  isFollowed: nextFollowState
                }
              }
            : item
        )
      );

      try {
        const payload = await toggleFollow(authorId);
        setPosts((prev) =>
          prev.map((item) =>
            item.author.id === authorId
              ? {
                  ...item,
                  author: {
                    ...item.author,
                    isFollowed: payload.isFollowed
                  }
                }
              : item
          )
        );
      } catch (err) {
        setPosts(snapshot);
        const parsed = parseApiError(err);
        toast.error(parsed.message || "关注操作失败");
      }
    },
    [posts, requireLogin, user]
  );

  const handleFavoriteToggle = useCallback(
    async (item: FeedItem) => {
      if (!user) {
        requireLogin();
        return;
      }
      const snapshot = item;
      const hadAny = item.favoritedInFolders && item.favoritedInFolders.length > 0;
      updatePostItem({
        ...item,
        isFavorited: !hadAny,
        favoritesCount: Math.max(0, item.favoritesCount + (hadAny ? -1 : 1)),
      });
      try {
        if (hadAny) {
          await removePostFromFavorites(item.id);
        } else {
          await addPostToFavorites(item.id);
        }
      } catch (err) {
        updatePostItem(snapshot);
        const parsed = parseApiError(err);
        toast.error(parsed.message || "收藏操作失败");
      }
    },
    [requireLogin, updatePostItem, user],
  );

  const handleFavoriteStatusChange = useCallback(
    (postId: number, status: FavoriteStatus) => {
      setPosts((prev) =>
        prev.map((item) => {
          if (item.id !== postId) return item;
          const prevCount = item.favoritesCount;
          const wasFavorited = item.isFavorited;
          const nowFavorited = status.isFavorited;
          let nextCount = prevCount;
          if (!wasFavorited && nowFavorited) nextCount = prevCount + 1;
          if (wasFavorited && !nowFavorited) nextCount = Math.max(0, prevCount - 1);
          return {
            ...item,
            isFavorited: nowFavorited,
            favoritedInFolders: status.favoritedInFolders,
            favoritesCount: nextCount,
          };
        })
      );
    },
    [],
  );

  const handleCommentsCountChange = useCallback((postId: number, delta: number) => {
    setPosts((prev) =>
      prev.map((item) =>
        item.id === postId
          ? {
              ...item,
              commentsCount: Math.max(0, item.commentsCount + delta)
            }
          : item
      )
    );
  }, []);

  if (loading) {
    return (
      <main className="mx-auto mt-10 w-full max-w-4xl px-4 text-center text-slate-500">
        <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />
        加载中...
      </main>
    );
  }

  return (
    <main className="mx-auto mt-6 w-full max-w-4xl px-4 pb-12">
      <Card className="mb-4 border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">
          <p>当前聚合与该话题相关的动态，支持持续加载与互动。</p>
          {topicData ? <p className="mt-1">热度 {topicData.topic.heat} · 标签 {topicData.topic.tag}</p> : null}
        </CardContent>
      </Card>

      <section className="space-y-3">
        {posts.map((post) => (
          <FeedCard
            key={post.id}
            item={post}
            isLoggedIn={Boolean(user)}
            currentUserId={user?.id}
            onLike={handleLike}
            onRepost={handleRepost}
            onFollow={handleFollow}
            onRequireLogin={requireLogin}
            onCommentsCountChange={handleCommentsCountChange}
            onEdited={handleEdited}
            onDeleted={handleDeleted}
            onFavoriteToggle={handleFavoriteToggle}
            onFavoriteStatusChange={handleFavoriteStatusChange}
          />
        ))}

        {posts.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center text-sm text-slate-500">暂无相关动态</CardContent>
          </Card>
        ) : null}

        {cursor ? (
          <Button variant="outline" className="w-full" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "加载中..." : "加载更多"}
          </Button>
        ) : null}
      </section>

      <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>登录后可继续互动</DialogTitle>
            <DialogDescription>点赞、评论、转发和关注功能都需要先登录账号。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoginDialogOpen(false)}>
              稍后再说
            </Button>
            <Button
              onClick={() => {
                setLoginDialogOpen(false);
                navigate("/login", { state: { from: `/topic/${topicId}` } });
              }}
            >
              立即登录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
