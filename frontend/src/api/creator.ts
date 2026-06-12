import { apiClient } from "@/api/client";
import type { ApiResponse, CreatorDashboardPayload } from "@/types/models";

export async function fetchCreatorDashboard(days = 7): Promise<CreatorDashboardPayload> {
  const { data } = await apiClient.get<ApiResponse<CreatorDashboardPayload>>("/creator/dashboard", {
    params: { days }
  });
  return data.data;
}
