import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { toast } from "sonner";

import { editPost } from "@/api/discovery";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseApiError } from "@/lib/api-error";
import type { FeedItem, FeedMedia } from "@/types/models";

interface EditPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: FeedItem;
  onEdited: (updated: FeedItem) => void;
}

const MAX_CONTENT_LENGTH = 1000;
const MIN_CONTENT_LENGTH = 3;

export function EditPostDialog({ open, onOpenChange, item, onEdited }: EditPostDialogProps) {
  const [content, setContent] = useState("");
  const [mediaOrder, setMediaOrder] = useState<FeedMedia[]>([]);
  const [contentError, setContentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setContent(item.content);
      setMediaOrder([...item.media]);
      setContentError(null);
      setSubmitting(false);
    }
  }, [open, item]);

  const moveMedia = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= mediaOrder.length) {
      return;
    }

    setMediaOrder((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[nextIndex];
      next[nextIndex] = temp;
      return next;
    });
  };

  const onSubmit = async () => {
    const trimmed = content.trim();
    if (trimmed.length < MIN_CONTENT_LENGTH) {
      setContentError(`正文至少 ${MIN_CONTENT_LENGTH} 个字符`);
      return;
    }
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      setContentError(`正文最多 ${MAX_CONTENT_LENGTH} 个字符`);
      return;
    }

    setContentError(null);
    setSubmitting(true);
    try {
      const updated = await editPost(item.id, {
        content: trimmed,
        mediaOrder: mediaOrder.length > 1 ? mediaOrder.map((m) => m.id) : undefined
      });
      onEdited(updated);
      onOpenChange(false);
      toast.success("动态编辑成功");
    } catch (error) {
      const parsed = parseApiError(error);
      if (parsed.message.includes("正文")) {
        setContentError(parsed.message);
      }
      toast.error(parsed.message || "编辑失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>编辑动态</DialogTitle>
          <DialogDescription>可修改正文内容和调整媒体排序，编辑后将展示"已编辑"标记。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-content">正文内容</Label>
            <Textarea
              id="edit-content"
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                if (contentError) {
                  const trimmed = event.target.value.trim();
                  if (trimmed.length >= MIN_CONTENT_LENGTH && trimmed.length <= MAX_CONTENT_LENGTH) {
                    setContentError(null);
                  }
                }
              }}
              invalid={Boolean(contentError)}
              className="min-h-[140px]"
              placeholder="分享此刻想法，支持 #话题# 形式"
              maxLength={MAX_CONTENT_LENGTH}
            />
            <div className="flex items-center justify-between">
              {contentError ? <p className="text-xs text-red-500">{contentError}</p> : <span />}
              <span className={`text-xs ${content.length > MAX_CONTENT_LENGTH ? "text-red-500" : "text-slate-400"}`}>
                {content.length}/{MAX_CONTENT_LENGTH}
              </span>
            </div>
          </div>

          {mediaOrder.length > 0 ? (
            <div className="space-y-2">
              <Label>媒体排序</Label>
              <div className="space-y-2">
                {mediaOrder.map((media, index) => (
                  <div
                    key={media.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2"
                  >
                    <div className="flex items-center text-slate-400">
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                      {media.type === "video" ? (
                        <video src={media.url} className="h-full w-full object-cover" muted />
                      ) : (
                        <img src={media.url} alt="媒体预览" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-sm text-slate-600">
                      <span className="font-medium">{media.type === "video" ? "视频" : "图片"}</span>
                      <span className="text-slate-400"> · 第 {index + 1} 张</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        disabled={index === 0}
                        onClick={() => moveMedia(index, "up")}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        disabled={index === mediaOrder.length - 1}
                        onClick={() => moveMedia(index, "down")}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button type="button" onClick={() => void onSubmit()} disabled={submitting}>
            {submitting ? "保存中..." : "保存修改"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
