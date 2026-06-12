import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileText, Image as ImageIcon, Trash2, Upload, Video } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { deleteDraft, fetchDrafts, publishDraft } from "@/api/drafts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Badge } from "@/components/ui/badge";
import { parseApiError } from "@/lib/api-error";
import { formatRelativeTime } from "@/lib/format";
import type { DraftListItem } from "@/types/models";

function getSummary(content: string, maxLen = 60): string {
  const trimmed = content.trim();
  if (!trimmed) return "（无内容）";
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen) + "...";
}

export default function DraftsPage() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<DraftListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDrafts();
      setDrafts(data);
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "加载草稿失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const handleEdit = (draft: DraftListItem) => {
    navigate(`/compose?draftId=${draft.id}`);
  };

  const handlePublish = async (draft: DraftListItem) => {
    if (draft.content.trim().length < 3) {
      toast.error("正文至少 3 个字符才能发布");
      return;
    }
    setPublishingId(draft.id);
    try {
      await publishDraft(draft.id);
      toast.success("发布成功");
      setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draft.id) : prev));
      navigate("/");
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "发布失败");
    } finally {
      setPublishingId(null);
    }
  };

  const handleDelete = async (draftId: number) => {
    setDeletingId(draftId);
    try {
      await deleteDraft(draftId);
      toast.success("草稿已删除");
      setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draftId) : prev));
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="mx-auto mt-6 w-full max-w-6xl px-4 pb-12">
      <Card className="mx-auto w-full max-w-3xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="返回">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> 草稿箱
              {drafts ? <Badge variant="secondary">{drafts.length}</Badge> : null}
            </CardTitle>
          </div>
          <Button onClick={() => navigate("/compose")}>
            <Upload className="h-4 w-4" /> 新建动态
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : drafts === null || drafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
              <FileText className="h-12 w-12 text-slate-300" />
              <p className="text-sm">暂无草稿</p>
              <p className="text-xs text-slate-400">在发布页编辑的内容会自动保存到这里</p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/compose">去发布动态</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="group relative rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex gap-4">
                    {draft.mediaCount > 0 ? (
                      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {draft.media[0] ? (
                          draft.media[0].type === "video" ? (
                            <div className="flex h-full w-full items-center justify-center">
                              <Video className="h-8 w-8 text-slate-400" />
                            </div>
                          ) : (
                            <img src={draft.media[0].url} alt="" className="h-full w-full object-cover" />
                          )
                        ) : (
                          <ImageIcon className="h-full w-full p-4 text-slate-300" />
                        )}
                        {draft.mediaCount > 1 ? (
                          <span className="absolute bottom-1 right-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                            {draft.mediaCount}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg bg-slate-50">
                        <FileText className="h-8 w-8 text-slate-300" />
                      </div>
                    )}

                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 flex-1 text-sm text-slate-800">{getSummary(draft.content)}</p>
                      </div>
                      <div className="mt-auto flex items-center justify-between pt-3">
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span>{formatRelativeTime(draft.updatedAt)}</span>
                          <Badge variant="outline">{draft.channel === "hot" ? "热门" : "同城"}</Badge>
                          {draft.mediaCount > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <ImageIcon className="h-3 w-3" />
                              {draft.mediaCount} 个附件
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(draft)}>
                            继续编辑
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            disabled={publishingId === draft.id || draft.content.trim().length < 3}
                            onClick={() => void handlePublish(draft)}
                          >
                            {publishingId === draft.id ? "发布中..." : "一键发布"}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-500">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>删除这个草稿？</AlertDialogTitle>
                                <AlertDialogDescription>删除后无法恢复，请确认。</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-500 hover:bg-red-600"
                                  onClick={() => void handleDelete(draft.id)}
                                  disabled={deletingId === draft.id}
                                >
                                  {deletingId === draft.id ? "删除中..." : "确认删除"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
