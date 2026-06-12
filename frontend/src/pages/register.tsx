import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";

const registerSchema = z
  .object({
    nickname: z.string().min(2, "昵称至少 2 个字符").max(20, "昵称最多 20 个字符"),
    email: z.string().email("请输入有效邮箱地址"),
    password: z.string().min(6, "密码至少 6 位"),
    confirmPassword: z.string().min(6, "请再次输入密码")
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "两次密码输入不一致"
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register: registerUser, user } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      nickname: "",
      email: "",
      password: "",
      confirmPassword: ""
    }
  });

  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [navigate, user]);

  const onSubmit = async (values: RegisterFormValues) => {
    try {
      await registerUser({
        nickname: values.nickname,
        email: values.email,
        password: values.password
      });
      navigate("/", { replace: true });
    } catch {
      // error handled in auth context
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-var(--top-nav-height))] w-full max-w-6xl items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-xl">创建账号</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
            <div className="space-y-2">
              <Label htmlFor="nickname">昵称</Label>
              <Input id="nickname" placeholder="请输入昵称" invalid={Boolean(errors.nickname)} {...register("nickname")} />
              {errors.nickname ? <p className="text-xs text-red-500">{errors.nickname.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input id="email" placeholder="you@example.com" invalid={Boolean(errors.email)} {...register("email")} />
              {errors.email ? <p className="text-xs text-red-500">{errors.email.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" placeholder="至少 6 位" invalid={Boolean(errors.password)} {...register("password")} />
              {errors.password ? <p className="text-xs text-red-500">{errors.password.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="请再次输入密码"
                invalid={Boolean(errors.confirmPassword)}
                {...register("confirmPassword")}
              />
              {errors.confirmPassword ? <p className="text-xs text-red-500">{errors.confirmPassword.message}</p> : null}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "注册中..." : "注册并登录"}
            </Button>

            <p className="text-center text-sm text-slate-500">
              已有账号？
              <Link className="ml-1 text-link-500 hover:text-link-600" to="/login">
                立即登录
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
