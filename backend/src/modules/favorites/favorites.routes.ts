import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { fail, ok } from "../../utils/response";
import { toFeedItems } from "../posts/post.presenter";

export const favoritesRouter = Router();

const createFolderSchema = z.object({
  name: z.string().trim().min(1, "收藏夹名称不能为空").max(20, "收藏夹名称最多 20 个字符")
});

const renameFolderSchema = z.object({
  name: z.string().trim().min(1, "收藏夹名称不能为空").max(20, "收藏夹名称最多 20 个字符")
});

const addFavoriteSchema = z.object({
  postId: z.coerce.number().int().positive(),
  folderId: z.coerce.number().int().positive().optional()
});

const removeFavoriteSchema = z.object({
  postId: z.coerce.number().int().positive(),
  folderId: z.coerce.number().int().positive().optional()
});

const favoritesQuerySchema = z.object({
  folderId: z.coerce.number().int().positive().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(30).default(10)
});

async function ensureDefaultFolder(userId: number) {
  const defaultFolder = await prisma.favoriteFolder.findFirst({
    where: { userId, isDefault: true }
  });

  if (defaultFolder) {
    return defaultFolder;
  }

  return prisma.favoriteFolder.create({
    data: {
      userId,
      name: "默认收藏",
      isDefault: true
    }
  });
}

favoritesRouter.get("/folders", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;

  await ensureDefaultFolder(userId);

  const folders = await prisma.favoriteFolder.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
  });

  const allItems = await prisma.favoriteItem.findMany({
    where: { userId },
    select: {
      folderId: true,
      post: { select: { isDeleted: true } }
    }
  });

  const itemCountMap = new Map<number, number>();
  for (const item of allItems) {
    if (item.post.isDeleted) continue;
    const current = itemCountMap.get(item.folderId) ?? 0;
    itemCountMap.set(item.folderId, current + 1);
  }

  ok(
    res,
    folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      isDefault: folder.isDefault,
      itemCount: itemCountMap.get(folder.id) ?? 0,
      createdAt: folder.createdAt
    }))
  );
});

favoritesRouter.post("/folders", requireAuth, async (req, res) => {
  const parsed = createFolderSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? "参数错误", parsed.error.flatten());
    return;
  }

  const userId = req.auth!.userId;
  const { name } = parsed.data;

  try {
    const folder = await prisma.favoriteFolder.create({
      data: {
        userId,
        name,
        isDefault: false
      }
    });

    ok(
      res,
      {
        id: folder.id,
        name: folder.name,
        isDefault: folder.isDefault,
        itemCount: 0,
        createdAt: folder.createdAt
      },
      "收藏夹创建成功",
      201
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      fail(res, 409, "该收藏夹名称已存在", undefined, "CONFLICT");
      return;
    }
    throw error;
  }
});

favoritesRouter.put("/folders/:folderId", requireAuth, async (req, res) => {
  const folderId = Number(req.params.folderId);
  if (!Number.isFinite(folderId)) {
    fail(res, 400, "无效的收藏夹ID");
    return;
  }

  const parsed = renameFolderSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? "参数错误", parsed.error.flatten());
    return;
  }

  const userId = req.auth!.userId;
  const { name } = parsed.data;

  const folder = await prisma.favoriteFolder.findUnique({
    where: { id: folderId }
  });

  if (!folder) {
    fail(res, 404, "收藏夹不存在", undefined, "NOT_FOUND");
    return;
  }

  if (folder.userId !== userId) {
    fail(res, 403, "无权修改他人收藏夹", undefined, "FORBIDDEN");
    return;
  }

  if (folder.isDefault) {
    fail(res, 400, "默认收藏夹不可重命名", undefined, "BAD_REQUEST");
    return;
  }

  try {
    const updated = await prisma.favoriteFolder.update({
      where: { id: folderId },
      data: { name }
    });

    ok(res, {
      id: updated.id,
      name: updated.name,
      isDefault: updated.isDefault,
      createdAt: updated.createdAt
    }, "收藏夹已重命名");
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      fail(res, 409, "该收藏夹名称已存在", undefined, "CONFLICT");
      return;
    }
    throw error;
  }
});

favoritesRouter.delete("/folders/:folderId", requireAuth, async (req, res) => {
  const folderId = Number(req.params.folderId);
  if (!Number.isFinite(folderId)) {
    fail(res, 400, "无效的收藏夹ID");
    return;
  }

  const userId = req.auth!.userId;

  const folder = await prisma.favoriteFolder.findUnique({
    where: { id: folderId }
  });

  if (!folder) {
    fail(res, 404, "收藏夹不存在", undefined, "NOT_FOUND");
    return;
  }

  if (folder.userId !== userId) {
    fail(res, 403, "无权删除他人收藏夹", undefined, "FORBIDDEN");
    return;
  }

  if (folder.isDefault) {
    fail(res, 400, "默认收藏夹不可删除", undefined, "BAD_REQUEST");
    return;
  }

  const defaultFolder = await ensureDefaultFolder(userId);

  await prisma.$transaction(async (tx) => {
    await tx.favoriteItem.updateMany({
      where: { userId, folderId },
      data: { folderId: defaultFolder.id }
    });

    await tx.favoriteFolder.delete({
      where: { id: folderId }
    });
  });

  ok(res, null, "收藏夹已删除，其中的收藏项已移至默认收藏夹");
});

favoritesRouter.get("/posts", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const { folderId, cursor, limit } = favoritesQuerySchema.parse(req.query);

  await ensureDefaultFolder(userId);

  let targetFolderId = folderId;
  if (!targetFolderId) {
    const defaultFolder = await prisma.favoriteFolder.findFirst({
      where: { userId, isDefault: true },
      select: { id: true }
    });
    if (defaultFolder) {
      targetFolderId = defaultFolder.id;
    } else {
      ok(res, { items: [], nextCursor: null });
      return;
    }
  }

  const folder = await prisma.favoriteFolder.findUnique({
    where: { id: targetFolderId }
  });

  if (!folder || folder.userId !== userId) {
    fail(res, 404, "收藏夹不存在", undefined, "NOT_FOUND");
    return;
  }

  const cursorId = decodeCursor(cursor);

  const favoriteItems = await prisma.favoriteItem.findMany({
    where: {
      userId,
      folderId: targetFolderId,
      ...(cursorId ? { id: { lt: cursorId } } : {})
    },
    orderBy: [{ id: "desc" }],
    take: limit + 1,
    include: {
      post: {
        include: {
          author: { select: { id: true, nickname: true, avatarUrl: true, level: true } },
          media: true,
          repostOf: {
            include: {
              author: { select: { id: true, nickname: true, avatarUrl: true, level: true } },
              media: true
            }
          }
        }
      }
    }
  });

  const hasMore = favoriteItems.length > limit;
  const slice = hasMore ? favoriteItems.slice(0, limit) : favoriteItems;

  const posts = slice.map((item) => item.post).filter((post) => !post.isDeleted);

  const items = await toFeedItems(posts as any[], userId);

  ok(res, {
    items,
    nextCursor: hasMore ? encodeCursor(slice[slice.length - 1]?.id ?? null) : null
  });
});

favoritesRouter.post("/posts", requireAuth, async (req, res) => {
  const parsed = addFavoriteSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? "参数错误", parsed.error.flatten());
    return;
  }

  const userId = req.auth!.userId;
  const { postId, folderId } = parsed.data;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, isDeleted: true, favoritesCount: true }
  });

  if (!post || post.isDeleted) {
    fail(res, 404, "动态不存在", undefined, "NOT_FOUND");
    return;
  }

  const targetFolderId = folderId ?? (await ensureDefaultFolder(userId)).id;

  const folder = await prisma.favoriteFolder.findUnique({
    where: { id: targetFolderId }
  });

  if (!folder || folder.userId !== userId) {
    fail(res, 404, "收藏夹不存在", undefined, "NOT_FOUND");
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existingInFolder = await tx.favoriteItem.findUnique({
        where: {
          userId_folderId_postId: {
            userId,
            folderId: targetFolderId,
            postId
          }
        }
      });

      if (existingInFolder) {
        throw new Error("ALREADY_FAVORITED");
      }

      const existingAnywhere = await tx.favoriteItem.findFirst({
        where: { userId, postId },
        select: { id: true }
      });

      await tx.favoriteItem.create({
        data: {
          userId,
          folderId: targetFolderId,
          postId
        }
      });

      if (!existingAnywhere) {
        await tx.post.update({
          where: { id: postId },
          data: {
            favoritesCount: post.favoritesCount + 1
          }
        });
      }
    });

    const updated = await prisma.favoriteItem.findMany({
      where: { userId, postId },
      select: { folderId: true }
    });

    ok(
      res,
      {
        postId,
        isFavorited: true,
        favoritedInFolders: updated.map((item) => item.folderId)
      },
      "已添加到收藏夹"
    );
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_FAVORITED") {
      fail(res, 409, "该动态已在此收藏夹中", undefined, "CONFLICT");
      return;
    }
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      fail(res, 409, "该动态已在此收藏夹中", undefined, "CONFLICT");
      return;
    }
    throw error;
  }
});

favoritesRouter.delete("/posts", requireAuth, async (req, res) => {
  const parsed = removeFavoriteSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, parsed.error.issues[0]?.message ?? "参数错误", parsed.error.flatten());
    return;
  }

  const userId = req.auth!.userId;
  const { postId, folderId } = parsed.data;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, favoritesCount: true }
  });

  if (!post) {
    fail(res, 404, "动态不存在", undefined, "NOT_FOUND");
    return;
  }

  if (folderId) {
    const folder = await prisma.favoriteFolder.findUnique({
      where: { id: folderId }
    });
    if (!folder || folder.userId !== userId) {
      fail(res, 404, "收藏夹不存在", undefined, "NOT_FOUND");
      return;
    }

    const existing = await prisma.favoriteItem.findUnique({
      where: {
        userId_folderId_postId: {
          userId,
          folderId,
          postId
        }
      }
    });

    if (!existing) {
      fail(res, 404, "该动态未在此收藏夹中", undefined, "NOT_FOUND");
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.favoriteItem.delete({
        where: { id: existing.id }
      });

      const remaining = await tx.favoriteItem.count({
        where: { userId, postId }
      });

      if (remaining === 0) {
        await tx.post.update({
          where: { id: postId },
          data: {
            favoritesCount: Math.max(0, post.favoritesCount - 1)
          }
        });
      }
    });
  } else {
    const items = await prisma.favoriteItem.findMany({
      where: { userId, postId },
      select: { id: true }
    });

    if (items.length === 0) {
      fail(res, 404, "该动态未被收藏", undefined, "NOT_FOUND");
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.favoriteItem.deleteMany({
        where: { userId, postId }
      });

      await tx.post.update({
        where: { id: postId },
        data: {
          favoritesCount: Math.max(0, post.favoritesCount - 1)
        }
      });
    });
  }

  const updated = await prisma.favoriteItem.findMany({
    where: { userId, postId },
    select: { folderId: true }
  });

  ok(
    res,
    {
      postId,
      isFavorited: updated.length > 0,
      favoritedInFolders: updated.map((item) => item.folderId)
    },
    "已取消收藏"
  );
});

favoritesRouter.get("/posts/:postId/status", requireAuth, async (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) {
    fail(res, 400, "无效的动态ID");
    return;
  }

  const userId = req.auth!.userId;

  const items = await prisma.favoriteItem.findMany({
    where: { userId, postId },
    select: { folderId: true }
  });

  ok(res, {
    postId,
    isFavorited: items.length > 0,
    favoritedInFolders: items.map((item) => item.folderId)
  });
});
