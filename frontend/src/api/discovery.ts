import { apiClient } from "@/api/client";
import type {
  ApiResponse,
  CommentItem,
  CursorPage,
  FeedChannel,
  FeedItem,
  FeedMode,
  ProfileFeedTab,
  ProfileOverviewPayload,
  RecommendedUser,
  RepostPayload,
  SearchResultPayload,
  SearchSuggestion,
  TopicFeedPayload,
  TrendingTopic
} from "@/types/models";

interface FeedResponse {
  items: FeedItem[];
  nextCursor: string | null;
}

export async function fetchFeed(channel: FeedChannel, mode: FeedMode, cursor: string | null, limit = 10): Promise<CursorPage<FeedItem>> {
  const { data } = await apiClient.get<ApiResponse<FeedResponse>>("/discovery/feed", {
    params: {
      channel,
      mode,
      cursor: cursor ?? undefined,
      limit
    }
  });
  return data.data;
}

export async function toggleLike(postId: number): Promise<FeedItem> {
  const { data } = await apiClient.post<ApiResponse<FeedItem>>(`/posts/${postId}/like`);
  return data.data;
}

export async function fetchPostDetail(postId: number): Promise<FeedItem> {
  const { data } = await apiClient.get<ApiResponse<FeedItem>>(`/posts/${postId}`);
  return data.data;
}

export async function createRepost(postId: number, content = ""): Promise<RepostPayload> {
  const { data } = await apiClient.post<ApiResponse<RepostPayload>>(`/posts/${postId}/repost`, { content });
  return data.data;
}

export async function toggleFollow(userId: number): Promise<{ isFollowed: boolean }> {
  const { data } = await apiClient.post<ApiResponse<{ isFollowed: boolean }>>(`/users/${userId}/follow`);
  return data.data;
}

export async function fetchTrending(): Promise<TrendingTopic[]> {
  const { data } = await apiClient.get<ApiResponse<TrendingTopic[]>>("/trending");
  return data.data;
}

export async function refreshTrending(): Promise<TrendingTopic[]> {
  const { data } = await apiClient.post<ApiResponse<TrendingTopic[]>>("/trending/refresh");
  return data.data;
}

export async function fetchRecommendations(): Promise<RecommendedUser[]> {
  const { data } = await apiClient.get<ApiResponse<RecommendedUser[]>>("/recommendations");
  return data.data;
}

export async function refreshRecommendations(): Promise<RecommendedUser[]> {
  const { data } = await apiClient.post<ApiResponse<RecommendedUser[]>>("/recommendations/refresh");
  return data.data;
}

export async function fetchComments(postId: number, cursor: string | null, limit = 10): Promise<CursorPage<CommentItem>> {
  const { data } = await apiClient.get<ApiResponse<CursorPage<CommentItem>>>(`/posts/${postId}/comments`, {
    params: {
      cursor: cursor ?? undefined,
      limit
    }
  });
  return data.data;
}

export async function createComment(postId: number, content: string): Promise<CommentItem> {
  const { data } = await apiClient.post<ApiResponse<CommentItem>>(`/posts/${postId}/comments`, { content });
  return data.data;
}

export interface CreatePostInput {
  content: string;
  channel: FeedChannel;
  files: File[];
}

export async function createPost(input: CreatePostInput): Promise<FeedItem> {
  const formData = new FormData();
  formData.append("content", input.content);
  formData.append("channel", input.channel);
  input.files.forEach((file) => formData.append("media", file));

  const { data } = await apiClient.post<ApiResponse<FeedItem>>("/posts", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });

  return data.data;
}

export async function fetchProfileOverview(userId: number): Promise<ProfileOverviewPayload> {
  const { data } = await apiClient.get<ApiResponse<ProfileOverviewPayload>>(`/users/${userId}/profile`);
  return data.data;
}

export async function fetchProfileFeed(
  userId: number,
  tab: ProfileFeedTab,
  cursor: string | null,
  limit = 10
): Promise<CursorPage<FeedItem>> {
  const { data } = await apiClient.get<ApiResponse<CursorPage<FeedItem>>>(`/users/${userId}/profile/posts`, {
    params: {
      tab,
      cursor: cursor ?? undefined,
      limit
    }
  });
  return data.data;
}

export async function fetchSearchSuggestions(query: string, limit = 8): Promise<SearchSuggestion[]> {
  const { data } = await apiClient.get<ApiResponse<SearchSuggestion[]>>("/search/suggest", {
    params: {
      q: query,
      limit
    }
  });
  return data.data;
}

export async function fetchSearchResults(query: string, type: "all" | "post" | "user" | "topic", limit = 20): Promise<SearchResultPayload> {
  const { data } = await apiClient.get<ApiResponse<SearchResultPayload>>("/search", {
    params: {
      q: query,
      type,
      limit
    }
  });
  return data.data;
}

export async function fetchTopicFeedById(topicId: number, cursor: string | null, limit = 10): Promise<TopicFeedPayload> {
  const { data } = await apiClient.get<ApiResponse<TopicFeedPayload>>(`/topics/${topicId}/feed`, {
    params: {
      cursor: cursor ?? undefined,
      limit
    }
  });
  return data.data;
}

export async function fetchTopicFeedByKeyword(keyword: string, cursor: string | null, limit = 10): Promise<TopicFeedPayload> {
  const { data } = await apiClient.get<ApiResponse<TopicFeedPayload>>(`/topics/by-keyword/${encodeURIComponent(keyword)}/feed`, {
    params: {
      cursor: cursor ?? undefined,
      limit
    }
  });
  return data.data;
}

export interface EditPostInput {
  content: string;
  mediaOrder?: number[];
}

export async function editPost(postId: number, input: EditPostInput): Promise<FeedItem> {
  const { data } = await apiClient.put<ApiResponse<FeedItem>>(`/posts/${postId}`, input);
  return data.data;
}

export async function deletePost(postId: number): Promise<void> {
  await apiClient.delete<ApiResponse<null>>(`/posts/${postId}`);
}
