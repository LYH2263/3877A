import { apiClient } from "@/api/client";
import type { ApiResponse, DraftItem, DraftListItem, FeedChannel, FeedItem } from "@/types/models";

export async function fetchDrafts(): Promise<DraftListItem[]> {
  const { data } = await apiClient.get<ApiResponse<DraftListItem[]>>("/drafts");
  return data.data;
}

export async function fetchDraft(draftId: number): Promise<DraftItem> {
  const { data } = await apiClient.get<ApiResponse<DraftItem>>(`/drafts/${draftId}`);
  return data.data;
}

export interface SaveDraftInput {
  content: string;
  channel: FeedChannel;
  files?: File[];
}

export async function createDraft(input: SaveDraftInput): Promise<DraftItem> {
  const formData = new FormData();
  formData.append("content", input.content);
  formData.append("channel", input.channel);
  input.files?.forEach((file) => formData.append("media", file));

  const { data } = await apiClient.post<ApiResponse<DraftItem>>("/drafts", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });

  return data.data;
}

export async function updateDraft(draftId: number, input: SaveDraftInput): Promise<DraftItem> {
  const formData = new FormData();
  formData.append("content", input.content);
  formData.append("channel", input.channel);
  input.files?.forEach((file) => formData.append("media", file));

  const { data } = await apiClient.put<ApiResponse<DraftItem>>(`/drafts/${draftId}`, formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });

  return data.data;
}

export async function deleteDraft(draftId: number): Promise<void> {
  await apiClient.delete<ApiResponse<null>>(`/drafts/${draftId}`);
}

export async function publishDraft(draftId: number): Promise<FeedItem> {
  const { data } = await apiClient.post<ApiResponse<FeedItem>>(`/drafts/${draftId}/publish`);
  return data.data;
}
