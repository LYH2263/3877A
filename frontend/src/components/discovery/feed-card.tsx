import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, MessageCircle, MoreHorizontal, Pencil, Repeat2, Send, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchComments, createComment } from "@/api/discovery";
import { EditPostDialog } from "@/components/discovery/edit-post-dialog";
import { parseApiError } from "@/lib/api-error";
import { formatCount, formatRelativeTime } from "@/lib/format";
import type { CommentItem, FeedItem } from "@/types/models";

interface FeedCardProps {
  item: FeedItem;
  isLoggedIn: boolean;
  currentUserId?: number;
  onLike: (item: FeedItem) => Promise<void>;
  onRepost: (item: FeedItem, content: string) => Promise<void>;
  onFollow: (authorId: number) => Promise<void>;
  onRequireLogin: () => void;
  onCommentsCountChange: (postId: number, delta: number) => void;
  onEdited?: (updated: FeedItem) => void;
  onDeleted?: (postId: number) => void;
  showFollowButton?: boolean;
  showActionsMenu?: boolean;
}

function renderContent(content: string) {
  const tokens = content.split(/(#.*?#)/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (/^#.*#$/.test(token)) {
      const keyword = token.slice(1, -1);
      return (
        <Link key={`${token}-${index}`} to={`/topic/${encodeURIComponent(keyword)}`} className="font-medium text-link-500 hover:underline">
          {token}
        </Link>
      );
    }

    return <span key={`${token}-${index}`}>{token}</span>;
  });
}

function MediaBlock({
  mediaItems,
  imageIndexById,
  onPreviewImage
}: {
  mediaItems: FeedItem["media"];
  imageIndexById: Map<number, number>;
  onPreviewImage: (index: number) => void;
}) {
  if (mediaItems.length === 0) {
    return null;
  }

  if (mediaItems.length === 1 && mediaItems[0].type === "video") {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <video className="max-h-[420px] w-full bg-black" controls preload="metadata" src={mediaItems[0].url} />
      </div>
    );
  }

  const columns = mediaItems.length >= 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <div className={`grid gap-2 ${columns}`}>
      {mediaItems.map((media) =>
        media.type === "video" ? (
          <video
            key={media.id}
            className="h-40 w-full rounded-lg border border-slate-200 object-cover bg-black"
            controls
            preload="metadata"
            src={media.url}
          />
        ) : (
          <button
            key={media.id}
            type="button"
            className="overflow-hidden rounded-lg border border-slate-200 transition hover:opacity-95"
            onClick={() => {
              const index = imageIndexById.get(media.id);
              if (index !== undefined) {
                onPreviewImage(index);
              }
            }}
          >
            <img className="h-40 w-full object-cover" src={media.url} alt="动态配图" loading="lazy" />
          </button>
        )
      )}
    </div>
  );
}

export function FeedCard({
  item,
  isLoggedIn,
  currentUserId,
  onLike,
  onRepost,
  onFollow,
  onRequireLogin,
  onCommentsCountChange,
  onEdited,
  onDeleted,
  showFollowButton = true,
  showActionsMenu = true
}: FeedCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [repostDialogOpen, setRepostDialogOpen] = useState(false);
  const [repostInput, setRepostInput] = useState("");
  const [repostSubmitting, setRepostSubmitting] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAuthor = currentUserId !== undefined && item.author.id === currentUserId;

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const previewImages = useMemo(() => {
    const ownImages = item.media.filter((media) => media.type === "image");
    const quotedImages = item.repostOf && !item.repostOf.isDeleted ? item.repostOf.media.filter((media) => media.type === "image") : [];
    return [...ownImages, ...quotedImages];
  }, [item.media, item.repostOf]);
  const imageIndexById = useMemo(() => new Map(previewImages.map((media, index) => [media.id, index])), [previewImages]);
  const activePreviewImage = previewImages[previewImageIndex] ?? null;

  const canLoadMoreComments = useMemo(() => Boolean(commentsCursor), [commentsCursor]);

  const loadComments = async (reset = false) => {
    if (commentsLoading) {
      return;
    }

    setCommentsLoading(true);
    try {
      const page = await fetchComments(item.id, reset ? null : commentsCursor, 8);
      setComments((prev) => (reset ? page.items : [...prev, ...page.items]));
      setCommentsCursor(page.nextCursor);
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message || "评论加载失败");
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    if (commentsOpen && comments.length === 0) {
      void loadComments(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentsOpen]);

  const handleFollow = async () => {
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }
    await onFollow(item.author.id);
  };

  const handleLike = async () => {
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }
    await onLike(item);
  };

  const handleRepost = async () => {
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }

    if (item.isReposted) {
      toast.message("你已经转发过这条动态，可到个人主页查看");
      return;
    }

    setRepostInput("");
    setRepostDialogOpen(true);
  };

  const submitRepost = async () => {
    if (repostInput.length > 280) {
      toast.warning("短评最多 280 字");
      return;
    }

    setRepostSubmitting(true);
    try {
      await onRepost(item, repostInput.trim());
      setRepostDialogOpen(false);
      setRepostInput("");
    } finally {
      setRepostSubmitting(false);
    }
  };

  const handleCreateComment = async () => {
    const content = commentInput.trim();
    if (!content) {
      toast.warning("评论内容不能为空");
      return;
    }

    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }

    try {
      const comment = await createComment(item.id, content);
      setComments((prev) => [comment, ...prev]);
      setCommentInput("");
      onCommentsCountChange(item.id, 1);
      toast.success("评论成功");
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message || "评论失败，请稍后再试");
    }
  };

  const openImagePreview = (index: number) => {
    setPreviewImageIndex(index);
    setPreviewOpen(true);
  };

  const handlePreviewStep = (direction: "prev" | "next") => {
    if (previewImages.length <= 1) {
      return;
    }

    setPreviewImageIndex((prev) => {
      if (direction === "prev") {
        return prev === 0 ? previewImages.length - 1 : prev - 1;
      }
      return prev === previewImages.length - 1 ? 0 : prev + 1;
    });
  };

  const handleDelete = async () => {
    if (!isAuthor || !onDeleted) {
      return;
    }

    setDeleting(true);
    try {
      const { deletePost } = await import("@/api/discovery");
      await deletePost(item.id);
      onDeleted(item.id);
      setDeleteConfirmOpen(false);
      toast.success("动态已删除");
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "删除失败，请稍后重试");
    } finally {
      setDeleting(false);
    }
  };

  const repostOfDeleted = item.repostOf?.isDeleted;

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <Link to={`/u/${item.author.id}`} className="flex min-w-0 items-center gap-3 text-slate-900">
            <Avatar className="h-11 w-11">
              <AvatarImage src={item.author.avatarUrl ?? undefined} alt={item.author.nickname} />
              <AvatarFallback>{item.author.nickname.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{item.author.nickname}</p>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <Badge className="px-1.5 py-0 text-[10px]" variant="secondary">
                  {item.author.level}
                </Badge>
                <span>{formatRelativeTime(item.createdAt)}</span>
                {item.isEdited && item.editedAt ? (
                  <>
                    <span>·</span>
                    <span className="text-slate-400">已编辑 {formatRelativeTime(item.editedAt)}</span>
                  </>
                ) : null}
                <span>·</span>
                <span>{item.source}</span>
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-1">
            {showActionsMenu && isAuthor && onEdited && onDeleted && !item.repostOf ? (
              <div ref={menuRef} className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-500 hover:text-slate-700"
                  onClick={() => setMenuOpen((prev) => !prev)}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
                {menuOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                      onClick={() => {
                        setMenuOpen(false);
                        setEditDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" /> 编辑动态
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                      onClick={() => {
                        setMenuOpen(false);
                        setDeleteConfirmOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> 删除动态
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {showFollowButton ? (
              <Button size="sm" variant={item.author.isFollowed ? "secondary" : "default"} onClick={handleFollow}>
                {item.author.isFollowed ? "已关注" : "关注"}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-800">{renderContent(item.content)}</p>
          <MediaBlock mediaItems={item.media} imageIndexById={imageIndexById} onPreviewImage={openImagePreview} />
          {item.repostOf ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              {repostOfDeleted ? (
                <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-slate-200" />
                  <div>
                    <p className="text-slate-400">原动态已删除</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                    <Link to={`/u/${item.repostOf.author.id}`} className="font-medium text-slate-700 hover:text-link-500">
                      @{item.repostOf.author.nickname}
                    </Link>
                    <span>·</span>
                    <span>{formatRelativeTime(item.repostOf.createdAt)}</span>
                    {item.repostOf.isEdited && item.repostOf.editedAt ? (
                      <>
                        <span>·</span>
                        <span className="text-slate-400">已编辑</span>
                      </>
                    ) : null}
                    <span>·</span>
                    <span>{item.repostOf.source}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{renderContent(item.repostOf.content)}</p>
                  <div className="mt-2">
                    <MediaBlock mediaItems={item.repostOf.media} imageIndexById={imageIndexById} onPreviewImage={openImagePreview} />
                  </div>
                  <div className="mt-2 text-right">
                    <Link to={`/post/${item.repostOf.id}`} className="text-xs text-link-500 hover:underline">
                      查看原动态
                    </Link>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleRepost}>
            <Repeat2 className={`h-4 w-4 ${item.isReposted ? "text-brand-600" : ""}`} />
            {item.isReposted ? "已转发" : "转发"} {formatCount(item.repostsCount)}
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setCommentsOpen((prev) => !prev)}>
            <MessageCircle className="h-4 w-4" /> 评论 {formatCount(item.commentsCount)}
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleLike}>
            <Heart className={`h-4 w-4 ${item.isLiked ? "fill-brand-500 text-brand-500" : ""}`} />
            点赞 {formatCount(item.likesCount)}
          </Button>
        </div>

        {commentsOpen ? (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <div className="flex gap-2">
              <Input
                value={commentInput}
                onChange={(event) => setCommentInput(event.target.value)}
                placeholder={isLoggedIn ? "写下你的评论..." : "登录后可评论"}
                disabled={!isLoggedIn}
              />
              <Button onClick={() => void handleCreateComment()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              {comments.map((comment) => (
                <div key={comment.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{comment.user.nickname}</span>
                    <span>{formatRelativeTime(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-700">{comment.content}</p>
                </div>
              ))}

              {comments.length === 0 && !commentsLoading ? <p className="py-3 text-center text-xs text-slate-500">暂无评论，快来抢沙发</p> : null}
              {commentsLoading && comments.length === 0 ? <p className="py-3 text-center text-xs text-slate-500">评论加载中...</p> : null}

              {canLoadMoreComments ? (
                <Button variant="outline" size="sm" className="w-full" disabled={commentsLoading} onClick={() => void loadComments()}>
                  {commentsLoading ? "加载中..." : "加载更多评论"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-5xl gap-0 overflow-visible border-0 bg-transparent p-0 shadow-none">
            <DialogTitle className="sr-only">图片预览</DialogTitle>
            <DialogDescription className="sr-only">查看动态中的大图预览</DialogDescription>
            <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-[20px] border border-white/60 bg-white/20 p-2 shadow-[0_24px_64px_rgba(15,23,42,0.35)] backdrop-blur-sm">
              {activePreviewImage ? (
                <img
                  src={activePreviewImage.url}
                  alt={`${item.author.nickname} 的动态配图`}
                  className="max-h-[78vh] w-auto max-w-full rounded-[14px] object-contain"
                />
              ) : null}

              {previewImages.length > 1 ? (
                <>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute left-2 h-9 w-9 border border-slate-300/70 bg-white/90"
                    onClick={() => handlePreviewStep("prev")}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute right-2 h-9 w-9 border border-slate-300/70 bg-white/90"
                    onClick={() => handlePreviewStep("next")}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <div className="absolute bottom-2 rounded-full bg-slate-900/70 px-2.5 py-1 text-xs text-slate-100">
                    {previewImageIndex + 1} / {previewImages.length}
                  </div>
                </>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={repostDialogOpen} onOpenChange={setRepostDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>转发动态</DialogTitle>
              <DialogDescription>可选填写短评（最多 280 字），发布后会生成一条新的转发动态。</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Textarea
                value={repostInput}
                onChange={(event) => setRepostInput(event.target.value)}
                maxLength={280}
                className="min-h-[120px]"
                placeholder="说点什么吧（可选）"
              />
              <p className="text-right text-xs text-slate-500">{repostInput.length}/280</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRepostDialogOpen(false)} disabled={repostSubmitting}>
                取消
              </Button>
              <Button type="button" onClick={() => void submitRepost()} disabled={repostSubmitting}>
                {repostSubmitting ? "转发中..." : "确认转发"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isAuthor && onEdited ? (
          <EditPostDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} item={item} onEdited={onEdited} />
        ) : null}

        {isAuthor && onDeleted ? (
          <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除这条动态？</AlertDialogTitle>
                <AlertDialogDescription>
                  删除后该动态将从所有信息流、个人主页和搜索结果中移除。若已有他人转发，转发内容会降级为"原动态已删除"占位。此操作不可撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleDelete()} disabled={deleting} className="bg-red-600 hover:bg-red-700">
                  {deleting ? "删除中..." : "确认删除"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </CardContent>
    </Card>
  );
}
