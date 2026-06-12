import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { fetchMessages, fetchUnreadCount, markAllMessagesRead, markMessageRead } from "@/api/messages";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRelativeTime } from "@/lib/format";
import { parseApiError } from "@/lib/api-error";
import { emitMessageEvent } from "@/lib/message-events";
import type { MessageItem, MessageTab } from "@/types/models";

const TABS: Array<{ value: MessageTab; label: string }> = [
  { value: "all", label: "全部" },
  { value: "unread", label: "未读" },
  { value: "likes", label: "点赞" },
  { value: "comments", label: "评论" },
  { value: "reposts", label: "转发" },
  { value: "follows", label: "关注" }
];

const TYPE_LABEL: Record<MessageItem["type"], string> = {
  LIKE: "赞了你的动态",
  COMMENT: "评论了你",
  REPOST: "转发了你的动态",
  FOLLOW: "关注了你"
};

function MessageSkeleton() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 p-3">
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

function buildMessageText(item: MessageItem) {
  if (item.content) {
    return item.content;
  }
  return TYPE_LABEL[item.type];
}

export default function MessagesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<MessageTab>("all");
  const [items, setItems] = useState<MessageItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readAllPending, setReadAllPending] = useState(false);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const payload = await fetchUnreadCount();
      setUnreadCount(payload.unreadCount);
    } catch (error) {
      const parsed = parseApiError(error);
      if (parsed.status && parsed.status >= 500) {
        toast.error(parsed.message || "未读计数获取失败");
      }
    }
  }, []);

  const loadFirstPage = useCallback(async () => {
    setInitialLoading(true);
    try {
      const page = await fetchMessages(tab, null, 12);
      setItems(page.items);
      setCursor(page.nextCursor);
      setHasMore(Boolean(page.nextCursor));
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "消息加载失败");
    } finally {
      setInitialLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const page = await fetchMessages(tab, cursor, 12);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      setHasMore(Boolean(page.nextCursor));
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "加载更多失败");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRead = async (id: number) => {
    const target = items.find((item) => item.id === id);
    if (!target || target.isRead) {
      return;
    }

    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await markMessageRead(id);
      emitMessageEvent("refresh-unread");
    } catch (error) {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: false } : item)));
      setUnreadCount((prev) => prev + 1);
      const parsed = parseApiError(error);
      toast.error(parsed.message || "标记已读失败");
    }
  };

  const handleOpen = async (item: MessageItem) => {
    if (!item.isRead) {
      await handleRead(item.id);
    }

    if (item.type === "FOLLOW") {
      navigate(`/u/${item.actor.id}`);
      return;
    }

    if (item.post) {
      navigate(`/post/${item.post.id}`);
      return;
    }

    navigate(`/u/${item.actor.id}`);
  };

  const handleReadAll = async () => {
    if (readAllPending || unreadCount === 0) {
      return;
    }

    setReadAllPending(true);
    const snapshot = items;
    setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);

    try {
      await markAllMessagesRead();
      emitMessageEvent("refresh-unread");
      toast.success("已全部标记为已读");
    } catch (error) {
      setItems(snapshot);
      void refreshUnreadCount();
      const parsed = parseApiError(error);
      toast.error(parsed.message || "操作失败，请稍后重试");
    } finally {
      setReadAllPending(false);
    }
  };

  return (
    <main className="mx-auto mt-6 w-full max-w-5xl px-4 pb-12">
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-brand-500" />
            消息中心
            <Badge variant="secondary" className="ml-1">
              未读 {unreadCount}
            </Badge>
          </CardTitle>
          <Button variant="outline" size="sm" disabled={readAllPending || unreadCount === 0} onClick={() => void handleReadAll()}>
            <CheckCheck className="h-4 w-4" />
            全部标记已读
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={tab} onValueChange={(value) => setTab(value as MessageTab)}>
            <TabsList className="flex w-full flex-wrap justify-start gap-1">
              {TABS.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-3">
          {initialLoading ? <MessageSkeleton /> : null}

          {!initialLoading && items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-3 py-12 text-center text-sm text-slate-500">当前分类暂无消息</div>
          ) : null}

          {!initialLoading
            ? items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                    item.isRead ? "border-slate-200 bg-white hover:bg-slate-50" : "border-brand-200 bg-brand-50/40 hover:bg-brand-50/60"
                  }`}
                  onClick={() => void handleOpen(item)}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={item.actor.avatarUrl ?? undefined} alt={item.actor.nickname} />
                    <AvatarFallback>{item.actor.nickname.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${item.isRead ? "font-medium text-slate-700" : "font-semibold text-slate-900"}`}>
                      @{item.actor.nickname}
                      <span className="ml-1 font-normal text-slate-600">{buildMessageText(item)}</span>
                    </p>
                    {item.post ? <p className="mt-0.5 truncate text-xs text-slate-500">动态：{item.post.content}</p> : null}
                    <p className="mt-0.5 text-xs text-slate-400">{formatRelativeTime(item.createdAt)}</p>
                  </div>
                  {!item.isRead ? <span className="h-2.5 w-2.5 rounded-full bg-brand-500" aria-label="未读" /> : null}
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              ))
            : null}

          {!initialLoading && hasMore ? (
            <Button variant="outline" className="w-full" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "加载中..." : "加载更多"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
