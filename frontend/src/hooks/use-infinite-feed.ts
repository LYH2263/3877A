import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { fetchFeed, fetchFollowingFeed } from "@/api/discovery";
import { parseApiError } from "@/lib/api-error";
import type { FeedChannel, FeedItem, FeedMode } from "@/types/models";

interface FeedCacheSnapshot {
  items: FeedItem[];
  cursor: string | null;
  hasMore: boolean;
  error: string | null;
  followingCount?: number;
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
  const [followingCount, setFollowingCount] = useState<number | undefined>(undefined);

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
      if (channel === "following") {
        const page = await fetchFollowingFeed(cursor, 10);
        if (keyRef.current !== requestKey) {
          return;
        }
        setItems((prev) => (shouldReplaceItems ? page.items : mergeItems(prev, page.items)));
        setCursor(page.nextCursor);
        setHasMore(Boolean(page.nextCursor));
        setFollowingCount(page.followingCount);
        setError(null);
      } else {
        const page = await fetchFeed(channel, mode, cursor, 10);
        if (keyRef.current !== requestKey) {
          return;
        }
        setItems((prev) => (shouldReplaceItems ? page.items : mergeItems(prev, page.items)));
        setCursor(page.nextCursor);
        setHasMore(Boolean(page.nextCursor));
        setError(null);
      }
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
      if (cached.followingCount !== undefined) {
        setFollowingCount(cached.followingCount);
      }
      setInitialLoading(false);
      return;
    }

    setCursor(null);
    setHasMore(true);
    setInitialLoading(true);
    setError(null);
    if (channel === "following") {
      setFollowingCount(undefined);
    }
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
      error,
      followingCount
    });
  }, [items, cursor, hasMore, error, initialLoading, followingCount]);

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

  const removeItemsByAuthor = useCallback((authorId: number) => {
    setItems((prev) => prev.filter((item) => item.author.id !== authorId));
  }, []);

  const reset = useCallback(() => {
    const currentKey = `${channel}:${mode}`;
    cacheRef.current.delete(currentKey);
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setInitialLoading(true);
    setError(null);
    if (channel === "following") {
      setFollowingCount(undefined);
    }
  }, [channel, mode]);

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
      removeItem,
      removeItemsByAuthor,
      followingCount,
      reset
    }),
    [items, loading, initialLoading, hasMore, error, loadMore, updateItem, mutateItem, mutateItems, prependItem, removeItem, removeItemsByAuthor, followingCount, reset]
  );
}
