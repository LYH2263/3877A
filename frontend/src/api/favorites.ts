import { apiClient } from "@/api/client";
import type {
  ApiResponse,
  CursorPage,
  FavoriteFolder,
  FavoriteStatus,
  FeedItem,
} from "@/types/models";

export async function fetchFavoriteFolders(): Promise<FavoriteFolder[]> {
  const { data } = await apiClient.get<ApiResponse<FavoriteFolder[]>>("/favorites/folders");
  return data.data;
}

export async function createFavoriteFolder(name: string): Promise<FavoriteFolder> {
  const { data } = await apiClient.post<ApiResponse<FavoriteFolder>>("/favorites/folders", { name });
  return data.data;
}

export async function renameFavoriteFolder(folderId: number, name: string): Promise<FavoriteFolder> {
  const { data } = await apiClient.put<ApiResponse<FavoriteFolder>>(`/favorites/folders/${folderId}`, { name });
  return data.data;
}

export async function deleteFavoriteFolder(folderId: number): Promise<void> {
  await apiClient.delete<ApiResponse<null>>(`/favorites/folders/${folderId}`);
}

export async function fetchFavoritePosts(
  folderId: number | undefined,
  cursor: string | null,
  limit = 10
): Promise<CursorPage<FeedItem>> {
  const { data } = await apiClient.get<ApiResponse<CursorPage<FeedItem>>>("/favorites/posts", {
    params: {
      folderId: folderId ?? undefined,
      cursor: cursor ?? undefined,
      limit,
    },
  });
  return data.data;
}

export async function addPostToFavorites(
  postId: number,
  folderId?: number
): Promise<FavoriteStatus> {
  const payload: { postId: number; folderId?: number } = { postId };
  if (folderId !== undefined) {
    payload.folderId = folderId;
  }
  const { data } = await apiClient.post<ApiResponse<FavoriteStatus>>("/favorites/posts", payload);
  return data.data;
}

export async function removePostFromFavorites(
  postId: number,
  folderId?: number
): Promise<FavoriteStatus> {
  const payload: { postId: number; folderId?: number } = { postId };
  if (folderId !== undefined) {
    payload.folderId = folderId;
  }
  const { data } = await apiClient.delete<ApiResponse<FavoriteStatus>>("/favorites/posts", {
    data: payload,
  });
  return data.data;
}

export async function fetchFavoriteStatus(postId: number): Promise<FavoriteStatus> {
  const { data } = await apiClient.get<ApiResponse<FavoriteStatus>>(`/favorites/posts/${postId}/status`);
  return data.data;
}
