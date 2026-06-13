import { apiClient } from "@/api/client";
import type { ApiResponse, BlockActionResult, BlockCheckResult, BlockedUser, CursorPage } from "@/types/models";

export async function blockUser(userId: number): Promise<BlockActionResult> {
  const { data } = await apiClient.post<ApiResponse<BlockActionResult>>("/blocks", { userId });
  return data.data;
}

export async function unblockUser(userId: number): Promise<BlockActionResult> {
  const { data } = await apiClient.delete<ApiResponse<BlockActionResult>>(`/blocks/${userId}`);
  return data.data;
}

export async function checkBlockStatus(userId: number): Promise<BlockCheckResult> {
  const { data } = await apiClient.get<ApiResponse<BlockCheckResult>>(`/blocks/check/${userId}`);
  return data.data;
}

export async function fetchBlockedList(
  cursor?: string | null,
  limit = 20
): Promise<CursorPage<BlockedUser>> {
  const { data } = await apiClient.get<ApiResponse<CursorPage<BlockedUser>>>("/blocks", {
    params: {
      cursor: cursor || undefined,
      limit
    }
  });
  return data.data;
}
