"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, type AuthUser } from "@/utils/api";

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  registerWithPassword: (name: string, email: string, password: string) => Promise<{ email: string; devCode?: string }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<{ email: string; devCode?: string }>;
  updateProfile: (payload: {
    name?: string;
    email?: string;
    company?: string;
    bio?: string;
    current_password?: string;
    new_password?: string;
  }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function clearLegacyAuth() {
  localStorage.removeItem("vibe_auth_token");
  localStorage.removeItem("vibe_access_key");
  localStorage.removeItem("vibe_user_login");
}

async function parseAuthError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof data.detail === "string" ? data.detail : data.detail?.[0]?.msg || "auth_failed";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/auth/me");
      if (!res.ok) {
        clearLegacyAuth();
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data.user || null);
      localStorage.removeItem("vibe_auth_token");
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const res = await apiFetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken }),
    });
    if (!res.ok) throw new Error(await parseAuthError(res));
    const data = await res.json();
    clearLegacyAuth();
    setUser(data.user);
    setReady(true);
  }, []);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(await parseAuthError(res));
    const data = await res.json();
    clearLegacyAuth();
    setUser(data.user);
    setReady(true);
  }, []);

  const registerWithPassword = useCallback(async (name: string, email: string, password: string) => {
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) throw new Error(await parseAuthError(res));
    const data = await res.json();
    return { email: data.email as string, devCode: data.dev_code as string | undefined };
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const res = await apiFetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) throw new Error(await parseAuthError(res));
    const data = await res.json();
    clearLegacyAuth();
    setUser(data.user);
    setReady(true);
  }, []);

  const resendCode = useCallback(async (email: string) => {
    const res = await apiFetch("/api/auth/resend-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error(await parseAuthError(res));
    const data = await res.json();
    return { email: data.email as string, devCode: data.dev_code as string | undefined };
  }, []);

  const updateProfile = useCallback(async (payload: {
    name?: string;
    email?: string;
    company?: string;
    bio?: string;
    current_password?: string;
    new_password?: string;
  }) => {
    const res = await apiFetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseAuthError(res));
    const data = await res.json();
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    clearLegacyAuth();
    setUser(null);
    void apiFetch("/api/auth/logout", { method: "POST" });
  }, []);

  const value = useMemo(
    () => ({ user, ready, loginWithGoogle, loginWithPassword, registerWithPassword, verifyEmail, resendCode, updateProfile, logout, refresh }),
    [user, ready, loginWithGoogle, loginWithPassword, registerWithPassword, verifyEmail, resendCode, updateProfile, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
