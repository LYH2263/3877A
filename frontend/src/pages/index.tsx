import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RefreshCw, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  fetchFollowingUnread,
  fetchRecommendations,
  fetchTrending,
  refreshRecommendations,
  refreshTrending,
  createRepost,
  toggleFollow,
  toggleLike,
} from "@/api/discovery";
import { addPostToFavorites, removePostFromFavorites } from "@/api/favorites";
import { FeedCard } from "@/components/discovery/feed-card";
import { CreatorCenterPanel } from "@/components/discovery/creator-center-panel";
import { HotSearchPanel } from "@/components/discovery/hot-search-panel";
import { RecommendedUsersPanel } from "@/components/discovery/recommended-users-panel";
import { LeftSidebar } from "@/components/layout/left-sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/auth-context";
import { useInfiniteFeed } from "@/hooks/use-infinite-feed";
import { parseApiError } from "@/lib/api-error";
import type {
  FavoriteStatus,
  FeedChannel,
  FeedItem,
  FeedMode,
  RecommendedUser,
  TrendingTopic,
} from "@/types/models";

const CHANNELS: Array<{ key: FeedChannel; label: string }> = [
  { key: "following", label: "关注" },
  { key: "hot", label: "热门" },
  { key: "city", label: "同城" },
];

const MODES: Array<{ key: FeedMode; label: string }> = [
  { key: "recommended", label: "推荐" },
  { key: "trending", label: "热门榜" },
  { key: "discover", label: "发现" },
];

const MODE_LABELS: Record<FeedMode, string> = {
  recommended: "推荐",
  trending: "热门榜",
  discover: "发现",
};

function FeedCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
        <Skeleton className="h-8 w-16" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[88%]" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
      <div className="mt-4 flex gap-3">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}

export default function DiscoveryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [channel, setChannel] = useState<FeedChannel>("hot");
  const [feedMode, setFeedMode] = useState<FeedMode>("recommended");
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [recommendedUsers, setRecommendedUsers] = useState<RecommendedUser[]>(
    [],
  );
  const [rightLoading, setRightLoading] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadLoading, setUnreadLoading] = useState(false);
  const prevUserRef = useRef(user);
  const feedScrollRef = useRef<HTMLElement | null>(null);
  const unreadTimerRef = useRef<number | null>(null);

  const {
    items,
    initialLoading,
    loading,
    hasMore,
    error,
    loaderRef,
    mutateItem,
    mutateItems,
    updateItem,
    prependItem,
    removeItem,
    removeItemsByAuthor,
    followingCount,
    reset
  } = useInfiniteFeed(channel, feedMode);

  useEffect(() => {
    if (prevUserRef.current !== user && channel === "following") {
      setChannel("hot");
    }
    prevUserRef.current = user;
  }, [user, channel]);

  const latestItemId = useMemo(
    () => (items.length > 0 ? Math.max(...items.map((it) => it.id)) : 0),
    [items],
  );

  const loadUnread = useCallback(async () => {
    if (!user || channel !== "following" || latestItemId <= 0 || unreadLoading) {
      return;
    }
    setUnreadLoading(true);
    try {
      const { count } = await fetchFollowingUnread(latestItemId);
      setUnreadCount(count);
    } catch {
      // 静默失败，下次轮询再尝试
    } finally {
      setUnreadLoading(false);
    }
  }, [user, channel, latestItemId, unreadLoading]);

  useEffect(() => {
    if (!user || channel !== "following" || latestItemId <= 0) {
      setUnreadCount(0);
      if (unreadTimerRef.current !== null) {
        window.clearInterval(unreadTimerRef.current);
        unreadTimerRef.current = null;
      }
      return;
    }

    void loadUnread();

    unreadTimerRef.current = window.setInterval(() => {
      void loadUnread();
    }, 30000);

    return () => {
      if (unreadTimerRef.current !== null) {
        window.clearInterval(unreadTimerRef.current);
        unreadTimerRef.current = null;
      }
    };
  }, [user, channel, latestItemId, loadUnread]);

  const handleRefreshUnread = useCallback(() => {
    reset();
    setUnreadCount(0);
    if (feedScrollRef.current) {
      feedScrollRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [reset]);

  const loadRight = useCallback(async () => {
    setRightLoading(true);
    try {
      const [topicData, userData] = await Promise.all([
        fetchTrending(),
        fetchRecommendations(),
      ]);
      setTopics(topicData);
      setRecommendedUsers(userData);
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message || "侧边数据加载失败");
    } finally {
      setRightLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRight();
  }, [loadRight]);

  const requireLogin = useCallback(() => {
    setLoginDialogOpen(true);
  }, []);

  const handleChannelChange = useCallback(
    (nextChannel: FeedChannel) => {
      if (nextChannel === "following" && !user) {
        setLoginDialogOpen(true);
        return;
      }
      setChannel(nextChannel);
    },
    [user],
  );

  const optimisticMutation = useCallback(
    async (
      item: FeedItem,
      updater: (target: FeedItem) => FeedItem,
      submitter: () => Promise<FeedItem>,
      fallbackMessage: string,
    ) => {
      const snapshot = item;
      const optimistic = updater(item);
      updateItem(optimistic);

      try {
        const next = await submitter();
        updateItem(next);
      } catch (err) {
        updateItem(snapshot);
        const parsed = parseApiError(err);
        toast.error(parsed.message || fallbackMessage);
      }
    },
    [updateItem],
  );

  const handleLike = useCallback(
    async (item: FeedItem) => {
      await optimisticMutation(
        item,
        (target) => ({
          ...target,
          isLiked: !target.isLiked,
          likesCount: target.likesCount + (target.isLiked ? -1 : 1),
        }),
        () => toggleLike(item.id),
        "点赞操作失败",
      );
    },
    [optimisticMutation],
  );

  const handleRepost = useCallback(
    async (item: FeedItem, content: string) => {
      if (!user) {
        requireLogin();
        return;
      }

      const snapshot = item;
      updateItem({
        ...item,
        isReposted: true,
        repostsCount: item.repostsCount + 1,
      });

      try {
        const payload = await createRepost(item.id, content);
        updateItem(payload.sourcePost);
        if (payload.repostPost.channel === channel) {
          prependItem(payload.repostPost);
        }
        toast.success("转发成功，已发布到你的主页");
      } catch (err) {
        updateItem(snapshot);
        const parsed = parseApiError(err);
        toast.error(parsed.message || "转发操作失败");
      }
    },
    [channel, prependItem, requireLogin, updateItem, user],
  );

  const handleFollow = useCallback(
    async (authorId: number) => {
      if (!user) {
        requireLogin();
        return;
      }

      const nextFollowState =
        items.find((item) => item.author.id === authorId)?.author.isFollowed ===
        true
          ? false
          : recommendedUsers.find((item) => item.id === authorId)
                ?.isFollowed === true
            ? false
            : true;

      const recommendedSnapshot = recommendedUsers;
      mutateItems((item) =>
        item.author.id === authorId
          ? { ...item, author: { ...item.author, isFollowed: nextFollowState } }
          : item,
      );
      setRecommendedUsers((prev) =>
        prev.map((target) =>
          target.id === authorId
            ? { ...target, isFollowed: nextFollowState }
            : target,
        ),
      );

      try {
        const payload = await toggleFollow(authorId);
        const confirmed = payload.isFollowed;
        mutateItems((item) =>
          item.author.id === authorId
            ? { ...item, author: { ...item.author, isFollowed: confirmed } }
            : item,
        );
        setRecommendedUsers((prev) =>
          prev.map((target) =>
            target.id === authorId
              ? { ...target, isFollowed: confirmed }
              : target,
          ),
        );
        if (confirmed && channel === "following" && (followingCount === 0 || items.length === 0)) {
          reset();
        }
      } catch (err) {
        mutateItems((item) =>
          item.author.id === authorId
            ? {
                ...item,
                author: { ...item.author, isFollowed: !nextFollowState },
              }
            : item,
        );
        setRecommendedUsers(recommendedSnapshot);
        const parsed = parseApiError(err);
        toast.error(parsed.message || "关注操作失败");
      }
    },
    [user, requireLogin, items, recommendedUsers, mutateItems, reset, channel, followingCount],
  );

  const handleCommentsCountChange = useCallback(
    (postId: number, delta: number) => {
      mutateItem(postId, (item) => ({
        ...item,
        commentsCount: Math.max(0, item.commentsCount + delta),
      }));
    },
    [mutateItem],
  );

  const handleEdited = useCallback(
    (updated: FeedItem) => {
      updateItem(updated);
    },
    [updateItem],
  );

  const handleDeleted = useCallback(
    (postId: number) => {
      removeItem(postId);
    },
    [removeItem],
  );

  const handleBlockedChange = useCallback(
    (authorId: number, isBlocked: boolean) => {
      if (isBlocked) {
        removeItemsByAuthor(authorId);
        setRecommendedUsers((prev) => prev.filter((u) => u.id !== authorId));
      }
    },
    [removeItemsByAuthor],
  );

  const handleFavoriteToggle = useCallback(
    async (item: FeedItem) => {
      const snapshot = item;
      const hadAny = item.favoritedInFolders && item.favoritedInFolders.length > 0;
      updateItem({
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
        updateItem(snapshot);
        const parsed = parseApiError(err);
        toast.error(parsed.message || "收藏操作失败");
      }
    },
    [updateItem],
  );

  const handleFavoriteStatusChange = useCallback(
    (postId: number, status: FavoriteStatus) => {
      mutateItem(postId, (item) => {
        const prevCount = item.favoritesCount;
        const wasFavorited = item.isFavorited;
        const nowFavorited = status.isFavorited;
        let nextCount = prevCount;
        if (!wasFavorited && nowFavorited) {
          nextCount = prevCount + 1;
        } else if (wasFavorited && !nowFavorited) {
          nextCount = Math.max(0, prevCount - 1);
        }
        return {
          ...item,
          isFavorited: nowFavorited,
          favoritedInFolders: status.favoritedInFolders,
          favoritesCount: nextCount,
        };
      });
    },
    [mutateItem],
  );

  const isFollowingChannel = channel === "following";
  const channelLabel = useMemo(
    () => CHANNELS.find((entry) => entry.key === channel)?.label ?? "热门",
    [channel],
  );
  const showInitialSkeleton = initialLoading && items.length === 0;
  const showSwitchingHint = initialLoading && items.length > 0;
  const showFollowingEmpty =
    isFollowingChannel &&
    !initialLoading &&
    !error &&
    items.length === 0 &&
    followingCount === 0;

  return (
    <main className="mx-auto w-full max-w-[1320px] px-3 pb-10 pt-4 md:px-4 lg:px-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)_320px] lg:items-start">
        <LeftSidebar
          activeKey={feedMode}
          activeChannel={channel}
          onChangeMode={setFeedMode}
          onChangeChannel={handleChannelChange}
        />

        <section ref={feedScrollRef} className="min-w-0 space-y-3">
          {isFollowingChannel && unreadCount > 0 && !showFollowingEmpty ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefreshUnread}
              disabled={initialLoading || loading}
              className="sticky top-[72px] z-10 flex w-full items-center justify-center gap-1.5 border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 hover:text-brand-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">
                有 {unreadCount} 条新动态，点击查看
              </span>
            </Button>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-slate-500">
                {isFollowingChannel ? (
                  <span className="font-medium text-slate-800">关注</span>
                ) : (
                  <>
                    <span className="font-medium text-slate-800">
                      {channelLabel}
                    </span>{" "}
                    · {MODE_LABELS[feedMode]}频道
                  </>
                )}
              </div>
            </div>

            {!isFollowingChannel && (
              <div className="mb-3 grid grid-cols-3 gap-2 lg:hidden">
                {MODES.map((mode) => (
                  <Button
                    key={mode.key}
                    type="button"
                    size="sm"
                    variant={feedMode === mode.key ? "default" : "secondary"}
                    onClick={() => setFeedMode(mode.key)}
                  >
                    {mode.label}
                  </Button>
                ))}
              </div>
            )}

            <Tabs
              value={channel}
              onValueChange={(value) => handleChannelChange(value as FeedChannel)}
            >
              <TabsList>
                {CHANNELS.map((entry) => (
                  <TabsTrigger key={entry.key} value={entry.key}>
                    {entry.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {showInitialSkeleton ? (
            <>
              <FeedCardSkeleton />
              <FeedCardSkeleton />
            </>
          ) : null}

          {showSwitchingHint ? (
            <div className="rounded-2xl border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-brand-700">
              正在切换频道内容...
            </div>
          ) : null}

          {showFollowingEmpty ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <Users className="h-8 w-8 text-slate-400" />
              </div>
              <p className="mb-1 text-base font-medium text-slate-700">
                还没有关注任何人
              </p>
              <p className="mb-6 text-sm text-slate-500">
                关注你感兴趣的人，这里会显示他们的最新动态
              </p>
              {recommendedUsers.length > 0 && (
                <div className="mx-auto max-w-sm space-y-3 px-4">
                  <p className="text-xs font-medium text-slate-500">
                    推荐关注
                  </p>
                  {recommendedUsers.slice(0, 5).map((rec) => (
                    <div
                      key={rec.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-2"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage
                          src={rec.avatarUrl ?? undefined}
                          alt={rec.nickname}
                        />
                        <AvatarFallback>
                          {rec.nickname.slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {rec.nickname}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {rec.bio || "有趣的人，值得关注"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={rec.isFollowed ? "secondary" : "default"}
                        onClick={() => void handleFollow(rec.id)}
                      >
                        {rec.isFollowed ? "已关注" : "关注"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {!showInitialSkeleton && !showSwitchingHint && !showFollowingEmpty && items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-500">
              {error ? `加载失败：${error}` : "当前频道暂无动态"}
            </div>
          ) : null}

          {items.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
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
              onBlockedChange={handleBlockedChange}
              onRemovedFromFeed={removeItem}
            />
          ))}

          {hasMore ? <div ref={loaderRef} className="h-10" /> : null}

          {loading && !initialLoading ? (
            <div className="py-3 text-center text-xs text-slate-500">
              <LoaderCircle className="mx-auto mb-1 h-4 w-4 animate-spin" />
              正在加载更多...
            </div>
          ) : null}
        </section>

        <aside className="hidden self-start lg:sticky lg:top-[var(--sidebar-sticky-top)] lg:block">
          <div className="space-y-3">
            {rightLoading && topics.length === 0 ? (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
              </div>
            ) : null}

            <HotSearchPanel
              topics={topics}
              loading={rightLoading}
              onRefresh={() =>
                void refreshTrending()
                  .then(setTopics)
                  .catch((err) => {
                    const parsed = parseApiError(err);
                    toast.error(parsed.message || "刷新失败");
                  })
              }
            />
            <RecommendedUsersPanel
              users={recommendedUsers}
              loading={rightLoading}
              onRefresh={() =>
                void refreshRecommendations()
                  .then((users) => setRecommendedUsers(users))
                  .catch((err) => {
                    const parsed = parseApiError(err);
                    toast.error(parsed.message || "刷新失败");
                  })
              }
              onFollow={(userId) => {
                void handleFollow(userId);
              }}
            />
            <CreatorCenterPanel user={user} />
          </div>
        </aside>
      </div>

      <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>登录后可继续互动</DialogTitle>
            <DialogDescription>
              点赞、评论、转发、关注和发布功能都需要先登录账号。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoginDialogOpen(false)}>
              稍后再说
            </Button>
            <Button
              onClick={() => {
                setLoginDialogOpen(false);
                navigate("/login", { state: { from: "/" } });
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
