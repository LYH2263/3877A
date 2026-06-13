import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Ban, LoaderCircle, UserX } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { fetchBlockedList, unblockUser } from "@/api/blocks";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/format";
import { parseApiError } from "@/lib/api-error";
import type { BlockedUser } from "@/types/models";

export default function BlockedUsersPage() {
  const navigate = useNavigate();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [unblockDialogOpen, setUnblockDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<BlockedUser | null>(null);
  const [unblockLoading, setUnblockLoading] = useState(false);

  const loadBlockedUsers = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await fetchBlockedList(reset ? undefined : cursor ?? undefined);
      if (reset) {
        setBlockedUsers(result.items);
      } else {
        setBlockedUsers((prev) => [...prev, ...result.items]);
      }
      setCursor(result.nextCursor ?? null);
      setHasMore(Boolean(result.nextCursor));
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "加载失败，请稍后重试");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cursor]);

  useEffect(() => {
    void loadBlockedUsers(true);
  }, []);

  const handleUnblock = async () => {
    if (!selectedUser) {
      return;
    }

    setUnblockLoading(true);
    try {
      await unblockUser(selectedUser.user.id);
      setBlockedUsers((prev) => prev.filter((block) => block.id !== selectedUser.id));
      toast.success("已解除拉黑");
      setUnblockDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "操作失败，请稍后重试");
    } finally {
      setUnblockLoading(false);
    }
  };

  const openUnblockDialog = (user: BlockedUser) => {
    setSelectedUser(user);
    setUnblockDialogOpen(true);
  };

  return (
    <main className="mx-auto mt-6 w-full max-w-3xl space-y-4 px-4 pb-12">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">已拉黑用户</h1>
          <p className="text-xs text-slate-500">拉黑后双方互相不可见，解除后恢复正常</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ban className="h-4 w-4 text-brand-500" /> 黑名单管理
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100">
          {loading ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-8 w-20 rounded-md" />
                </div>
              ))}
            </div>
          ) : blockedUsers.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <UserX className="mb-3 h-12 w-12 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">暂无拉黑用户</p>
              <p className="mt-1 text-xs text-slate-400">你可以在用户主页或动态菜单中拉黑不想看到的用户</p>
            </div>
          ) : (
            <>
              {blockedUsers.map((block) => (
                <div key={block.id} className="flex items-center gap-3 py-3">
                  <Link to={`/u/${block.user.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={block.user.avatarUrl ?? undefined} alt={block.user.nickname} />
                      <AvatarFallback>{block.user.nickname.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{block.user.nickname}</p>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span>拉黑于 {formatRelativeTime(block.createdAt)}</span>
                        {block.reason ? (
                          <>
                            <span>·</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{block.reason}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => openUnblockDialog(block)}>
                    解除拉黑
                  </Button>
                </div>
              ))}
              {hasMore ? (
                <div className="pt-4">
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={loadingMore}
                    onClick={() => void loadBlockedUsers()}
                  >
                    {loadingMore ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" /> 加载中...
                      </>
                    ) : (
                      "加载更多"
                    )}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={unblockDialogOpen} onOpenChange={setUnblockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认解除拉黑？</AlertDialogTitle>
            <AlertDialogDescription>
              解除拉黑后，{selectedUser?.user.nickname ?? "该用户"}的动态和评论将重新出现在你的信息流中，
              对方也可以再次关注你和评论你的动态。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unblockLoading}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleUnblock()} disabled={unblockLoading}>
              {unblockLoading ? "处理中..." : "确认解除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
