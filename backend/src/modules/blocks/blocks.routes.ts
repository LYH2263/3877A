import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { fail, ok } from "../../utils/response";
import { withMediaPrefix } from "../../utils/post-mapper";
import { isEitherBlocked } from "../../utils/block";

export const blocksRouter = Router();

blocksRouter.use(requireAuth);

const blockUserBodySchema = z.object({
  userId: z.coerce.number().int().positive(),
  reason: z.string().trim().max(50).optional()
});

blocksRouter.post("/", async (req, res) => {
  const parsed = blockUserBodySchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, "无效的用户ID");
    return;
  }

  const targetUserId = parsed.data.userId;
  const blockReason = parsed.data.reason ?? null;
  const currentUserId = req.auth!.userId;

  if (targetUserId === currentUserId) {
    fail(res, 400, "不能拉黑自己");
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) {
    fail(res, 404, "用户不存在");
    return;
  }

  const existing = await prisma.block.findUnique({
    where: {
      blockerId_blockedId: {
        blockerId: currentUserId,
        blockedId: targetUserId
      }
    }
  });

  if (existing) {
    ok(res, { isBlocked: true }, "已经拉黑该用户");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.block.create({
      data: {
        blockerId: currentUserId,
        blockedId: targetUserId,
        reason: blockReason
      }
    });

    const followAB = await tx.follow.findUnique({
      where: { followerId_followingId: { followerId: currentUserId, followingId: targetUserId } }
    });
    const followBA = await tx.follow.findUnique({
      where: { followerId_followingId: { followerId: targetUserId, followingId: currentUserId } }
    });

    if (followAB) {
      await tx.follow.delete({ where: { id: followAB.id } });
      await tx.user.update({
        where: { id: currentUserId },
        data: { followingCount: { decrement: 1 } }
      });
      await tx.user.update({
        where: { id: targetUserId },
        data: { followersCount: { decrement: 1 } }
      });
    }

    if (followBA) {
      await tx.follow.delete({ where: { id: followBA.id } });
      await tx.user.update({
        where: { id: targetUserId },
        data: { followingCount: { decrement: 1 } }
      });
      await tx.user.update({
        where: { id: currentUserId },
        data: { followersCount: { decrement: 1 } }
      });
    }
  });

  ok(res, { isBlocked: true }, "拉黑成功");
});

blocksRouter.delete("/:userId", async (req, res) => {
  const targetUserId = Number(req.params.userId);
  if (!Number.isFinite(targetUserId)) {
    fail(res, 400, "无效的用户ID");
    return;
  }

  const currentUserId = req.auth!.userId;

  const existing = await prisma.block.findUnique({
    where: {
      blockerId_blockedId: {
        blockerId: currentUserId,
        blockedId: targetUserId
      }
    }
  });

  if (!existing) {
    ok(res, { isBlocked: false }, "未拉黑该用户");
    return;
  }

  await prisma.block.delete({ where: { id: existing.id } });

  ok(res, { isBlocked: false }, "解除拉黑成功");
});

blocksRouter.get("/check/:userId", async (req, res) => {
  const targetUserId = Number(req.params.userId);
  if (!Number.isFinite(targetUserId)) {
    fail(res, 400, "无效的用户ID");
    return;
  }

  const currentUserId = req.auth!.userId;

  if (targetUserId === currentUserId) {
    ok(res, { isBlocked: false, isBlockedBy: false });
    return;
  }

  const [isBlocked, isBlockedBy] = await Promise.all([
    prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: currentUserId, blockedId: targetUserId } },
      select: { id: true }
    }),
    prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: targetUserId, blockedId: currentUserId } },
      select: { id: true }
    })
  ]);

  ok(res, {
    isBlocked: Boolean(isBlocked),
    isBlockedBy: Boolean(isBlockedBy)
  });
});

const blockedListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20)
});

blocksRouter.get("/", async (req, res) => {
  const { cursor, limit } = blockedListQuerySchema.parse(req.query);
  const currentUserId = req.auth!.userId;
  const cursorId = decodeCursor(cursor);

  const blocks = await prisma.block.findMany({
    where: {
      blockerId: currentUserId,
      ...(cursorId ? { id: { lt: cursorId } } : {})
    },
    orderBy: [{ id: "desc" }],
    take: limit + 1,
    include: {
      blocked: {
        select: {
          id: true,
          nickname: true,
          avatarUrl: true,
          bio: true,
          level: true
        }
      }
    }
  });

  const hasMore = blocks.length > limit;
  const slice = hasMore ? blocks.slice(0, limit) : blocks;

  ok(res, {
    items: slice.map((block) => ({
      id: block.id,
      createdAt: block.createdAt,
      reason: block.reason,
      user: {
        id: block.blocked.id,
        nickname: block.blocked.nickname,
        avatarUrl: withMediaPrefix(block.blocked.avatarUrl),
        bio: block.blocked.bio,
        level: block.blocked.level
      }
    })),
    nextCursor: hasMore ? encodeCursor(slice[slice.length - 1]?.id ?? null) : null
  });
});

export { isEitherBlocked };
