import { env } from "./env.js";

export type EmailDelivery = {
  configured: boolean;
  sent: boolean;
  id: string | null;
  error: string | null;
};

export function emailConfigured() {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendEmail(input: { to: string; subject: string; title: string; copy: string; actionLabel: string; actionUrl: string }): Promise<EmailDelivery> {
  if (!emailConfigured()) {
    return { configured: false, sent: false, id: null, error: null };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        text: `${input.title}\n\n${input.copy}\n\n${input.actionLabel}: ${input.actionUrl}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px"><h1 style="font-size:24px">${escapeHtml(input.title)}</h1><p style="line-height:1.6;color:#475467">${escapeHtml(input.copy)}</p><p style="margin-top:28px"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:600">${escapeHtml(input.actionLabel)}</a></p><p style="margin-top:28px;color:#98a2b3;font-size:12px">If the button does not work, open ${escapeHtml(input.actionUrl)}</p></div>`
      })
    });

    const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
    if (!response.ok) {
      return { configured: true, sent: false, id: null, error: payload?.message ?? `Email provider returned ${response.status}` };
    }

    return { configured: true, sent: true, id: payload?.id ?? null, error: null };
  } catch (error) {
    return { configured: true, sent: false, id: null, error: error instanceof Error ? error.message : "Email delivery failed" };
  }
}
