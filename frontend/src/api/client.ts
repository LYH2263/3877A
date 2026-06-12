import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import { API_BASE_URL } from "@/config";
import { emitAuthEvent } from "@/lib/auth-events";

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

function isAuthEndpoint(url?: string) {
  if (!url) {
    return false;
  }

  return ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"].some((endpoint) => url.includes(endpoint));
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
});

let refreshPromise: Promise<void> | null = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post("/auth/refresh")
      .then(() => undefined)
      .catch((error) => {
        emitAuthEvent("session-expired");
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;

    if (!originalRequest || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isAuthEndpoint(originalRequest.url)) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      await refreshAccessToken();
      return apiClient(originalRequest);
    } catch {
      return Promise.reject(error);
    }
  }
);
