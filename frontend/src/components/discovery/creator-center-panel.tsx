import { ArrowRight, ChartBar, PenSquare, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { User } from "@/types/models";

interface CreatorCenterPanelProps {
  user: User | null;
}

export function CreatorCenterPanel({ user }: CreatorCenterPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">创作者中心</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-600">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="flex items-center gap-1 text-slate-800">
            <Sparkles className="h-4 w-4 text-brand-500" /> 今日创作灵感
          </p>
          <p className="mt-1 text-xs">分享你的观点，使用 #今日热点# 话题提升曝光。</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-slate-200 p-2">
            <p className="text-slate-500">粉丝数</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{user?.followersCount ?? 0}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-2">
            <p className="text-slate-500">关注数</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{user?.followingCount ?? 0}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Button className="w-full justify-between" asChild>
            <Link to="/compose">
              <span className="flex items-center gap-2">
                <PenSquare className="h-4 w-4" /> 发布新动态
              </span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" className="w-full justify-between" asChild>
            <Link to="/creator-center">
              <span className="flex items-center gap-2">
                <ChartBar className="h-4 w-4" /> 数据看板
              </span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
