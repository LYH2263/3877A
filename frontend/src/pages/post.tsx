import { useCallback, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import {
  createRepost,
  fetchPostDetail,
  fetchRecommendations,
  fetchTrending,
  refreshRecommendations,
  refreshTrending,
  toggleFollow,
  toggleLike,
} from "@/api/discovery";
import { CreatorCenterPanel } from "@/components/discovery/creator-center-panel";
import { FeedCard } from "@/components/discovery/feed-card";
import { HotSearchPanel } from "@/components/discovery/hot-search-panel";
import { RecommendedUsersPanel } from "@/components/discovery/recommended-users-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/auth-context";
import { parseApiError } from "@/lib/api-error";
import type { FeedItem, RecommendedUser, TrendingTopic } from "@/types/models";

export default function PostDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const postId = Number(params.id);
  const [item, setItem] = useState<FeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [recommendedUsers, setRecommendedUsers] = useState<RecommendedUser[]>([]);
  const [rightLoading, setRightLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!Number.isFinite(postId)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await fetchPostDetail(postId);
      setItem(payload);
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "动态详情加载失败");
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const loadRight = useCallback(async () => {
    setRightLoading(true);
    try {
      const [topicData, userData] = await Promise.all([fetchTrending(), fetchRecommendations()]);
      setTopics(topicData);
      setRecommendedUsers(userData);
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "侧边数据加载失败");
    } finally {
      setRightLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRight();
  }, [loadRight]);

  const requireLogin = () => {
    setLoginDialogOpen(true);
  };

  const optimisticMutation = async (updater: (target: FeedItem) => FeedItem, submitter: () => Promise<FeedItem>, fallbackMessage: string) => {
    if (!item) {
      return;
    }

    const snapshot = item;
    setItem(updater(item));

    try {
      const payload = await submitter();
      setItem(payload);
    } catch (error) {
      setItem(snapshot);
      const parsed = parseApiError(error);
      toast.error(parsed.message || fallbackMessage);
    }
  };

  const handleEdited = useCallback(
    (updated: FeedItem) => {
      setItem(updated);
    },
    [],
  );

  const handleDeleted = useCallback(
    (postId: number) => {
      setItem(null);
      toast.success("动态已删除");
      setTimeout(() => navigate(-1), 500);
    },
    [navigate],
  );

  const handleLike = async () => {
    if (!item) {
      return;
    }
    if (!user) {
      requireLogin();
      return;
    }

    await optimisticMutation(
      (target) => ({
        ...target,
        isLiked: !target.isLiked,
        likesCount: target.likesCount + (target.isLiked ? -1 : 1)
      }),
      () => toggleLike(item.id),
      "点赞操作失败"
    );
  };

  const handleRepost = async (content: string) => {
    if (!item) {
      return;
    }
    if (!user) {
      requireLogin();
      return;
    }

    const snapshot = item;
    setItem({
      ...item,
      isReposted: true,
      repostsCount: item.repostsCount + 1
    });

    try {
      const payload = await createRepost(item.id, content);
      setItem(payload.sourcePost);
      toast.success("转发成功，已发布到你的主页");
    } catch (error) {
      setItem(snapshot);
      const parsed = parseApiError(error);
      toast.error(parsed.message || "转发操作失败");
    }
  };

  const handleFollow = async (targetUserId: number) => {
    if (!user) {
      requireLogin();
      return;
    }

    const currentFollowed = recommendedUsers.find((entry) => entry.id === targetUserId)?.isFollowed;
    const postFollowed = item?.author.id === targetUserId ? item.author.isFollowed : undefined;
    const nextFollowed = !(currentFollowed ?? postFollowed ?? false);
    const recommendedSnapshot = recommendedUsers;
    const postSnapshot = item;

    setRecommendedUsers((prev) =>
      prev.map((entry) => (entry.id === targetUserId ? { ...entry, isFollowed: nextFollowed } : entry))
    );
    setItem((prev) => {
      if (!prev || prev.author.id !== targetUserId) {
        return prev;
      }
      return {
        ...prev,
        author: {
          ...prev.author,
          isFollowed: nextFollowed
        }
      };
    });

    try {
      const payload = await toggleFollow(targetUserId);
      setItem((prev) => {
        if (!prev || prev.author.id !== targetUserId) {
          return prev;
        }
        return {
          ...prev,
          author: {
            ...prev.author,
            isFollowed: payload.isFollowed
          }
        };
      });
      setRecommendedUsers((prev) =>
        prev.map((entry) => (entry.id === targetUserId ? { ...entry, isFollowed: payload.isFollowed } : entry))
      );
    } catch (error) {
      setItem(postSnapshot);
      setRecommendedUsers(recommendedSnapshot);
      const parsed = parseApiError(error);
      toast.error(parsed.message || "关注操作失败");
    }
  };

  if (loading) {
    return (
      <main className="mx-auto mt-10 w-full max-w-[1320px] px-4 text-center text-slate-500">
        <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />
        正在加载动态...
      </main>
    );
  }

  if (!item) {
    return <main className="mx-auto mt-10 w-full max-w-[1320px] px-4 text-center text-slate-500">动态不存在或已删除</main>;
  }

  return (
    <main className="mx-auto mt-4 w-full max-w-[1320px] px-3 pb-12 md:px-4 lg:px-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <div className="mb-3 text-sm text-slate-500">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              返回
            </Button>
          </div>
          <FeedCard
            item={item}
            isLoggedIn={Boolean(user)}
            currentUserId={user?.id}
            onLike={() => handleLike()}
            onRepost={(_target, content) => handleRepost(content)}
            onFollow={handleFollow}
            onRequireLogin={requireLogin}
            onCommentsCountChange={(_postId, delta) => {
              setItem((prev) => {
                if (!prev) {
                  return prev;
                }
                return {
                  ...prev,
                  commentsCount: Math.max(0, prev.commentsCount + delta),
                };
              });
            }}
            onEdited={handleEdited}
            onDeleted={handleDeleted}
          />
        </section>

        <aside className="hidden lg:block">
          <div className="sticky top-[var(--sidebar-sticky-top)] h-[var(--sidebar-sticky-height)] space-y-3 overflow-y-auto overscroll-contain pr-1">
            <HotSearchPanel
              topics={topics}
              loading={rightLoading}
              onRefresh={() =>
                void refreshTrending()
                  .then(setTopics)
                  .catch((error) => {
                    const parsed = parseApiError(error);
                    toast.error(parsed.message || "刷新失败");
                  })
              }
            />
            <RecommendedUsersPanel
              users={recommendedUsers}
              loading={rightLoading}
              onRefresh={() =>
                void refreshRecommendations()
                  .then(setRecommendedUsers)
                  .catch((error) => {
                    const parsed = parseApiError(error);
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
            <DialogDescription>点赞、评论、转发和关注功能都需要先登录账号。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoginDialogOpen(false)}>
              稍后再说
            </Button>
            <Button
              onClick={() => {
                setLoginDialogOpen(false);
                navigate("/login", { state: { from: `/post/${item.id}` } });
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
