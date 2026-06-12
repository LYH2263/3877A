import { apiClient } from "@/api/client";
import type { ApiResponse, NotificationPreferencePayload, SettingsProfilePayload } from "@/types/models";

export interface UpdateSettingsProfileInput {
  nickname?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface UpdatePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export async function fetchSettingsMe(): Promise<SettingsProfilePayload> {
  const { data } = await apiClient.get<ApiResponse<SettingsProfilePayload>>("/settings/me");
  return data.data;
}

export async function updateSettingsProfile(input: UpdateSettingsProfileInput): Promise<SettingsProfilePayload["profile"]> {
  const { data } = await apiClient.patch<ApiResponse<{ profile: SettingsProfilePayload["profile"] }>>("/settings/profile", input);
  return data.data.profile;
}

export async function updateSettingsPassword(input: UpdatePasswordInput): Promise<void> {
  await apiClient.post("/settings/password", input);
}

export async function updateNotificationPreference(input: NotificationPreferencePayload): Promise<NotificationPreferencePayload> {
  const { data } = await apiClient.patch<ApiResponse<NotificationPreferencePayload>>("/settings/notifications", input);
  return data.data;
}

export async function uploadSettingsAvatar(file: File): Promise<SettingsProfilePayload["profile"]> {
  const formData = new FormData();
  formData.append("avatar", file);

  const { data } = await apiClient.post<ApiResponse<{ profile: SettingsProfilePayload["profile"] }>>("/settings/avatar", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });

  return data.data.profile;
}
