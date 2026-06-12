import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck, UserRound, BellRing } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import {
  fetchSettingsMe,
  uploadSettingsAvatar,
  updateNotificationPreference,
  updateSettingsPassword,
  updateSettingsProfile
} from "@/api/settings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth-context";
import { parseApiError } from "@/lib/api-error";
import type { NotificationPreferencePayload } from "@/types/models";

const profileSchema = z.object({
  nickname: z.string().trim().min(2, "昵称至少 2 个字符").max(24, "昵称最多 24 个字符"),
  bio: z.string().trim().max(160, "简介最多 160 字")
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z
      .string()
      .min(8, "新密码至少 8 位")
      .max(64, "新密码最多 64 位")
      .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
        message: "新密码需包含字母和数字"
      }),
    confirmPassword: z.string().min(1, "请确认新密码")
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "两次输入的新密码不一致"
      });
    }
    if (value.newPassword === value.currentPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "新密码不能与当前密码相同"
      });
    }
  });

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

const preferenceMeta: Array<{ key: keyof NotificationPreferencePayload; label: string; description: string }> = [
  { key: "notifyLike", label: "点赞通知", description: "有人点赞你的动态时通知你" },
  { key: "notifyComment", label: "评论通知", description: "有人评论你的动态时通知你" },
  { key: "notifyRepost", label: "转发通知", description: "有人转发你的动态时通知你" },
  { key: "notifyFollow", label: "关注通知", description: "有人关注你时通知你" }
];

export default function SettingsPage() {
  const { user, refreshMe } = useAuth();
  const [loading, setLoading] = useState(true);
  const [prefLoadingKey, setPrefLoadingKey] = useState<keyof NotificationPreferencePayload | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [preferences, setPreferences] = useState<NotificationPreferencePayload>({
    notifyLike: true,
    notifyComment: true,
    notifyRepost: true,
    notifyFollow: true
  });
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register: registerProfile,
    handleSubmit: submitProfile,
    reset: resetProfile,
    formState: { errors: profileErrors, isSubmitting: profileSubmitting }
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nickname: "",
      bio: ""
    }
  });

  const {
    register: registerPassword,
    handleSubmit: submitPassword,
    reset: resetPassword,
    formState: { errors: passwordErrors, isSubmitting: passwordSubmitting }
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: ""
    }
  });

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const payload = await fetchSettingsMe();
        resetProfile({
          nickname: payload.profile.nickname,
          bio: payload.profile.bio ?? ""
        });
        setAvatarPreviewUrl(payload.profile.avatarUrl ?? "");
        setPreferences(payload.notifications);
      } catch (error) {
        const parsed = parseApiError(error);
        toast.error(parsed.message || "设置加载失败");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [resetProfile]);

  const onSubmitProfile = async (values: ProfileFormValues) => {
    try {
      const profile = await updateSettingsProfile({
        nickname: values.nickname.trim(),
        bio: values.bio.trim()
      });
      resetProfile({
        nickname: profile.nickname,
        bio: profile.bio ?? ""
      });
      await refreshMe();
      toast.success("资料已更新");
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "资料更新失败");
    }
  };

  const onSubmitPassword = async (values: PasswordFormValues) => {
    try {
      await updateSettingsPassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword
      });
      resetPassword();
      toast.success("密码修改成功");
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "密码修改失败");
    }
  };

  const onTogglePreference = async (key: keyof NotificationPreferencePayload) => {
    if (prefLoadingKey) {
      return;
    }

    const snapshot = preferences;
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    setPrefLoadingKey(key);

    try {
      const payload = await updateNotificationPreference(next);
      setPreferences(payload);
      toast.success("通知偏好已更新");
    } catch (error) {
      setPreferences(snapshot);
      const parsed = parseApiError(error);
      toast.error(parsed.message || "通知设置保存失败");
    } finally {
      setPrefLoadingKey(null);
    }
  };

  const onAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("仅支持图片文件");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("头像图片大小不能超过 5MB");
      event.target.value = "";
      return;
    }

    setAvatarUploading(true);
    try {
      const profile = await uploadSettingsAvatar(file);
      setAvatarPreviewUrl(profile.avatarUrl ?? "");
      await refreshMe();
      toast.success("头像上传成功");
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "头像上传失败");
    } finally {
      setAvatarUploading(false);
      event.target.value = "";
    }
  };

  if (loading) {
    return <main className="mx-auto mt-10 w-full max-w-5xl px-4 text-center text-slate-500">设置加载中...</main>;
  }

  return (
    <main className="mx-auto mt-6 w-full max-w-5xl space-y-4 px-4 pb-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">设置中心</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.nickname ?? "当前用户"} />
            <AvatarFallback>{user?.nickname?.slice(0, 1) ?? "我"}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold text-slate-900">{user?.nickname ?? "当前账号"}</p>
            <p className="text-xs text-slate-500">{user?.email ?? "登录用户"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="h-4 w-4 text-brand-500" /> 资料设置
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void submitProfile(onSubmitProfile)(event)}>
            <div className="space-y-2">
              <Label htmlFor="nickname">昵称</Label>
              <Input id="nickname" invalid={Boolean(profileErrors.nickname)} {...registerProfile("nickname")} />
              {profileErrors.nickname ? <p className="text-xs text-red-500">{profileErrors.nickname.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">简介</Label>
              <Textarea id="bio" invalid={Boolean(profileErrors.bio)} className="min-h-[96px]" {...registerProfile("bio")} />
              {profileErrors.bio ? <p className="text-xs text-red-500">{profileErrors.bio.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>头像图片上传</Label>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={avatarPreviewUrl || user?.avatarUrl || undefined} alt={user?.nickname ?? "头像预览"} />
                  <AvatarFallback>{user?.nickname?.slice(0, 1) ?? "我"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">支持 JPG/PNG/WebP 等格式，单张不超过 5MB。</p>
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={avatarUploading}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      {avatarUploading ? "上传中..." : "上传头像图片"}
                    </Button>
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void onAvatarFileChange(event)} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={profileSubmitting}>
                {profileSubmitting ? "保存中..." : "保存资料"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-brand-500" /> 账号安全
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void submitPassword(onSubmitPassword)(event)}>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">当前密码</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                invalid={Boolean(passwordErrors.currentPassword)}
                {...registerPassword("currentPassword")}
              />
              {passwordErrors.currentPassword ? <p className="text-xs text-red-500">{passwordErrors.currentPassword.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">新密码</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                invalid={Boolean(passwordErrors.newPassword)}
                {...registerPassword("newPassword")}
              />
              {passwordErrors.newPassword ? <p className="text-xs text-red-500">{passwordErrors.newPassword.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认新密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                invalid={Boolean(passwordErrors.confirmPassword)}
                {...registerPassword("confirmPassword")}
              />
              {passwordErrors.confirmPassword ? <p className="text-xs text-red-500">{passwordErrors.confirmPassword.message}</p> : null}
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={passwordSubmitting}>
                {passwordSubmitting ? "提交中..." : "修改密码"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4 text-brand-500" /> 通知偏好
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {preferenceMeta.map((item) => {
            const active = preferences[item.key];
            const loadingCurrent = prefLoadingKey === item.key;
            return (
              <div key={item.key} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.description}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={active ? "default" : "secondary"}
                  aria-pressed={active}
                  disabled={Boolean(prefLoadingKey)}
                  onClick={() => void onTogglePreference(item.key)}
                >
                  {loadingCurrent ? "保存中..." : active ? "已开启" : "已关闭"}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
