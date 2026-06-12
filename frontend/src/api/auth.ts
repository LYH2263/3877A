import { apiClient } from "@/api/client";
import type { ApiResponse, AuthPayload } from "@/types/models";

export interface RegisterInput {
  email: string;
  password: string;
  nickname: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function register(payload: RegisterInput): Promise<AuthPayload> {
  const { data } = await apiClient.post<ApiResponse<AuthPayload>>("/auth/register", payload);
  return data.data;
}

export async function login(payload: LoginInput): Promise<AuthPayload> {
  const { data } = await apiClient.post<ApiResponse<AuthPayload>>("/auth/login", payload);
  return data.data;
}

export async function getMe(): Promise<AuthPayload> {
  const { data } = await apiClient.get<ApiResponse<AuthPayload>>("/auth/me");
  return data.data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout");
}
