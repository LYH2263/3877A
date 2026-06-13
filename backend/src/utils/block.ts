import type { PrismaClient, Prisma } from "@prisma/client";

export async function getBlockedUserIds(prisma: PrismaClient, userId: number): Promise<number[]> {
  const blocks = await prisma.block.findMany({
    where: { blockerId: userId },
    select: { blockedId: true }
  });
  return blocks.map((b) => b.blockedId);
}

export async function getBlockerUserIds(prisma: PrismaClient, userId: number): Promise<number[]> {
  const blocks = await prisma.block.findMany({
    where: { blockedId: userId },
    select: { blockerId: true }
  });
  return blocks.map((b) => b.blockerId);
}

export async function getMutuallyBlockedUserIds(prisma: PrismaClient, userId: number): Promise<number[]> {
  const [blocked, blockers] = await Promise.all([
    getBlockedUserIds(prisma, userId),
    getBlockerUserIds(prisma, userId)
  ]);
  return Array.from(new Set([...blocked, ...blockers]));
}

export async function isBlocked(prisma: PrismaClient, blockerId: number, blockedId: number): Promise<boolean> {
  const block = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    select: { id: true }
  });
  return Boolean(block);
}

export async function isEitherBlocked(prisma: PrismaClient, userIdA: number, userIdB: number): Promise<boolean> {
  if (userIdA === userIdB) return false;
  const [aBlockedB, bBlockedA] = await Promise.all([
    isBlocked(prisma, userIdA, userIdB),
    isBlocked(prisma, userIdB, userIdA)
  ]);
  return aBlockedB || bBlockedA;
}

export function buildBlockFilter(currentUserId?: number): Prisma.UserWhereInput | undefined {
  if (!currentUserId) {
    return undefined;
  }
  return {
    AND: [
      { blockedBy: { none: { blockerId: currentUserId } } },
      { blocking: { none: { blockedId: currentUserId } } }
    ]
  };
}
