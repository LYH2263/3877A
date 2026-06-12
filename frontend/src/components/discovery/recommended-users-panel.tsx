import { RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecommendedUser } from "@/types/models";

interface RecommendedUsersPanelProps {
  users: RecommendedUser[];
  onRefresh: () => void;
  onFollow: (userId: number) => void;
  loading?: boolean;
}

export function RecommendedUsersPanel({ users, onRefresh, onFollow, loading }: RecommendedUsersPanelProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">你可能感兴趣的人</CardTitle>
        <Button variant="ghost" size="sm" disabled={loading} onClick={onRefresh}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> 换一换
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {users.map((user) => (
          <div key={user.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-2">
            <Link to={`/u/${user.id}`} className="flex min-w-0 flex-1 items-center gap-2 text-slate-800 hover:text-slate-900">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user.avatarUrl ?? undefined} alt={user.nickname} />
                <AvatarFallback>{user.nickname.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.nickname}</p>
                <p className="truncate text-xs text-slate-500">{user.bio || "有趣的人，值得关注"}</p>
              </div>
            </Link>
            <Button size="sm" variant={user.isFollowed ? "secondary" : "default"} onClick={() => onFollow(user.id)}>
              {user.isFollowed ? "已关注" : "关注"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
