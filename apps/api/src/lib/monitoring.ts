import { env } from "./env.js";

const state = {
  requests: 0,
  errors: 0,
  totalDurationMs: 0,
  status4xx: 0,
  status5xx: 0,
  startedAt: Date.now()
};

export function recordRequest(statusCode: number, durationMs: number) {
  state.requests += 1;
  state.totalDurationMs += Math.max(0, durationMs);
  if (statusCode >= 400 && statusCode < 500) state.status4xx += 1;
  if (statusCode >= 500) {
    state.status5xx += 1;
    state.errors += 1;
  }
}

export function monitoringSnapshot() {
  return {
    requests: state.requests,
    errors: state.errors,
    status4xx: state.status4xx,
    status5xx: state.status5xx,
    averageDurationMs: state.requests ? Math.round((state.totalDurationMs / state.requests) * 10) / 10 : 0,
    uptimeSeconds: Math.floor((Date.now() - state.startedAt) / 1000)
  };
}

export async function reportError(input: { requestId: string; method: string; path: string; statusCode: number; message: string }) {
  if (!env.ERROR_REPORT_WEBHOOK_URL) return;
  try {
    await fetch(env.ERROR_REPORT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "biddly-api", environment: env.NODE_ENV, ...input, timestamp: new Date().toISOString() })
    });
  } catch {}
}
