import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { FileText, ImagePlus, Save, Upload, Video } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";

import { createPost } from "@/api/discovery";
import { createDraft, fetchDraft, publishDraft, updateDraft } from "@/api/drafts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { parseApiError } from "@/lib/api-error";
import type { DraftItem, FeedChannel } from "@/types/models";
import { Badge } from "@/components/ui/badge";

const composeSchema = z.object({
  content: z.string().min(3, "正文至少 3 个字符").max(1000, "正文最多 1000 个字符")
});

const AUTOSAVE_INTERVAL_MS = 5000;
const DEBOUNCE_SAVE_MS = 2000;

interface RemoteMedia {
  type: "image" | "video";
  url: string;
  sortOrder: number;
}

export default function ComposePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftIdParam = searchParams.get("draftId");

  const [channel, setChannel] = useState<FeedChannel>("hot");
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Array<{ type: "image" | "video"; url: string }>>([]);
  const [contentError, setContentError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [draftId, setDraftId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [remoteMedia, setRemoteMedia] = useState<RemoteMedia[]>([]);

  const contentRef = useRef(content);
  const channelRef = useRef(channel);
  const filesRef = useRef(files);
  const draftIdRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveInFlightRef = useRef(false);

  contentRef.current = content;
  channelRef.current = channel;
  filesRef.current = files;
  draftIdRef.current = draftId;

  const hasUnsavedContent = useCallback(() => {
    return content.trim().length > 0 || files.length > 0 || remoteMedia.length > 0;
  }, [content, files.length, remoteMedia.length]);

  const hasUnsavedContentRef = useRef(hasUnsavedContent());
  hasUnsavedContentRef.current = hasUnsavedContent();

  const buildFormDataForSave = useCallback(() => {
    const needsNewFiles = filesRef.current.length > 0;
    return {
      content: contentRef.current,
      channel: channelRef.current,
      files: needsNewFiles ? filesRef.current : undefined
    };
  }, []);

  const performSave = useCallback(async () => {
    if (saveInFlightRef.current) return;
    if (!hasUnsavedContentRef.current) return;

    saveInFlightRef.current = true;
    setSaving(true);

    try {
      const payload = buildFormDataForSave();
      if (draftIdRef.current) {
        const updated = await updateDraft(draftIdRef.current, payload);
        setDraftId(updated.id);
        if (filesRef.current.length > 0) {
          setRemoteMedia(updated.media.map((m) => ({ type: m.type, url: m.url, sortOrder: m.sortOrder })));
          setFiles([]);
        }
      } else {
        const created = await createDraft(payload);
        setDraftId(created.id);
        if (filesRef.current.length > 0) {
          setRemoteMedia(created.media.map((m) => ({ type: m.type, url: m.url, sortOrder: m.sortOrder })));
          setFiles([]);
        }
      }
      setLastSavedAt(new Date());
    } catch (error) {
      const parsed = parseApiError(error);
      if (!parsed.message.includes("上限")) {
        toast.error("草稿保存失败：" + (parsed.message || "请稍后重试"));
      }
    } finally {
      setSaving(false);
      saveInFlightRef.current = false;
    }
  }, [buildFormDataForSave]);

  const scheduleDebouncedSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void performSave();
    }, DEBOUNCE_SAVE_MS);
  }, [performSave]);

  useEffect(() => {
    if (!draftIdParam) return;

    const id = Number(draftIdParam);
    if (!Number.isFinite(id)) return;

    setLoadingDraft(true);
    fetchDraft(id)
      .then((draft: DraftItem) => {
        setDraftId(draft.id);
        setContent(draft.content);
        setChannel(draft.channel);
        setRemoteMedia(draft.media.map((m) => ({ type: m.type, url: m.url, sortOrder: m.sortOrder })));
      })
      .catch((error) => {
        const parsed = parseApiError(error);
        toast.error(parsed.message || "草稿不存在或已删除");
      })
      .finally(() => {
        setLoadingDraft(false);
      });
  }, [draftIdParam]);

  useEffect(() => {
    const allPreviews: Array<{ type: "image" | "video"; url: string }> = [];
    remoteMedia.forEach((m) => allPreviews.push({ type: m.type, url: m.url }));
    const objectUrls: string[] = [];
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      allPreviews.push({
        type: file.type.startsWith("video/") ? "video" : "image",
        url
      });
    });
    setPreviews(allPreviews);

    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files, remoteMedia]);

  useEffect(() => {
    if (loadingDraft) return;
    scheduleDebouncedSave();
  }, [content, channel, files, loadingDraft, scheduleDebouncedSave]);

  useEffect(() => {
    autosaveTimerRef.current = setInterval(() => {
      void performSave();
    }, AUTOSAVE_INTERVAL_MS);

    return () => {
      if (autosaveTimerRef.current) {
        clearInterval(autosaveTimerRef.current);
      }
    };
  }, [performSave]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedContentRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (contentError && content.trim().length >= 3) {
      setContentError(null);
    }
  }, [content, contentError]);

  const onChangeFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length === 0) {
      if (remoteMedia.length === 0) {
        setFiles([]);
        setMediaError(null);
      }
      return;
    }

    if (selected.some((file) => !file.type.startsWith("image/") && !file.type.startsWith("video/"))) {
      setMediaError("仅支持图片或视频文件");
      return;
    }

    if (selected.some((file) => file.size > 30 * 1024 * 1024)) {
      setMediaError("单个文件不能超过 30MB");
      return;
    }

    const videos = selected.filter((file) => file.type.startsWith("video/"));
    if (videos.length > 1) {
      setMediaError("最多只能上传 1 个视频");
      return;
    }

    if (videos.length === 1 && selected.length > 1) {
      setMediaError("视频发布时不支持混传多图");
      return;
    }

    const images = selected.filter((file) => file.type.startsWith("image/"));
    if (images.length > 9) {
      setMediaError("最多上传 9 张图片");
      return;
    }

    setMediaError(null);
    setRemoteMedia([]);
    setFiles(selected);
  };

  const clearMedia = () => {
    setRemoteMedia([]);
    setFiles([]);
    setMediaError(null);
  };

  const onSubmit = async () => {
    const parsed = composeSchema.safeParse({ content });
    if (!parsed.success) {
      setContentError(parsed.error.issues[0]?.message ?? "请检查输入");
      return;
    }

    if (mediaError) {
      return;
    }

    setContentError(null);

    try {
      setSubmitting(true);

      if (draftId && remoteMedia.length > 0 && files.length === 0) {
        await publishDraft(draftId);
        toast.success("发布成功");
        navigate("/");
        return;
      }

      const allFiles: File[] = [];
      if (remoteMedia.length > 0) {
        const blobResults = await Promise.all(
          remoteMedia.map(async (m) => {
            try {
              const response = await fetch(m.url);
              const blob = await response.blob();
              const ext = m.type === "video" ? ".mp4" : ".jpg";
              return new File([blob], `draft-media-${m.sortOrder}${ext}`, { type: `${m.type}/*` });
            } catch {
              return null;
            }
          })
        );
        blobResults.forEach((f) => {
          if (f) allFiles.push(f);
        });
      }
      files.forEach((f) => allFiles.push(f));

      await createPost({ content: parsed.data.content, channel, files: allFiles });

      if (draftId) {
        try {
          const { deleteDraft } = await import("@/api/drafts");
          await deleteDraft(draftId);
        } catch {
        }
      }

      toast.success("发布成功");
      navigate("/");
    } catch (error) {
      const parsedError = parseApiError(error);
      if (parsedError.message.includes("正文")) {
        setContentError(parsedError.message);
      } else if (
        parsedError.message.includes("上传") ||
        parsedError.message.includes("视频") ||
        parsedError.message.includes("图片")
      ) {
        setMediaError(parsedError.message);
      }
      toast.error(parsedError.message || "发布失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const onManualSave = async () => {
    await performSave();
    if (lastSavedAt || draftId) {
      toast.success("草稿已保存");
    }
  };

  if (loadingDraft) {
    return (
      <main className="mx-auto mt-6 w-full max-w-6xl px-4 pb-12">
        <div className="mx-auto w-full max-w-3xl text-center text-slate-500">正在加载草稿...</div>
      </main>
    );
  }

  return (
    <main className="mx-auto mt-6 w-full max-w-6xl px-4 pb-12">
      <Card className="mx-auto w-full max-w-3xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>发布动态</CardTitle>
          <div className="flex items-center gap-2">
            {draftId ? (
              <Badge variant="secondary" className="gap-1">
                <FileText className="h-3 w-3" /> 草稿 {draftId}
              </Badge>
            ) : null}
            {saving ? (
              <Badge variant="outline" className="gap-1">
                <Save className="h-3 w-3 animate-pulse" /> 保存中...
              </Badge>
            ) : lastSavedAt ? (
              <Badge variant="outline" className="gap-1 text-slate-500">
                <Save className="h-3 w-3" /> 已保存 {lastSavedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              </Badge>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void onManualSave()} disabled={saving || !hasUnsavedContent()}>
              <Save className="h-4 w-4" /> 保存草稿
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/drafts")}>
              <FileText className="h-4 w-4" /> 草稿箱
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>发布频道</Label>
            <Tabs value={channel} onValueChange={(value) => setChannel(value as FeedChannel)}>
              <TabsList>
                <TabsTrigger value="hot">热门</TabsTrigger>
                <TabsTrigger value="city">同城</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">正文内容</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                if (contentError) {
                  setContentError(null);
                }
              }}
              placeholder="分享此刻想法，支持 #话题# 形式"
              invalid={Boolean(contentError)}
              className="min-h-[180px]"
            />
            <div className="flex items-center justify-between">
              {contentError ? <p className="text-xs text-red-500">{contentError}</p> : <span />}
              <span className={`text-xs ${content.length > 1000 ? "text-red-500" : "text-slate-400"}`}>{content.length}/1000</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="media">媒体上传</Label>
              {previews.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={clearMedia}>
                  移除全部
                </Button>
              ) : null}
            </div>
            <label
              htmlFor="media"
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-sm transition-colors ${
                mediaError
                  ? "border-red-400 bg-red-50 text-red-600 shadow-[0_0_0_3px_rgba(248,113,113,0.2)]"
                  : "border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Upload className="h-4 w-4" />
              上传图片（最多9张）或视频（1个）
            </label>
            <input id="media" type="file" accept="image/*,video/*" multiple className="hidden" onChange={onChangeFiles} />

            {previews.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {previews.map((preview, index) =>
                  preview.type === "video" ? (
                    <video
                      key={`${preview.url}-${index}`}
                      src={preview.url}
                      className="h-32 w-full rounded-lg border border-slate-200 object-cover"
                      controls
                    />
                  ) : (
                    <img
                      key={`${preview.url}-${index}`}
                      src={preview.url}
                      alt="预览"
                      className="h-32 w-full rounded-lg border border-slate-200 object-cover"
                    />
                  )
                )}
              </div>
            ) : (
              <div className="flex gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                  <ImagePlus className="h-3.5 w-3.5" /> 图文
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                  <Video className="h-3.5 w-3.5" /> 视频
                </span>
              </div>
            )}
          </div>

          {mediaError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{mediaError}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">取消</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>放弃本次编辑？</AlertDialogTitle>
                  <AlertDialogDescription>
                    {draftId ? "当前草稿已自动保存，可在草稿箱中继续编辑。" : "未发布内容将不会保存。"}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>继续编辑</AlertDialogCancel>
                  <AlertDialogAction onClick={() => navigate(-1)}>确认放弃</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button onClick={() => void onSubmit()} disabled={submitting}>
              {submitting ? "发布中..." : "立即发布"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
