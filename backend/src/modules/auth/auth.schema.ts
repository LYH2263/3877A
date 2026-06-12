import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(6, "密码至少 6 位"),
  nickname: z.string().min(2, "昵称至少 2 位").max(20, "昵称最多 20 位")
});

export const loginSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(6, "密码至少 6 位")
});
