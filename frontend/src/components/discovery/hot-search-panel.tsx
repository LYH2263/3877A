import { RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TrendingTopic } from "@/types/models";

interface HotSearchPanelProps {
  topics: TrendingTopic[];
  loading?: boolean;
  onRefresh: () => void;
}

export function HotSearchPanel({ topics, loading, onRefresh }: HotSearchPanelProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">微博热搜榜</CardTitle>
        <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={onRefresh}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> 刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {topics.map((topic) => (
          <Link
            key={topic.id}
            to={`/topic/${topic.id}`}
            className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <span className="w-5 text-center text-xs font-semibold text-slate-400">{topic.rank}</span>
            <span className="line-clamp-1 flex-1">{topic.keyword}</span>
            <Badge variant="secondary" className="text-[10px]">
              {topic.tag}
            </Badge>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
