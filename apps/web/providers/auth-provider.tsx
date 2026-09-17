"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiRequest, clearStoredSession, getStoredSession, publicApiRequest, setStoredSession } from "../lib/api";
import type { MeContext, Session } from "../lib/types";

type AuthContextValue = {
  context: MeContext | null;
  loading: boolean;
  signedIn: boolean;
  login: (email: string, password: string) => Promise<MeContext>;
  logout: () => Promise<void>;
  refreshContext: () => Promise<MeContext | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<MeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshContextPromise = useRef<Promise<MeContext | null> | null>(null);

  const refreshContext = useCallback(async () => {
    if (!getStoredSession()) {
      setContext(null);
      return null;
    }

    if (refreshContextPromise.current) {
      return refreshContextPromise.current;
    }

    const request = (async () => {
      try {
        const next = await apiRequest<MeContext>("/me/context");
        setContext(next);
        return next;
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          clearStoredSession();
          setContext(null);
        }
        return null;
      }
    })();

    refreshContextPromise.current = request;

    try {
      return await request;
    } finally {
      if (refreshContextPromise.current === request) {
        refreshContextPromise.current = null;
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    const boot = async () => {
      if (!getStoredSession()) {
        if (active) setLoading(false);
        return;
      }

      await refreshContext();
      if (active) setLoading(false);
    };

    void boot();

    const sessionListener = () => {
      if (!getStoredSession()) setContext(null);
    };

    const accessListener = () => {
      void refreshContext();
    };

    window.addEventListener("biddly-session", sessionListener);
    window.addEventListener("biddly-access-changed", accessListener);

    return () => {
      active = false;
      window.removeEventListener("biddly-session", sessionListener);
      window.removeEventListener("biddly-access-changed", accessListener);
    };
  }, [refreshContext]);

  const login = useCallback(async (email: string, password: string) => {
    const session = await publicApiRequest<Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setStoredSession(session);
    const next = await apiRequest<MeContext>("/me/context");
    setContext(next);
    return next;
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
