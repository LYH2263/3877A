import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Home, MessageCircle, PenSquare, Search, Settings } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { fetchSearchSuggestions } from "@/api/discovery";
import { fetchUnreadCount } from "@/api/messages";
import { useAuth } from "@/context/auth-context";
import { parseApiError } from "@/lib/api-error";
import { subscribeMessageEvent } from "@/lib/message-events";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import type { SearchSuggestion } from "@/types/models";

const iconClass = "h-4 w-4";

export function TopNav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [keyword, setKeyword] = useState("");
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!keyword.trim()) {
      setSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const data = await fetchSearchSuggestions(keyword, 8);
        setSuggestions(data);
      } catch (err) {
        const parsed = parseApiError(err);
        if (parsed.status && parsed.status >= 500) {
          setSuggestions([]);
        }
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [keyword]);

  const showSuggestions = useMemo(() => focused && suggestions.length > 0 && keyword.trim().length > 0, [focused, suggestions.length, keyword]);

  const refreshUnread = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    try {
      const payload = await fetchUnreadCount();
      setUnreadCount(payload.unreadCount);
    } catch (error) {
      const parsed = parseApiError(error);
      if (parsed.status === 401) {
        setUnreadCount(0);
      }
    }
  }, [user]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread, location.pathname]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const unsubscribe = subscribeMessageEvent((event) => {
      if (event === "refresh-unread") {
        void refreshUnread();
      }
    });

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshUnread();
      }
    };

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshUnread();
      }
    }, 60000);

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      unsubscribe();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [user, refreshUnread]);

  const runSearch = (nextKeyword: string) => {
    const q = nextKeyword.trim();
    if (!q) {
      return;
    }

    setFocused(false);
    navigate(`/search?q=${encodeURIComponent(q)}&type=all`);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-[0_1px_0_rgba(148,163,184,0.12)]">
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-3 px-4 lg:px-6">
        <Link to="/" className="mr-2 flex items-center gap-2 text-slate-900 hover:text-slate-900">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">发</span>
          <span className="hidden text-base font-semibold sm:inline">社交发现</span>
        </Link>

        <div className="relative hidden max-w-xl flex-1 md:block">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              runSearch(keyword);
            }}
          >
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                window.setTimeout(() => setFocused(false), 120);
              }}
              placeholder="搜索热词、用户、话题"
              aria-label="搜索"
              className="pl-9"
            />
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
          </form>

          {showSuggestions ? (
            <div className="absolute left-0 right-0 top-12 z-50 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runSearch(item.keyword)}
                >
                  <span className="text-sm text-slate-800">{item.label}</span>
                  <span className="text-xs text-slate-500">{item.subtitle}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <nav className="ml-auto flex items-center gap-1">
          <Button variant={location.pathname === "/" ? "secondary" : "ghost"} size="icon" asChild>
            <Link to="/" aria-label="首页">
              <Home className={iconClass} />
            </Link>
          </Button>
          <Button variant={location.pathname.startsWith("/messages") ? "secondary" : "ghost"} size="icon" asChild>
            <Link to="/messages" aria-label="消息" className="relative">
              <MessageCircle className={iconClass} />
              {user && unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold leading-none text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
          </Button>
          <Button variant={location.pathname.startsWith("/settings") ? "secondary" : "ghost"} size="icon" asChild>
            <Link to="/settings" aria-label="设置">
              <Settings className={iconClass} />
            </Link>
          </Button>

          <Button
            variant={location.pathname.startsWith("/drafts") ? "secondary" : "ghost"}
            size="icon"
            asChild
            className="hidden sm:inline-flex"
          >
            <Link to="/drafts" aria-label="草稿箱">
              <FileText className={iconClass} />
            </Link>
          </Button>

          <Button className="ml-2 hidden sm:inline-flex" onClick={() => navigate("/compose")}>
            <PenSquare className="h-4 w-4" /> 发布
          </Button>

          {user ? (
            <div className="ml-2 flex items-center gap-2">
              <Button variant="ghost" className="h-auto p-0" asChild>
                <Link to={`/u/${user.id}`}>
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.avatarUrl ?? undefined} alt={user.nickname} />
                    <AvatarFallback>{user.nickname.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                </Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    退出
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认退出登录？</AlertDialogTitle>
                    <AlertDialogDescription>退出后将无法执行点赞、评论、发布等操作。</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void logout()}>确认退出</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <div className="ml-2 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/login")}>
                登录
              </Button>
              <Button size="sm" onClick={() => navigate("/register")}>
                注册
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
