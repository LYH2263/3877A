import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { toast } from "sonner";

import { getMe, login as apiLogin, logout as apiLogout, register as apiRegister, type LoginInput, type RegisterInput } from "@/api/auth";
import { subscribeAuthEvent } from "@/lib/auth-events";
import { parseApiError } from "@/lib/api-error";
import type { User } from "@/types/models";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const payload = await getMe();
      setUser(payload.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshMe().finally(() => setLoading(false));
  }, [refreshMe]);

  useEffect(() => {
    return subscribeAuthEvent((event) => {
      if (event === "session-expired") {
        setUser(null);
      }
    });
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    try {
      const payload = await apiLogin(input);
      setUser(payload.user);
      toast.success("登录成功，欢迎回来");
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "登录失败，请稍后重试");
      throw error;
    }
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    try {
      const payload = await apiRegister(input);
      setUser(payload.user);
      toast.success("注册成功，已自动登录");
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "注册失败，请稍后重试");
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
      setUser(null);
      toast.success("已退出登录");
    } catch (error) {
      const parsed = parseApiError(error);
      toast.error(parsed.message || "退出失败，请稍后重试");
      throw error;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      refreshMe
    }),
    [user, loading, login, register, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
