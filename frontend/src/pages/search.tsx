import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { fetchSearchResults } from "@/api/discovery";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRelativeTime } from "@/lib/format";
import { parseApiError } from "@/lib/api-error";
import type { SearchResultPayload } from "@/types/models";

const SEARCH_TYPES = [
  { value: "all", label: "综合" },
  { value: "post", label: "动态" },
  { value: "user", label: "用户" },
  { value: "topic", label: "话题" }
] as const;

type SearchType = (typeof SEARCH_TYPES)[number]["value"];

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const keyword = (searchParams.get("q") ?? "").trim();
  const rawType = searchParams.get("type") ?? "all";
  const type = SEARCH_TYPES.some((item) => item.value === rawType) ? (rawType as SearchType) : "all";

  const [result, setResult] = useState<SearchResultPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!keyword) {
      setResult(null);
      return;
    }

    const run = async () => {
      setLoading(true);
      try {
        const payload = await fetchSearchResults(keyword, type, 20);
        setResult(payload);
      } catch (err) {
        const parsed = parseApiError(err);
        toast.error(parsed.message || "搜索失败");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [keyword, type]);

  const total = useMemo(() => {
    if (!result) {
      return 0;
    }
    return result.posts.length + result.users.length + result.topics.length;
  }, [result]);

  return (
    <main className="mx-auto mt-6 w-full max-w-5xl px-4 pb-12">
      <Card className="mb-4 border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-4 w-4 text-brand-500" /> 搜索结果
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-slate-500">关键词：{keyword || "（未输入）"}，共 {total} 条结果</div>
          <Tabs
            value={type}
            onValueChange={(value) => {
              const next = new URLSearchParams(searchParams);
              next.set("type", value);
              setSearchParams(next);
            }}
          >
            <TabsList>
              {SEARCH_TYPES.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-[90%]" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-[86%]" />
          </div>
        </div>
      ) : null}

      {!loading && keyword && result ? (
        <div className="space-y-4">
          {(type === "all" || type === "post") && result.posts.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">相关动态</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.posts.map((post) => (
                  <div key={post.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-1 text-xs text-slate-500">
                      @{post.author.nickname} · {formatRelativeTime(post.createdAt)}
                    </div>
                    <p className="line-clamp-2 text-sm text-slate-800">{post.content}</p>
                    <div className="mt-2 text-xs text-slate-500">
                      点赞 {post.likesCount} · 评论 {post.commentsCount} · 转发 {post.repostsCount}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {(type === "all" || type === "user") && result.users.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">相关用户</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.users.map((user) => (
                  <Link key={user.id} to={`/u/${user.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatarUrl ?? undefined} alt={user.nickname} />
                      <AvatarFallback>{user.nickname.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{user.nickname}</p>
                      <p className="truncate text-xs text-slate-500">{user.bio || "这个人很神秘，什么都没写"}</p>
                    </div>
                    <Badge variant="secondary">{user.level}</Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {(type === "all" || type === "topic") && result.topics.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">相关话题</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.topics.map((topic) => (
                  <Link key={topic.id} to={`/topic/${topic.id}`} className="flex items-center rounded-xl border border-slate-200 p-3 text-sm hover:bg-slate-50">
                    <span className="mr-3 w-6 text-center text-xs text-slate-400">{topic.rank}</span>
                    <span className="flex-1 text-slate-800">#{topic.keyword}#</span>
                    <Badge variant="outline">{topic.tag}</Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {total === 0 ? <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-500">未找到相关内容，试试换个关键词</div> : null}
        </div>
      ) : null}

      {!loading && !keyword ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-500">请输入关键词开始搜索</div>
      ) : null}

      {loading ? (
        <div className="mt-4 text-center text-xs text-slate-500">
          <LoaderCircle className="mx-auto mb-1 h-4 w-4 animate-spin" /> 正在检索中...
        </div>
      ) : null}
    </main>
  );
}
