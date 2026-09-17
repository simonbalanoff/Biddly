import type { Session } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/v1";
const SESSION_KEY = "biddly.session";

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export function getStoredSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function setStoredSession(session: Session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("biddly-session"));
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("biddly-session"));
}

let refreshPromise: Promise<Session | null> | null = null;
let accessChangePending = false;
const suspendedRequest = new Promise<never>(() => {});

async function parseResponse(response: Response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

async function refreshSession() {
  const current = getStoredSession();
  if (!current?.refreshToken) return null;
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken })
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const session = (await response.json()) as Session;
        setStoredSession(session);
        return session;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const session = getStoredSession();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (response.status === 401 && retry && session?.refreshToken) {
    const refreshed = await refreshSession();
    if (refreshed) return apiRequest<T>(path, init, false);
    clearStoredSession();
  }

  const payload = await parseResponse(response);
  if (!response.ok) {
    const suspension =
      path !== "/me/context" &&
      response.status === 403 &&
      payload &&
      typeof payload === "object" &&
      "code" in payload &&
      ["CHAPTER_SUSPENDED", "ORGANIZATION_SUSPENDED", "UNIVERSITY_SUSPENDED"].includes(String((payload as { code: unknown }).code));

    if (suspension && typeof window !== "undefined") {
      if (!accessChangePending) {
        accessChangePending = true;
        window.dispatchEvent(new Event("biddly-access-changed"));
        window.setTimeout(() => {
          accessChangePending = false;
        }, 1500);
      }
      return suspendedRequest;
    }

    const subscriptionCode =
      response.status === 402 &&
      payload &&
      typeof payload === "object" &&
      "code" in payload
        ? String((payload as { code: unknown }).code)
        : null;

    if ((subscriptionCode === "SUBSCRIPTION_REQUIRED" || subscriptionCode === "SUBSCRIPTION_READ_ONLY") && typeof window !== "undefined") {
      if (!accessChangePending) {
        accessChangePending = true;
        window.dispatchEvent(new Event("biddly-access-changed"));
        window.setTimeout(() => {
          accessChangePending = false;
        }, 1500);
      }
      if (subscriptionCode === "SUBSCRIPTION_REQUIRED") return suspendedRequest;
    }

    const message = payload && typeof payload === "object" && "error" in payload ? String((payload as { error: unknown }).error) : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

export async function publicApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, cache: "no-store" });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload ? String((payload as { error: unknown }).error) : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

export async function downloadCsv(path: string, filename: string) {
  let session = getStoredSession();
  if (!session) throw new ApiError("You are not signed in", 401, null);

  let response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store"
  });

  if (response.status === 401) {
    session = await refreshSession();
    if (!session) {
      clearStoredSession();
      throw new ApiError("Your session has expired", 401, null);
    }
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store"
    });
  }

  if (!response.ok) {
    const payload = await parseResponse(response);
    const message = payload && typeof payload === "object" && "error" in payload ? String((payload as { error: unknown }).error) : "Export failed";
    throw new ApiError(message, response.status, payload);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
