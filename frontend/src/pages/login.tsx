import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";

const loginSchema = z.object({
  email: z.string().email("请输入有效邮箱地址"),
  password: z.string().min(6, "密码至少 6 位")
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, user } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [from, navigate, user]);

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await login(values);
      navigate(from, { replace: true });
    } catch {
      // error handled in auth context
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-var(--top-nav-height))] w-full max-w-6xl items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-xl">登录账号</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input id="email" placeholder="you@example.com" invalid={Boolean(errors.email)} {...register("email")} />
              {errors.email ? <p className="text-xs text-red-500">{errors.email.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" placeholder="请输入密码" invalid={Boolean(errors.password)} {...register("password")} />
              {errors.password ? <p className="text-xs text-red-500">{errors.password.message}</p> : null}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "登录中..." : "登录"}
            </Button>

            <p className="text-center text-sm text-slate-500">
              还没有账号？
              <Link className="ml-1 text-link-500 hover:text-link-600" to="/register">
                立即注册
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
