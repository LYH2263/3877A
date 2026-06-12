import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { fetchFeed } from "@/api/discovery";
import { parseApiError } from "@/lib/api-error";
import type { FeedChannel, FeedItem, FeedMode } from "@/types/models";

interface FeedCacheSnapshot {
  items: FeedItem[];
  cursor: string | null;
  hasMore: boolean;
  error: string | null;
}

function mergeItems(prev: FeedItem[], incoming: FeedItem[]): FeedItem[] {
  if (incoming.length === 0) {
    return prev;
  }

  const map = new Map(prev.map((item, index) => [item.id, { item, index }]));
  const next = [...prev];

  incoming.forEach((item) => {
    const existing = map.get(item.id);
    if (existing) {
      next[existing.index] = item;
    } else {
      next.push(item);
    }
  });

  return next;
}

export function useInfiniteFeed(channel: FeedChannel, mode: FeedMode) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loaderRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef<Map<string, FeedCacheSnapshot>>(new Map());
  const keyRef = useRef(`${channel}:${mode}`);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) {
      return;
    }

    const requestKey = `${channel}:${mode}`;
    const shouldReplaceItems = initialLoading && cursor === null;
    setLoading(true);
    try {
      const page = await fetchFeed(channel, mode, cursor, 10);
      if (keyRef.current !== requestKey) {
        return;
      }
      setItems((prev) => (shouldReplaceItems ? page.items : mergeItems(prev, page.items)));
      setCursor(page.nextCursor);
      setHasMore(Boolean(page.nextCursor));
      setError(null);
    } catch (err) {
      if (keyRef.current !== requestKey) {
        return;
      }
      const parsed = parseApiError(err);
      setError(parsed.message);
      toast.error(parsed.message || "加载动态失败，请稍后重试");
    } finally {
      setLoading(false);
      if (keyRef.current === requestKey) {
        setInitialLoading(false);
      }
    }
  }, [channel, mode, cursor, hasMore, initialLoading, loading]);

  useEffect(() => {
    const nextKey = `${channel}:${mode}`;
    keyRef.current = nextKey;

    const cached = cacheRef.current.get(nextKey);
    if (cached) {
      setItems(cached.items);
      setCursor(cached.cursor);
      setHasMore(cached.hasMore);
      setError(cached.error);
      setInitialLoading(false);
      return;
    }

    // 切换分组时保留当前可见列表，直到新分组首屏返回，避免“先清空再重绘”的闪屏感。
    setCursor(null);
    setHasMore(true);
    setInitialLoading(true);
    setError(null);
  }, [channel, mode]);

  useEffect(() => {
    if (initialLoading && hasMore && !loading) {
      void loadMore();
    }
  }, [initialLoading, hasMore, loading, loadMore]);

  useEffect(() => {
    if (initialLoading) {
      return;
    }
    cacheRef.current.set(keyRef.current, {
      items,
      cursor,
      hasMore,
      error
    });
  }, [items, cursor, hasMore, error, initialLoading]);

  useEffect(() => {
    const target = loaderRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loading) {
          void loadMore();
        }
      },
      { rootMargin: "280px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, hasMore, loading]);

  const updateItem = useCallback((nextItem: FeedItem) => {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === nextItem.id);
      if (index < 0) {
        return prev;
      }
      const next = [...prev];
      next[index] = nextItem;
      return next;
    });
  }, []);

  const mutateItem = useCallback((id: number, mutator: (item: FeedItem) => FeedItem) => {
    setItems((prev) => prev.map((item) => (item.id === id ? mutator(item) : item)));
  }, []);

  const mutateItems = useCallback((mutator: (item: FeedItem) => FeedItem) => {
    setItems((prev) => prev.map((item) => mutator(item)));
  }, []);

  const prependItem = useCallback((item: FeedItem) => {
    setItems((prev) => [item, ...prev.filter((target) => target.id !== item.id)]);
  }, []);

  const removeItem = useCallback((postId: number) => {
    setItems((prev) => prev.filter((item) => item.id !== postId));
  }, []);

  return useMemo(
    () => ({
      items,
      loading,
      initialLoading,
      hasMore,
      error,
      loaderRef,
      loadMore,
      updateItem,
      mutateItem,
      mutateItems,
      prependItem,
      removeItem
    }),
    [items, loading, initialLoading, hasMore, error, loadMore, updateItem, mutateItem, mutateItems, prependItem, removeItem]
  );
}
