import { useEffect, useMemo, useState } from "react";
import { BarChart3, ChartLine, Heart, MessageCircle, Repeat2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { fetchCreatorDashboard } from "@/api/creator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/format";
import { parseApiError } from "@/lib/api-error";
import type { CreatorDashboardPayload } from "@/types/models";

function formatDateLabel(date: string) {
  const value = new Date(`${date}T00:00:00`);
  return value.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  });
}

function StatCard({ title, value, hint, icon }: { title: string; value: string; hint: string; icon: JSX.Element }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">{title}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{hint}</p>
          </div>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CreatorCenterPage() {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<CreatorDashboardPayload | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const data = await fetchCreatorDashboard(7);
        setPayload(data);
      } catch (error) {
        const parsed = parseApiError(error);
        toast.error(parsed.message || "数据中心加载失败");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const maxInteractions = useMemo(() => {
    if (!payload || payload.trend.length === 0) {
      return 1;
    }
    return Math.max(1, ...payload.trend.map((item) => item.interactions));
  }, [payload]);

  const latestTrend = payload?.trend[payload.trend.length - 1] ?? null;

  if (loading) {
    return (
      <main className="mx-auto mt-6 w-full max-w-6xl px-4 pb-12">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-3 h-8 w-14" />
                <Skeleton className="mt-2 h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    );
  }

  if (!payload) {
    return <main className="mx-auto mt-10 w-full max-w-6xl px-4 text-center text-slate-500">暂无可展示的数据</main>;
  }

  return (
    <main className="mx-auto mt-6 w-full max-w-6xl space-y-4 px-4 pb-12">
      <Card className="overflow-hidden border-brand-100 bg-gradient-to-r from-white to-brand-50/40">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm text-slate-600">创作者数据中心</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">@{payload.creator.nickname}</h1>
            <p className="mt-1 text-xs text-slate-500">近 7 天创作表现与互动趋势一目了然</p>
          </div>
          <Link
            to="/compose"
            className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
          >
            <BarChart3 className="h-4 w-4" />
            去创作
          </Link>
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="总发布数" value={formatCount(payload.summary.postsCount)} hint="累计内容产出" icon={<BarChart3 className="h-4 w-4" />} />
        <StatCard title="总获赞" value={formatCount(payload.summary.totalLikes)} hint="累计点赞" icon={<Heart className="h-4 w-4" />} />
        <StatCard
          title="总评论"
          value={formatCount(payload.summary.totalComments)}
          hint="累计评论"
          icon={<MessageCircle className="h-4 w-4" />}
        />
        <StatCard title="总转发" value={formatCount(payload.summary.totalReposts)} hint="累计转发" icon={<Repeat2 className="h-4 w-4" />} />
        <StatCard
          title="当前粉丝"
          value={formatCount(payload.summary.followersCount)}
          hint="账号粉丝规模"
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          title="近7天净增"
          value={formatCount(payload.summary.followersNetChange)}
          hint="近 7 天新增关注"
          icon={<ChartLine className="h-4 w-4" />}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">7 天互动趋势</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex h-44 items-end gap-2">
                {payload.trend.map((item) => {
                  const ratio = item.interactions / maxInteractions;
                  const height = 22 + Math.round(ratio * 120);
                  return (
                    <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center justify-end">
                      <span className="mb-1 text-[10px] text-slate-500">{item.interactions}</span>
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-brand-500 to-brand-300 transition-all duration-150"
                        style={{ height: `${height}px` }}
                        title={`${item.date} 互动 ${item.interactions}`}
                      />
                      <span className="mt-1 text-[11px] text-slate-500">{formatDateLabel(item.date)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {latestTrend ? (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">当日发帖 {latestTrend.posts}</div>
                <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">当日点赞 {latestTrend.likes}</div>
                <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">当日评论 {latestTrend.comments}</div>
                <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">当日转发 {latestTrend.reposts}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">我的动态榜单</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {payload.topPosts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-10 text-center text-sm text-slate-500">还没有发布动态</div>
            ) : null}
            {payload.topPosts.map((post, index) => (
              <Link
                key={post.id}
                to={`/post/${post.id}`}
                className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-3 transition-colors hover:bg-slate-50"
              >
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm text-slate-800">{post.content}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    点赞 {formatCount(post.likesCount)} · 评论 {formatCount(post.commentsCount)} · 转发 {formatCount(post.repostsCount)}
                  </p>
                </div>
                {post.cover ? (
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200">
                    {post.cover.type === "image" ? (
                      <img src={post.cover.url} alt="封面" className="h-full w-full object-cover" />
                    ) : (
                      <video src={post.cover.url} className="h-full w-full object-cover" />
                    )}
                  </span>
                ) : null}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
