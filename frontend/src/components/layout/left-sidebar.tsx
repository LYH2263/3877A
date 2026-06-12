import { useEffect, useState } from "react";
import { ChevronDown, Compass, Flame, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FeedChannel, FeedMode } from "@/types/models";

const navGroups: Array<{ key: FeedMode; label: string; subtitle: string; icon: typeof Sparkles }> = [
  {
    key: "recommended",
    label: "推荐",
    subtitle: "按时间与兴趣混合推荐",
    icon: Sparkles
  },
  {
    key: "trending",
    label: "热门榜",
    subtitle: "按热度与互动实时排序",
    icon: Flame
  },
  {
    key: "discover",
    label: "发现",
    subtitle: "聚焦高讨论度与优质内容",
    icon: Compass
  }
];

interface LeftSidebarProps {
  activeKey: FeedMode;
  activeChannel: FeedChannel;
  onChangeMode: (value: FeedMode) => void;
  onChangeChannel: (value: FeedChannel) => void;
}

const SUB_CHANNELS: Array<{ key: FeedChannel; label: string }> = [
  { key: "hot", label: "热门频道" },
  { key: "city", label: "同城频道" }
];

export function LeftSidebar({ activeKey, activeChannel, onChangeMode, onChangeChannel }: LeftSidebarProps) {
  const [expandedKey, setExpandedKey] = useState<FeedMode>(activeKey);

  useEffect(() => {
    setExpandedKey(activeKey);
  }, [activeKey]);

  return (
    <aside className="hidden lg:block sticky top-20 self-start pr-2">
      <div className="space-y-3">
        {navGroups.map((group) => {
          const Icon = group.icon;
          const active = activeKey === group.key;
          const expanded = expandedKey === group.key;

          return (
            <div
              key={group.key}
              className={cn(
                "w-full rounded-2xl border bg-white p-3 text-left shadow-sm transition",
                active
                  ? "border-brand-200 bg-gradient-to-br from-white to-brand-50 shadow-[0_8px_24px_rgba(255,111,26,0.15)]"
                  : "border-slate-200 hover:border-slate-300 hover:shadow-md",
              )}
            >
              <button
                type="button"
                className="w-full"
                onClick={() => {
                  onChangeMode(group.key);
                  setExpandedKey(group.key);
                }}
                aria-pressed={active}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg",
                      active
                        ? "bg-brand-500 text-white"
                        : "bg-slate-100 text-slate-600",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        active ? "text-brand-700" : "text-slate-800",
                      )}
                    >
                      {group.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {group.subtitle}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "mt-1 h-4 w-4 text-slate-400 transition-transform",
                      expanded ? "rotate-180" : "",
                    )}
                    aria-hidden
                  />
                </div>
              </button>

              {expanded ? (
                <div className="mt-2 space-y-1.5 border-t border-slate-200/80 pt-2">
                  {SUB_CHANNELS.map((sub) => (
                    <button
                      key={sub.key}
                      type="button"
                      className={cn(
                        "w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                        activeChannel === sub.key
                          ? "bg-brand-100 text-brand-700"
                          : "text-slate-600 hover:bg-slate-100",
                      )}
                      onClick={() => {
                        onChangeMode(group.key);
                        onChangeChannel(sub.key);
                      }}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
