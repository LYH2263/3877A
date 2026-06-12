import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Edit3,
  LoaderCircle,
  PenSquare,
  UserPlus
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { createRepost, fetchProfileFeed, fetchProfileOverview, toggleFollow, toggleLike } from "@/api/discovery";
import { FeedCard } from "@/components/discovery/feed-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/auth-context";
import { parseApiError } from "@/lib/api-error";
import { formatCount } from "@/lib/format";
import type { FeedItem, ProfileFeedTab, ProfileOverviewPayload } from "@/types/models";

const DEFAULT_TAB: ProfileFeedTab = "posts";
const TAB_OPTIONS: Array<{ key: ProfileFeedTab; label: string }> = [
  { key: "posts", label: "动态" },
  { key: "media", label: "媒体" },
  { key: "likes", label: "点赞" }
];

function parseTab(raw: string | null): ProfileFeedTab {
  if (raw === "posts" || raw === "media" || raw === "likes") {
    return raw;
  }
  return DEFAULT_TAB;
}

function mergeItems(prev: FeedItem[], incoming: FeedItem[]) {
  if (incoming.length === 0) {
    return prev;
  }
  const map = new Map(prev.map((item, index) => [item.id, index]));
  const next = [...prev];
  incoming.forEach((item) => {
    const index = map.get(item.id);
    if (index === undefined) {
      next.push(item);
      return;
    }
    next[index] = item;
  });
  return next;
}

function formatJoinDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function FeedCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const userId = Number(params.id);
  const [overview, setOverview] = useState<ProfileOverviewPayload | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [initialFeedLoading, setInitialFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [tab, setTab] = useState<ProfileFeedTab>(() => parseTab(searchParams.get("tab")));
  const isSelfProfile = overview?.relationship.isSelf ?? false;
  const hasOverview = Boolean(overview);

  const visibleTabs = useMemo(() => {
    if (!overview?.relationship.isSelf) {
      return TAB_OPTIONS.filter((item) => item.key !== "likes");
    }
    return TAB_OPTIONS;
  }, [overview?.relationship.isSelf]);

  const runRequireLogin = useCallback(() => {
    setLoginDialogOpen(true);
  }, []);

  useEffect(() => {
    const next = parseTab(searchParams.get("tab"));
    setTab((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  const handleTabChange = useCallback(
    (next: ProfileFeedTab) => {
      if (next === "likes" && !overview?.relationship.isSelf) {
        return;
      }

      setTab(next);
      const paramsClone = new URLSearchParams(searchParams);
      if (next === DEFAULT_TAB) {
        paramsClone.delete("tab");
      } else {
        paramsClone.set("tab", next);
      }
      setSearchParams(paramsClone, { replace: true });
    },
    [overview?.relationship.isSelf, searchParams, setSearchParams]
  );

  useEffect(() => {
    if (!Number.isFinite(userId)) {
      setOverviewLoading(false);
      return;
    }

    const run = async () => {
      setOverviewLoading(true);
      try {
        const payload = await fetchProfileOverview(userId);
        setOverview(payload);

        if (!payload.relationship.isSelf && tab === "likes") {
          const paramsClone = new URLSearchParams(searchParams);
          paramsClone.delete("tab");
          setSearchParams(paramsClone, { replace: true });
          setTab(DEFAULT_TAB);
        }
      } catch (error) {
        const parsed = parseApiError(error);
        toast.error(parsed.message || "用户主页加载失败");
        setOverview(null);
      } finally {
        setOverviewLoading(false);
      }
    };

    void run();
  }, [userId, tab, searchParams, setSearchParams]);

  useEffect(() => {
    if (!Number.isFinite(userId)) {
      setInitialFeedLoading(false);
      return;
    }

    if (overviewLoading || !hasOverview) {
      return;
    }
    if (tab === "likes" && !isSelfProfile) {
      return;
    }

    let active = true;

    const run = async () => {
      setFeedItems([]);
      setCursor(null);
      setHasMore(true);
      setFeedError(null);
      setInitialFeedLoading(true);
      setFeedLoading(true);

      try {
        const page = await fetchProfileFeed(userId, tab, null, 10);
        if (!active) {
          return;
        }
        setFeedItems(page.items);
        setCursor(page.nextCursor);
        setHasMore(Boolean(page.nextCursor));
        setFeedError(null);
      } catch (error) {
        if (!active) {
          return;
        }
        const parsed = parseApiError(error);
        setFeedError(parsed.message || "加载失败");
        if (parsed.status !== 401 && parsed.status !== 403) {
          toast.error(parsed.message || "动态列表加载失败");
        }
      } finally {
        if (active) {
          setFeedLoading(false);
          setInitialFeedLoading(false);
        }
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [tab, userId, overviewLoading, isSelfProfile, hasOverview]);

  const loadMoreFeed = useCallback(async () => {
    if (!Number.isFinite(userId)) {
      return;
    }
    if (feedLoading || !hasMore) {
      return;
    }

    setFeedLoading(true);
    try {
      const page = await fetchProfileFeed(userId, tab, cursor, 10);
      setFeedItems((prev) => mergeItems(prev, page.items));
      setCursor(page.nextCursor);
      setHasMore(Boolean(page.nextCursor));
      setFeedError(null);
    } catch (error) {
      const parsed = parseApiError(error);
      setFeedError(parsed.message || "加载失败");
      if (parsed.status !== 401 && parsed.status !== 403) {
        toast.error(parsed.message || "动态列表加载失败");
      }
    } finally {
      setFeedLoading(false);
    }
  }, [cursor, feedLoading, hasMore, tab, userId]);

  const updateFeedItem = useCallback((nextItem: FeedItem) => {
    setFeedItems((prev) => prev.map((item) => (item.id === nextItem.id ? nextItem : item)));
  }, []);

  const removeFeedItem = useCallback((postId: number) => {
    const targetItem = feedItems.find((item) => item.id === postId);
    setFeedItems((prev) => prev.filter((item) => item.id !== postId));
    if (overview && targetItem && !targetItem.repostOf && overview.relationship.isSelf) {
      const hasMedia = targetItem.media.length > 0;
      setOverview((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          summary: {
            ...prev.summary,
            postsCount: Math.max(0, prev.summary.postsCount - 1),
            mediaCount: Math.max(0, prev.summary.mediaCount - (hasMedia ? 1 : 0)),
          },
        };
      });
    }
  }, [feedItems, overview]);

  const handleEdited = useCallback(
    (updated: FeedItem) => {
      updateFeedItem(updated);
    },
    [updateFeedItem],
  );

  const handleDeleted = useCallback((postId: number) => {
    removeFeedItem(postId);
  }, [removeFeedItem]);

  const handleSummaryDelta = useCallback((key: "totalLikes" | "totalComments" | "totalReposts", delta: number) => {
    if (!delta) {
      return;
    }
    setOverview((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        summary: {
          ...prev.summary,
          [key]: Math.max(0, prev.summary[key] + delta)
        }
      };
    });
  }, []);

  const handleLike = useCallback(
    async (item: FeedItem) => {
      if (!overview) {
        return;
      }

      if (!user) {
        runRequireLogin();
        return;
      }

      if (tab === "likes" && item.isLiked) {
        const snapshotItems = feedItems;
        setFeedItems((prev) => prev.filter((target) => target.id !== item.id));
        setOverview((prev) => {
          if (!prev || prev.summary.likesCountVisible === null) {
            return prev;
          }
          return {
            ...prev,
            summary: {
              ...prev.summary,
              likesCountVisible: Math.max(0, prev.summary.likesCountVisible - 1)
            }
          };
        });

        try {
          await toggleLike(item.id);
        } catch (error) {
          setFeedItems(snapshotItems);
          setOverview((prev) => {
            if (!prev || prev.summary.likesCountVisible === null) {
              return prev;
            }
            return {
              ...prev,
              summary: {
                ...prev.summary,
                likesCountVisible: prev.summary.likesCountVisible + 1
              }
            };
          });
          const parsed = parseApiError(error);
          toast.error(parsed.message || "点赞操作失败");
        }
        return;
      }

      const snapshot = item;
      updateFeedItem({
        ...item,
        isLiked: !item.isLiked,
        likesCount: item.likesCount + (item.isLiked ? -1 : 1)
      });

      setOverview((prev) => {
        if (!prev || prev.summary.likesCountVisible === null || !prev.relationship.isSelf) {
          return prev;
        }
        return {
          ...prev,
          summary: {
            ...prev.summary,
            likesCountVisible: Math.max(0, prev.summary.likesCountVisible + (item.isLiked ? -1 : 1))
          }
        };
      });

      try {
        const next = await toggleLike(item.id);
        updateFeedItem(next);
        if (next.author.id === overview.user.id) {
          handleSummaryDelta("totalLikes", next.likesCount - snapshot.likesCount);
        }
      } catch (error) {
        updateFeedItem(snapshot);
        setOverview((prev) => {
          if (!prev || prev.summary.likesCountVisible === null || !prev.relationship.isSelf) {
            return prev;
          }
          return {
            ...prev,
            summary: {
              ...prev.summary,
              likesCountVisible: Math.max(0, prev.summary.likesCountVisible + (item.isLiked ? 1 : -1))
            }
          };
        });
        const parsed = parseApiError(error);
        toast.error(parsed.message || "点赞操作失败");
      }
    },
    [feedItems, handleSummaryDelta, overview, runRequireLogin, tab, updateFeedItem, user]
  );

  const handleRepost = useCallback(
    async (item: FeedItem, content: string) => {
      if (!overview) {
        return;
      }

      if (!user) {
        runRequireLogin();
        return;
      }

      const snapshot = item;
      updateFeedItem({
        ...item,
        isReposted: true,
        repostsCount: item.repostsCount + 1
      });

      try {
        const payload = await createRepost(item.id, content);
        updateFeedItem(payload.sourcePost);
        if (payload.sourcePost.author.id === overview.user.id) {
          handleSummaryDelta("totalReposts", payload.sourcePost.repostsCount - snapshot.repostsCount);
        }

        if (overview.relationship.isSelf) {
          setOverview((prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              summary: {
                ...prev.summary,
                postsCount: prev.summary.postsCount + 1
              }
            };
          });

          if (tab === "posts") {
            setFeedItems((prev) => [payload.repostPost, ...prev.filter((target) => target.id !== payload.repostPost.id)]);
          }
        }
        toast.success("转发成功，已发布到你的主页");
      } catch (error) {
        updateFeedItem(snapshot);
        const parsed = parseApiError(error);
        toast.error(parsed.message || "转发操作失败");
      }
    },
    [handleSummaryDelta, overview, runRequireLogin, tab, updateFeedItem, user]
  );

  const handleHeaderFollow = useCallback(async () => {
    if (!overview || overview.relationship.isSelf) {
      return;
    }

    if (!user) {
      runRequireLogin();
      return;
    }

    const nextFollow = !overview.relationship.isFollowed;
    setOverview((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        relationship: {
          ...prev.relationship,
          isFollowed: nextFollow
        },
        user: {
          ...prev.user,
          followersCount: Math.max(0, prev.user.followersCount + (nextFollow ? 1 : -1))
        }
      };
    });
    setFeedItems((prev) =>
      prev.map((item) =>
        item.author.id === overview.user.id
          ? {
              ...item,
              author: {
                ...item.author,
                isFollowed: nextFollow
              }
            }
          : item
      )
    );

    try {
      const payload = await toggleFollow(overview.user.id);
      setOverview((prev) => {
        if (!prev) {
          return prev;
        }
        const delta = payload.isFollowed === prev.relationship.isFollowed ? 0 : payload.isFollowed ? 1 : -1;
        return {
          ...prev,
          relationship: {
            ...prev.relationship,
            isFollowed: payload.isFollowed
          },
          user: {
            ...prev.user,
            followersCount: Math.max(0, prev.user.followersCount + delta)
          }
        };
      });
      setFeedItems((prev) =>
        prev.map((item) =>
          item.author.id === overview.user.id
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
    } catch (error) {
      setOverview((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          relationship: {
            ...prev.relationship,
            isFollowed: !nextFollow
          },
          user: {
            ...prev.user,
            followersCount: Math.max(0, prev.user.followersCount + (!nextFollow ? 1 : -1))
          }
        };
      });
      setFeedItems((prev) =>
        prev.map((item) =>
          item.author.id === overview.user.id
            ? {
                ...item,
                author: {
                  ...item.author,
                  isFollowed: !nextFollow
                }
              }
            : item
        )
      );
      const parsed = parseApiError(error);
      toast.error(parsed.message || "关注操作失败");
    }
  }, [overview, runRequireLogin, user]);

  const handleItemFollow = useCallback(
    async (authorId: number) => {
      if (!overview) {
        return;
      }

      if (!user) {
        runRequireLogin();
        return;
      }

      const targetFromList = feedItems.find((item) => item.author.id === authorId);
      const nextFollowState = targetFromList ? !targetFromList.author.isFollowed : true;
      const listSnapshot = feedItems;
      const overviewSnapshot = overview;

      setFeedItems((prev) =>
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
      if (authorId === overview.user.id && !overview.relationship.isSelf) {
        setOverview((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            relationship: {
              ...prev.relationship,
              isFollowed: nextFollowState
            },
            user: {
              ...prev.user,
              followersCount: Math.max(0, prev.user.followersCount + (nextFollowState ? 1 : -1))
            }
          };
        });
      }

      try {
        const payload = await toggleFollow(authorId);
        setFeedItems((prev) =>
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
        if (authorId === overview.user.id && !overview.relationship.isSelf) {
          setOverview((prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              relationship: {
                ...prev.relationship,
                isFollowed: payload.isFollowed
              }
            };
          });
        }
      } catch (error) {
        setFeedItems(listSnapshot);
        setOverview(overviewSnapshot);
        const parsed = parseApiError(error);
        toast.error(parsed.message || "关注操作失败");
      }
    },
    [feedItems, overview, runRequireLogin, user]
  );

  const handleCommentsCountChange = useCallback(
    (postId: number, delta: number) => {
      setFeedItems((prev) =>
        prev.map((item) =>
          item.id === postId
            ? {
                ...item,
                commentsCount: Math.max(0, item.commentsCount + delta)
              }
            : item
        )
      );

      const target = feedItems.find((item) => item.id === postId);
      if (overview && target && target.author.id === overview.user.id) {
        handleSummaryDelta("totalComments", delta);
      }
    },
    [feedItems, handleSummaryDelta, overview]
  );

  if (overviewLoading) {
    return (
      <main className="mx-auto mt-6 w-full max-w-6xl px-4 pb-12">
        <Card className="mb-4">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-72" />
                <Skeleton className="h-4 w-44" />
              </div>
            </div>
          </CardContent>
        </Card>
        <FeedCardSkeleton />
      </main>
    );
  }

  if (!overview) {
    return <main className="mx-auto mt-10 w-full max-w-6xl px-4 text-center text-slate-500">用户不存在</main>;
  }

  return (
    <main className="mx-auto mt-6 w-full max-w-6xl px-4 pb-12">
      <Card className="mb-4 overflow-hidden border-slate-200">
        <div className="bg-gradient-to-r from-brand-50 via-white to-link-50/40 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <Avatar className="h-20 w-20 rounded-2xl border border-white shadow-sm">
                <AvatarImage src={overview.user.avatarUrl ?? undefined} alt={overview.user.nickname} />
                <AvatarFallback className="rounded-2xl text-xl">{overview.user.nickname.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold text-slate-900">{overview.user.nickname}</h1>
                  <Badge variant="secondary">{overview.user.level}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{overview.user.bio || "这个人很神秘，什么都没留下"}</p>
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  加入时间 {formatJoinDate(overview.user.createdAt)}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {overview.relationship.isSelf ? (
                <>
                  <Button variant="outline" asChild>
                    <Link to="/settings">
                      <Edit3 className="h-4 w-4" /> 编辑资料
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link to="/compose">
                      <PenSquare className="h-4 w-4" /> 发布动态
                    </Link>
                  </Button>
                </>
              ) : (
                <Button onClick={() => void handleHeaderFollow()} variant={overview.relationship.isFollowed ? "secondary" : "default"}>
                  <UserPlus className="h-4 w-4" />
                  {overview.relationship.isFollowed ? "已关注" : "关注"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">动态</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{formatCount(overview.summary.postsCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">媒体</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{formatCount(overview.summary.mediaCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">累计获赞</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{formatCount(overview.summary.totalLikes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">累计评论</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{formatCount(overview.summary.totalComments)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">累计转发</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{formatCount(overview.summary.totalReposts)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">粉丝 / 关注</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {formatCount(overview.user.followersCount)} / {formatCount(overview.user.followingCount)}
            </p>
          </CardContent>
        </Card>
      </section>

      <Card className="mb-3">
        <CardContent className="space-y-3 p-3">
          <Tabs value={tab} onValueChange={(value) => handleTabChange(value as ProfileFeedTab)}>
            <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:grid-cols-3">
              {visibleTabs.map((item) => (
                <TabsTrigger key={item.key} value={item.key}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {tab === "likes" && overview.relationship.isSelf ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              已点赞共 {formatCount(overview.summary.likesCountVisible ?? 0)} 条内容，取消点赞会从此列表移除。
            </div>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-3">
        {initialFeedLoading ? (
          <>
            <FeedCardSkeleton />
            <FeedCardSkeleton />
          </>
        ) : null}

        {!initialFeedLoading && feedItems.map((item) => (
          <FeedCard
            key={item.id}
            item={item}
            isLoggedIn={Boolean(user)}
            currentUserId={user?.id}
            onLike={handleLike}
            onRepost={handleRepost}
            onFollow={handleItemFollow}
            onRequireLogin={runRequireLogin}
            onCommentsCountChange={handleCommentsCountChange}
            showFollowButton={tab === "likes"}
            onEdited={handleEdited}
            onDeleted={handleDeleted}
          />
        ))}

        {!initialFeedLoading && feedItems.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center text-sm text-slate-500">
              {feedError ? `加载失败：${feedError}` : tab === "media" ? "暂无媒体内容" : tab === "likes" ? "你还没有点赞内容" : "暂无动态内容"}
            </CardContent>
          </Card>
        ) : null}

        {hasMore && !initialFeedLoading ? (
          <Button variant="outline" className="w-full" disabled={feedLoading} onClick={() => void loadMoreFeed()}>
            {feedLoading ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" /> 加载中...
              </>
            ) : (
              "加载更多"
            )}
          </Button>
        ) : null}
      </section>

      <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>登录后可继续互动</DialogTitle>
            <DialogDescription>点赞、评论、转发、关注等互动需要先登录账号。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoginDialogOpen(false)}>
              稍后再说
            </Button>
            <Button
              onClick={() => {
                setLoginDialogOpen(false);
                navigate("/login", { state: { from: `${location.pathname}${location.search}` } });
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
