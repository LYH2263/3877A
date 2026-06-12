import { NotificationType, type Prisma } from "@prisma/client";

interface NotificationPreference {
  notifyLike: boolean;
  notifyComment: boolean;
  notifyRepost: boolean;
  notifyFollow: boolean;
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreference = {
  notifyLike: true,
  notifyComment: true,
  notifyRepost: true,
  notifyFollow: true
};

const preferenceKeyByType: Record<NotificationType, keyof NotificationPreference> = {
  [NotificationType.LIKE]: "notifyLike",
  [NotificationType.COMMENT]: "notifyComment",
  [NotificationType.REPOST]: "notifyRepost",
  [NotificationType.FOLLOW]: "notifyFollow"
};

export interface CreateNotificationInput {
  targetUserId: number;
  actorUserId: number;
  type: NotificationType;
  postId?: number | null;
  content?: string | null;
}

export async function createNotificationIfAllowed(tx: Prisma.TransactionClient, input: CreateNotificationInput) {
  if (input.targetUserId === input.actorUserId) {
    return null;
  }

  const settings = await tx.userSettings.findUnique({
    where: { userId: input.targetUserId },
    select: {
      notifyLike: true,
      notifyComment: true,
      notifyRepost: true,
      notifyFollow: true
    }
  });

  const preferenceKey = preferenceKeyByType[input.type];
  const enabled = settings ? settings[preferenceKey] : DEFAULT_NOTIFICATION_PREFERENCES[preferenceKey];
  if (!enabled) {
    return null;
  }

  const content = typeof input.content === "string" ? input.content.trim().slice(0, 240) : null;

  return tx.notification.create({
    data: {
      targetUserId: input.targetUserId,
      actorUserId: input.actorUserId,
      postId: input.postId ?? null,
      type: input.type,
      content: content && content.length > 0 ? content : null
    }
  });
}
