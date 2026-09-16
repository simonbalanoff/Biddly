"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest, clearStoredSession, getStoredSession, publicApiRequest, setStoredSession } from "../lib/api";
import type { MeContext, Session } from "../lib/types";

type AuthContextValue = {
  context: MeContext | null;
  loading: boolean;
  signedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshContext: () => Promise<MeContext | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<MeContext | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshContext = useCallback(async () => {
    if (!getStoredSession()) {
      setContext(null);
      return null;
    }
    try {
      const next = await apiRequest<MeContext>("/me/context");
      setContext(next);
      return next;
    } catch {
      setContext(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      if (!getStoredSession()) {
        if (active) setLoading(false);
        return;
      }
      try {
        const next = await apiRequest<MeContext>("/me/context");
        if (active) setContext(next);
      } catch {
        if (active) setContext(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    void boot();
    const listener = () => {
      if (!getStoredSession()) setContext(null);
    };
    window.addEventListener("biddly-session", listener);
    return () => {
      active = false;
      window.removeEventListener("biddly-session", listener);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await publicApiRequest<Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setStoredSession(session);
    const next = await apiRequest<MeContext>("/me/context");
    setContext(next);
  }, []);

  const logout = useCallback(async () => {
    const session = getStoredSession();
    if (session?.refreshToken) {
      try {
        await publicApiRequest("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken: session.refreshToken })
        });
      } catch {}
    }
    clearStoredSession();
    setContext(null);
  }, []);

  const value = useMemo(
    () => ({ context, loading, signedIn: Boolean(context), login, logout, refreshContext }),
    [context, loading, login, logout, refreshContext]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
