import { apiClient } from "@/api/client";
import type { ApiResponse, CursorPage, MessageItem, MessageTab, UnreadCountPayload } from "@/types/models";

export async function fetchMessages(tab: MessageTab, cursor: string | null, limit = 12): Promise<CursorPage<MessageItem>> {
  const { data } = await apiClient.get<ApiResponse<CursorPage<MessageItem>>>("/messages", {
    params: {
      tab,
      cursor: cursor ?? undefined,
      limit
    }
  });
  return data.data;
}

export async function fetchUnreadCount(): Promise<UnreadCountPayload> {
  const { data } = await apiClient.get<ApiResponse<UnreadCountPayload>>("/messages/unread-count");
  return data.data;
}

export async function markMessageRead(id: number): Promise<{ id: number; isRead: boolean }> {
  const { data } = await apiClient.post<ApiResponse<{ id: number; isRead: boolean }>>(`/messages/${id}/read`);
  return data.data;
}

export async function markAllMessagesRead(): Promise<void> {
  await apiClient.post("/messages/read-all");
}
