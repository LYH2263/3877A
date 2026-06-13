import { useEffect, useState } from "react";
import { Bookmark, Check, FolderPlus, LoaderCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  addPostToFavorites,
  createFavoriteFolder,
  fetchFavoriteFolders,
  removePostFromFavorites,
} from "@/api/favorites";
import { parseApiError } from "@/lib/api-error";
import { formatCount } from "@/lib/format";
import type { FavoriteFolder, FavoriteStatus } from "@/types/models";

interface AddToFavoritesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: number;
  initialFavoritedInFolders: number[];
  onStatusChange: (status: FavoriteStatus) => void;
}

export function AddToFavoritesDialog({
  open,
  onOpenChange,
  postId,
  initialFavoritedInFolders,
  onStatusChange,
}: AddToFavoritesDialogProps) {
  const [folders, setFolders] = useState<FavoriteFolder[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedFolderIds(new Set(initialFavoritedInFolders));
    setShowNewFolder(false);
    setNewFolderName("");
    void loadFolders();
  }, [open, initialFavoritedInFolders]);

  const loadFolders = async () => {
    setLoading(true);
    try {
      const data = await fetchFavoriteFolders();
      setFolders(data);
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message || "收藏夹加载失败");
    } finally {
      setLoading(false);
    }
  };

  const toggleFolder = (folderId: number) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      toast.warning("收藏夹名称不能为空");
      return;
    }
    if (trimmed.length > 20) {
      toast.warning("收藏夹名称最多 20 个字符");
      return;
    }

    setCreatingFolder(true);
    try {
      const folder = await createFavoriteFolder(trimmed);
      setFolders((prev) => [...prev, folder]);
      setSelectedFolderIds((prev) => new Set([...prev, folder.id]));
      setNewFolderName("");
      setShowNewFolder(false);
      toast.success("收藏夹创建成功");
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message || "收藏夹创建失败");
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    const initiallyFavorited = initialFavoritedInFolders;
    const toAdd: number[] = [];
    const toRemove: number[] = [];

    for (const folderId of selectedFolderIds) {
      if (!initiallyFavorited.includes(folderId)) {
        toAdd.push(folderId);
      }
    }
    for (const folderId of initiallyFavorited) {
      if (!selectedFolderIds.has(folderId)) {
        toRemove.push(folderId);
      }
    }

    try {
      const addPromises = toAdd.map((fid) => addPostToFavorites(postId, fid));
      const removePromises = toRemove.map((fid) => removePostFromFavorites(postId, fid));
      const allResults = await Promise.all([...addPromises, ...removePromises]);

      let finalStatus: FavoriteStatus = {
        postId,
        isFavorited: selectedFolderIds.size > 0,
        favoritedInFolders: Array.from(selectedFolderIds),
      };
      if (allResults.length > 0) {
        finalStatus = allResults[allResults.length - 1];
      }

      onStatusChange(finalStatus);
      onOpenChange(false);
      toast.success(
        finalStatus.isFavorited ? "收藏操作完成" : "已从所有收藏夹移除"
      );
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message || "收藏操作失败");
      void loadFolders();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-brand-600" />
            添加到收藏夹
          </DialogTitle>
          <DialogDescription>
            选择要将此动态加入的收藏夹，或创建新的分组。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="py-8 text-center">
              <LoaderCircle className="mx-auto h-5 w-5 animate-spin text-slate-400" />
              <p className="mt-2 text-xs text-slate-500">加载收藏夹...</p>
            </div>
          ) : folders.length === 0 && !showNewFolder ? (
            <div className="py-8 text-center text-sm text-slate-500">
              暂无收藏夹，点击下方按钮新建
            </div>
          ) : (
            folders.map((folder) => {
              const selected = selectedFolderIds.has(folder.id);
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => toggleFolder(folder.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    selected
                      ? "border-brand-200 bg-brand-50 text-brand-700"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        selected
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {selected ? <Check className="h-3.5 w-3.5" /> : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {folder.name}
                        {folder.isDefault ? (
                          <span className="ml-1.5 text-xs font-normal text-slate-400">
                            （默认）
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatCount(folder.itemCount)} 条收藏
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}

          {showNewFolder ? (
            <div className="rounded-lg border border-slate-200 p-2.5 space-y-2 bg-slate-50">
              <div className="flex gap-2">
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="输入收藏夹名称（1-20 字）"
                  maxLength={20}
                  autoFocus
                  disabled={creatingFolder}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={creatingFolder}
                  onClick={() => {
                    setShowNewFolder(false);
                    setNewFolderName("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={handleCreateFolder} disabled={creatingFolder}>
                  {creatingFolder ? (
                    <>
                      <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
                      创建中
                    </>
                  ) : (
                    "创建并选择"
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {!showNewFolder ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-1.5 border-dashed text-slate-600"
            onClick={() => setShowNewFolder(true)}
          >
            <Plus className="h-4 w-4" />
            <FolderPlus className="h-4 w-4" />
            新建收藏夹
          </Button>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
                保存中
              </>
            ) : (
              "保存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
