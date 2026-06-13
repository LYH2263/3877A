export type FeedChannel = "hot" | "city";
export type FeedMode = "recommended" | "trending" | "discover";
export type ProfileFeedTab = "posts" | "media" | "likes";
export type MessageTab = "all" | "unread" | "likes" | "comments" | "reposts" | "follows";
export type NotificationType = "LIKE" | "COMMENT" | "REPOST" | "FOLLOW";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "SESSION_EXPIRED"
  | "SERVER_ERROR";

export interface ApiResponse<T> {
  code: number | string;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  code: ApiErrorCode | number | string;
  message: string;
  details?: unknown;
}

export interface MutationState<T> {
  pending: boolean;
  optimisticValue?: T;
  rollbackValue?: T;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface User {
  id: number;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  level: string;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  createdAt: string;
}

export interface FeedAuthor {
  id: number;
  nickname: string;
  avatarUrl: string | null;
  level: string;
  isFollowed: boolean;
}

export interface FeedQuotedAuthor {
  id: number;
  nickname: string;
  avatarUrl: string | null;
  level: string;
}

export interface FeedMedia {
  id: number;
  type: "image" | "video";
  url: string;
}

export interface FeedRepostRef {
  id: number;
  author: FeedQuotedAuthor;
  content: string;
  source: string;
  createdAt: string;
  media: FeedMedia[];
  isEdited: boolean;
  editedAt: string | null;
  isDeleted: boolean;
}

export interface FeedItem {
  id: number;
  author: FeedAuthor;
  content: string;
  source: string;
  createdAt: string;
  isEdited: boolean;
  editedAt: string | null;
  channel: FeedChannel;
  media: FeedMedia[];
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  favoritesCount: number;
  isLiked: boolean;
  isReposted: boolean;
  isFavorited: boolean;
  favoritedInFolders: number[];
  repostOf: FeedRepostRef | null;
}

export interface FavoriteFolder {
  id: number;
  name: string;
  isDefault: boolean;
  itemCount: number;
  createdAt: string;
}

export interface FavoriteStatus {
  postId: number;
  isFavorited: boolean;
  favoritedInFolders: number[];
}

export interface RepostPayload {
  sourcePost: FeedItem;
  repostPost: FeedItem;
}

export interface TrendingTopic {
  id: number;
  rank: number;
  keyword: string;
  heat: number;
  tag: "新" | "沸" | "热";
}

export interface RecommendedUser {
  id: number;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  isFollowed: boolean;
}

export interface ReplyItem {
  id: number;
  user: Pick<User, "id" | "nickname" | "avatarUrl">;
  content: string;
  createdAt: string;
  parentId: number | null;
  replyToUser: Pick<User, "id" | "nickname" | "avatarUrl"> | null;
}

export interface CommentItem extends ReplyItem {
  repliesCount: number;
  replies: ReplyItem[];
  repliesNextCursor: string | null;
}

export interface UserSuggestion {
  id: number;
  nickname: string;
  avatarUrl: string | null;
}

export interface AuthPayload {
  user: User;
}

export interface ProfileOverviewUser {
  id: number;
  nickname: string;
  avatarUrl: string | null;
  level: string;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  createdAt: string;
}

export interface ProfileRelationship {
  isSelf: boolean;
  isFollowed: boolean;
}

export interface ProfileSummary {
  postsCount: number;
  mediaCount: number;
  likesCountVisible: number | null;
  totalLikes: number;
  totalComments: number;
  totalReposts: number;
}

export interface ProfileOverviewPayload {
  user: ProfileOverviewUser;
  relationship: ProfileRelationship;
  summary: ProfileSummary;
}

export interface SearchSuggestion {
  id: string;
  type: "topic" | "user";
  label: string;
  keyword: string;
  subtitle?: string;
}

export interface SearchUserResult {
  id: number;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  level: string;
  followersCount: number;
  followingCount: number;
}

export interface SearchTopicResult {
  id: number;
  keyword: string;
  rank: number;
  heat: number;
  tag: "新" | "沸" | "热";
}

export interface SearchResultPayload {
  query: string;
  type: "all" | "post" | "user" | "topic";
  posts: FeedItem[];
  users: SearchUserResult[];
  topics: SearchTopicResult[];
}

export interface TopicFeedPayload {
  topic: SearchTopicResult;
  items: FeedItem[];
  nextCursor: string | null;
}

export interface MessageItem {
  id: number;
  type: NotificationType;
  content: string | null;
  isRead: boolean;
  createdAt: string;
  actor: Pick<User, "id" | "nickname" | "avatarUrl">;
  post: {
    id: number;
    content: string;
  } | null;
}

export interface UnreadCountPayload {
  unreadCount: number;
}

export interface NotificationPreferencePayload {
  notifyLike: boolean;
  notifyComment: boolean;
  notifyRepost: boolean;
  notifyFollow: boolean;
}

export interface SettingsProfilePayload {
  profile: User;
  notifications: NotificationPreferencePayload;
}

export interface CreatorTrendPoint {
  date: string;
  posts: number;
  likes: number;
  comments: number;
  reposts: number;
  interactions: number;
}

export interface CreatorTopPost {
  id: number;
  content: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  hotScore: number;
  cover: {
    type: "image" | "video";
    url: string;
  } | null;
}

export interface CreatorDashboardPayload {
  creator: {
    id: number;
    nickname: string;
    avatarUrl: string | null;
  };
  summary: {
    postsCount: number;
    totalLikes: number;
    totalComments: number;
    totalReposts: number;
    followersCount: number;
    followersNetChange: number;
  };
  trend: CreatorTrendPoint[];
  topPosts: CreatorTopPost[];
}

export interface DraftMedia {
  id: number;
  type: "image" | "video";
  url: string;
  sortOrder: number;
}

export interface DraftItem {
  id: number;
  content: string;
  channel: FeedChannel;
  createdAt: string;
  updatedAt: string;
  media: DraftMedia[];
}

export interface DraftListItem extends DraftItem {
  mediaCount: number;
}
