import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BookmarkPlus,
  Check,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { FeedCard } from "@/components/discovery/feed-card";
import { AddToFavoritesDialog } from "@/components/discovery/add-to-favorites-dialog";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createFavoriteFolder,
  deleteFavoriteFolder,
  fetchFavoriteFolders,
  fetchFavoritePosts,
  removePostFromFavorites,
  renameFavoriteFolder,
} from "@/api/favorites";
import { createRepost, toggleFollow, toggleLike } from "@/api/discovery";
import { parseApiError } from "@/lib/api-error";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FavoriteFolder, FavoriteStatus, FeedItem } from "@/types/models";

const PAGE_SIZE = 10;

function CardSkeleton() {
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
      </div>
    </div>
  );
}

interface FolderMenuState {
  folderId: number;
  x: number;
  y: number;
}

export default function FavoritesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loginDialogOpen, setLoginDialogOpen] = useState(false);

  const [folders, setFolders] = useState<FavoriteFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<number | undefined>(undefined);
  const [foldersLoading, setFoldersLoading] = useState(true);

  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsInitialLoading, setPostsInitialLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FavoriteFolder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSubmitting, setRenameSubmitting] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FavoriteFolder | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderSubmitting, setNewFolderSubmitting] = useState(false);

  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogPost, setAddDialogPost] = useState<FeedItem | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (folderMenuRef.current && !folderMenuRef.current.contains(event.target as Node)) {
        setFolderMenu(null);
      }
    };
    if (folderMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [folderMenu]);

  const loadFolders = useCallback(async () => {
    setFoldersLoading(true);
    try {
      const data = await fetchFavoriteFolders();
      setFolders(data);
      if (activeFolderId === undefined) {
        const defaultFolder = data.find((f) => f.isDefault) ?? data[0];
        if (defaultFolder) {
          setActiveFolderId(defaultFolder.id);
        }
      } else {
        const stillExists = data.some((f) => f.id === activeFolderId);
        if (!stillExists) {
          const fallback = data.find((f) => f.isDefault) ?? data[0];
          setActiveFolderId(fallback?.id);
        }
      }
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message || "收藏夹加载失败");
    } finally {
      setFoldersLoading(false);
    }
  }, [activeFolderId]);

  useEffect(() => {
    void loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === activeFolderId),
    [folders, activeFolderId]
  );

  const totalCount = useMemo(
    () => folders.reduce((acc, f) => acc + f.itemCount, 0),
    [folders]
  );

  const resetAndLoadPosts = useCallback(async () => {
    if (activeFolderId === undefined) return;
    setPosts([]);
    setPostsInitialLoading(true);
    setNextCursor(null);
    setHasMore(true);
    try {
      const page = await fetchFavoritePosts(activeFolderId, null, PAGE_SIZE);
      setPosts(page.items);
      setNextCursor(page.nextCursor);
      setHasMore(Boolean(page.nextCursor));
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message || "收藏列表加载失败");
    } finally {
      setPostsInitialLoading(false);
    }
  }, [activeFolderId]);

  useEffect(() => {
    if (activeFolderId !== undefined) {
      void resetAndLoadPosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolderId]);

  const loadMorePosts = useCallback(async () => {
    if (postsLoading || !hasMore || !nextCursor || activeFolderId === undefined) return;
    setPostsLoading(true);
    try {
      const page = await fetchFavoritePosts(activeFolderId, nextCursor, PAGE_SIZE);
      setPosts((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
      setHasMore(Boolean(page.nextCursor));
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message || "加载更多失败");
    } finally {
      setPostsLoading(false);
    }
  }, [postsLoading, hasMore, nextCursor, activeFolderId]);

  useEffect(() => {
    if (!loaderRef.current || postsInitialLoading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void loadMorePosts();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [loadMorePosts, postsInitialLoading]);

  const handleRename = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.warning("收藏夹名称不能为空");
      return;
    }
    if (trimmed.length > 20) {
      toast.warning("收藏夹名称最多 20 个字符");
      return;
    }
    setRenameSubmitting(true);
    try {
      const updated = await renameFavoriteFolder(renameTarget.id, trimmed);
      setFolders((prev) =>
        prev.map((f) => (f.id === renameTarget.id ? { ...f, name: updated.name } : f))
      );
      setRenameDialogOpen(false);
      setRenameTarget(null);
      setRenameValue("");
      toast.success("重命名成功");
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message || "重命名失败");
    } finally {
      setRenameSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await deleteFavoriteFolder(deleteTarget.id);
      await loadFolders();
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      toast.success("收藏夹已删除，其中的收藏项已移至默认收藏夹");
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message || "删除失败");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      toast.warning("收藏夹名称不能为空");
      return;
    }
    if (trimmed.length > 20) {
      toast.warning("收藏夹名称最多 20 个字符");
      return;
    }
    setNewFolderSubmitting(true);
    try {
      const folder = await createFavoriteFolder(trimmed);
      setFolders((prev) => [...prev, folder]);
      setActiveFolderId(folder.id);
      setNewFolderDialogOpen(false);
      setNewFolderName("");
      toast.success("收藏夹创建成功");
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message || "创建失败");
    } finally {
      setNewFolderSubmitting(false);
    }
  };

  const optimisticUpdateAfterUnfavorite = useCallback(
    (postId: number, deltaFolderCount = -1) => {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      if (activeFolderId !== undefined) {
        setFolders((prev) =>
          prev.map((f) =>
            f.id === activeFolderId
              ? { ...f, itemCount: Math.max(0, f.itemCount + deltaFolderCount) }
              : f
          )
        );
      }
    },
    [activeFolderId]
  );

  const handleCardFavoriteToggle = useCallback(
    async (item: FeedItem) => {
      const hadAny = item.favoritedInFolders && item.favoritedInFolders.length > 0;
      optimisticUpdateAfterUnfavorite(item.id, -1);
      try {
        if (hadAny) {
          const params =
            activeFolderId !== undefined
              ? { folderId: activeFolderId }
              : undefined;
          const status = await removePostFromFavorites(item.id, params?.folderId);
          if (status.isFavorited) {
            setPosts((prev) => prev.filter((p) => p.id !== item.id));
          }
        }
      } catch (err) {
        const parsed = parseApiError(err);
        toast.error(parsed.message || "取消收藏失败");
        await resetAndLoadPosts();
      }
    },
    [activeFolderId, optimisticUpdateAfterUnfavorite, resetAndLoadPosts]
  );

  const handleCardFavoriteStatusChange = useCallback(
    (postId: number, status: FavoriteStatus) => {
      if (activeFolderId === undefined) return;
      const stillInThisFolder = status.favoritedInFolders.includes(activeFolderId);
      const inFolderCount = status.favoritedInFolders.filter(
        (fid) => fid === activeFolderId
      ).length;
      const wasInFolder =
        posts.find((p) => p.id === postId)?.favoritedInFolders?.includes(activeFolderId) ??
        false;

      setPosts((prev) => {
        if (!stillInThisFolder) {
          return prev.filter((p) => p.id !== postId);
        }
        return prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                isFavorited: status.isFavorited,
                favoritedInFolders: status.favoritedInFolders,
              }
            : p
        );
      });

      setFolders((prev) =>
        prev.map((f) => {
          if (f.id !== activeFolderId) return f;
          let next = f.itemCount;
          if (!wasInFolder && inFolderCount > 0) next += 1;
          if (wasInFolder && inFolderCount === 0) next = Math.max(0, next - 1);
          return { ...f, itemCount: next };
        })
      );
    },
    [activeFolderId, posts]
  );

  const requireLogin = useCallback(() => {
    setLoginDialogOpen(true);
  }, []);

  const updatePostItem = useCallback((next: FeedItem) => {
    setPosts((prev) => prev.map((item) => (item.id === next.id ? next : item)));
  }, []);

  const removePostItem = useCallback((postId: number) => {
    setPosts((prev) => prev.filter((item) => item.id !== postId));
  }, []);

  const handleBlockedChange = useCallback((authorId: number, isBlocked: boolean) => {
    if (isBlocked) {
      setPosts((prev) => prev.filter((item) => item.author.id !== authorId));
    }
  }, []);

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
        likesCount: item.likesCount + (item.isLiked ? -1 : 1),
      });
      try {
        const next = await toggleLike(item.id);
        updatePostItem(next);
      } catch (err) {
        updatePostItem(snapshot);
        const parsed = parseApiError(err);
        toast.error(parsed.message || "点赞操作失败");
      }
    },
    [requireLogin, updatePostItem, user],
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
        repostsCount: item.repostsCount + 1,
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
    [requireLogin, updatePostItem, user],
  );

  const handleFollow = useCallback(
    async (authorId: number) => {
      if (!user) {
        requireLogin();
        return;
      }
      const target = posts.find((item) => item.author.id === authorId);
      const nextFollowState = target ? !target.author.isFollowed : true;
      const snapshot = posts;
      setPosts((prev) =>
        prev.map((item) =>
          item.author.id === authorId
            ? { ...item, author: { ...item.author, isFollowed: nextFollowState } }
            : item,
        ),
      );
      try {
        const payload = await toggleFollow(authorId);
        setPosts((prev) =>
          prev.map((item) =>
            item.author.id === authorId
              ? { ...item, author: { ...item.author, isFollowed: payload.isFollowed } }
              : item,
          ),
        );
      } catch (err) {
        setPosts(snapshot);
        const parsed = parseApiError(err);
        toast.error(parsed.message || "关注操作失败");
      }
    },
    [posts, requireLogin, user],
  );

  const handleCommentsCountChange = useCallback(
    (postId: number, delta: number) => {
      setPosts((prev) =>
        prev.map((item) =>
          item.id === postId
            ? { ...item, commentsCount: Math.max(0, item.commentsCount + delta) }
            : item,
        ),
      );
    },
    [],
  );

  const showPostsEmpty = !postsInitialLoading && posts.length === 0;

  return (
    <main className="mx-auto w-full max-w-[1320px] px-3 pb-10 pt-4 md:px-4 lg:px-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)]">
        <section className="min-w-0 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                  <Bookmark className="h-5 w-5" />
                </span>
                <div>
                  <h1 className="text-lg font-semibold text-slate-800">我的收藏</h1>
                  <p className="text-xs text-slate-500">
                    共 {folders.length} 个分组，{formatCount(totalCount)} 条收藏内容
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setNewFolderName("");
                  setNewFolderDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                <BookmarkPlus className="h-4 w-4" />
                新建分组
              </Button>
            </div>

            {foldersLoading ? (
              <div className="flex gap-2">
                <Skeleton className="h-9 w-24 rounded-lg" />
                <Skeleton className="h-9 w-24 rounded-lg" />
                <Skeleton className="h-9 w-20 rounded-lg" />
              </div>
            ) : folders.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">
                还没有任何收藏夹
              </div>
            ) : (
              <Tabs
                value={String(activeFolderId ?? "")}
                onValueChange={(value) => setActiveFolderId(Number(value))}
              >
                <TabsList className="w-full flex-wrap">
                  {folders.map((folder) => (
                    <div key={folder.id} className="relative inline-flex">
                      <TabsTrigger
                        value={String(folder.id)}
                        className={cn(
                          "relative pr-8",
                          folder.isDefault && "pl-3"
                        )}
                      >
                        <span className="truncate">
                          {folder.name}
                          <span className="ml-1 text-xs opacity-70">
                            ({formatCount(folder.itemCount)})
                          </span>
                        </span>
                      </TabsTrigger>
                      {!folder.isDefault ? (
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 pr-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-slate-400 hover:text-slate-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setFolderMenu({
                                folderId: folder.id,
                                x: rect.right - 140,
                                y: rect.bottom + 4,
                              });
                            }}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </TabsList>
              </Tabs>
            )}

            {folderMenu ? (
              <div
                ref={folderMenuRef}
                className="fixed z-50 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
                style={{ left: folderMenu.x, top: folderMenu.y }}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => {
                    const target = folders.find((f) => f.id === folderMenu.folderId);
                    if (target) {
                      setRenameTarget(target);
                      setRenameValue(target.name);
                      setRenameDialogOpen(true);
                    }
                    setFolderMenu(null);
                  }}
                >
                  <Pencil className="h-4 w-4" /> 重命名
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                  onClick={() => {
                    const target = folders.find((f) => f.id === folderMenu.folderId);
                    if (target) {
                      setDeleteTarget(target);
                      setDeleteConfirmOpen(true);
                    }
                    setFolderMenu(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" /> 删除
                </button>
              </div>
            ) : null}
          </div>

          {postsInitialLoading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : null}

          {showPostsEmpty ? (
            <Card className="border border-slate-200">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                  <Bookmark className="h-7 w-7 text-slate-400" />
                </div>
                <h3 className="text-sm font-semibold text-slate-700">
                  这个分组还没有收藏
                </h3>
                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  浏览动态时点击「收藏」按钮，即可把喜欢的内容保存到这里
                </p>
                <Button
                  className="mt-4"
                  size="sm"
                  onClick={() => navigate("/")}
                >
                  去发现页看看
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {!postsInitialLoading
            ? posts.map((item) => (
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
                  onFavoriteToggle={handleCardFavoriteToggle}
                  onFavoriteStatusChange={handleCardFavoriteStatusChange}
                  onBlockedChange={handleBlockedChange}
                  onRemovedFromFeed={removePostItem}
                />
              ))
            : null}

          {hasMore && !postsInitialLoading ? (
            <div ref={loaderRef} className="h-10" />
          ) : null}

          {postsLoading && !postsInitialLoading ? (
            <div className="py-3 text-center text-xs text-slate-500">
              <LoaderCircle className="mx-auto mb-1 h-4 w-4 animate-spin" />
              正在加载更多...
            </div>
          ) : null}
        </section>
      </div>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名分组</DialogTitle>
            <DialogDescription>
              修改分组名称（1-20 个字符），同一用户下分组名称不能重复。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="输入新的分组名称"
              maxLength={20}
              autoFocus
              disabled={renameSubmitting}
            />
            <p className="text-right text-xs text-slate-500">
              {renameValue.length}/20
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameDialogOpen(false);
                setRenameTarget(null);
                setRenameValue("");
              }}
              disabled={renameSubmitting}
            >
              取消
            </Button>
            <Button onClick={handleRename} disabled={renameSubmitting}>
              {renameSubmitting ? (
                <>
                  <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
                  保存中
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  保存
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>新建收藏夹分组</DialogTitle>
            <DialogDescription>
              创建一个新的收藏夹分组，用于分类整理你收藏的动态。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="输入分组名称（1-20 字）"
              maxLength={20}
              autoFocus
              disabled={newFolderSubmitting}
            />
            <p className="text-right text-xs text-slate-500">
              {newFolderName.length}/20
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewFolderDialogOpen(false);
                setNewFolderName("");
              }}
              disabled={newFolderSubmitting}
            >
              取消
            </Button>
            <Button onClick={handleCreateFolder} disabled={newFolderSubmitting}>
              {newFolderSubmitting ? (
                <>
                  <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
                  创建中
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  创建
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除分组？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，该分组内的所有收藏项将被移动到「默认收藏」分组中。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteConfirmOpen(false);
                setDeleteTarget(null);
              }}
              disabled={deleteSubmitting}
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteSubmitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteSubmitting ? (
                <>
                  <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
                  删除中
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  确认删除
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {addDialogPost ? (
        <AddToFavoritesDialog
          open={addDialogOpen}
          onOpenChange={(open) => {
            setAddDialogOpen(open);
            if (!open) setAddDialogPost(null);
          }}
          postId={addDialogPost.id}
          initialFavoritedInFolders={addDialogPost.favoritedInFolders ?? []}
          onStatusChange={(status) =>
            handleCardFavoriteStatusChange(addDialogPost.id, status)
          }
        />
      ) : null}

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
