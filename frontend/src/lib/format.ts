export function formatCount(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return String(value);
}

export function formatRelativeTime(input: string): string {
  const now = Date.now();
  const timestamp = new Date(input).getTime();
  const diffMinutes = Math.floor((now - timestamp) / 60000);

  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}小时前`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}天前`;

  return new Date(input).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  });
}

export function extractTopics(content: string): string[] {
  const matches = content.match(/#([^#]+)#/g) ?? [];
  return matches.map((item) => item.replace(/#/g, ""));
}
