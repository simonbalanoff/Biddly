import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@biddly/db";
import { env } from "./env.js";

export type BillingTerm = "SEMESTER" | "ACADEMIC_YEAR";
export type StripeRecord = Record<string, any>;

export type StripePlan = {
  term: BillingTerm;
  priceId: string;
  active: boolean;
  currency: string;
  unitAmount: number | null;
  interval: string | null;
  intervalCount: number | null;
  nickname: string | null;
  productId: string | null;
};

export type StripeSubscriptionSnapshot = {
  id: string;
  customerId: string | null;
  providerStatus: string;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  term: BillingTerm;
  periodStart: Date;
  periodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  trialEnd: Date | null;
  priceId: string | null;
  subscriptionItemId: string | null;
  currency: string | null;
  unitAmount: number | null;
  billingInterval: string | null;
  latestInvoiceId: string | null;
  livemode: boolean;
};

export function stripeConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_SEMESTER && env.STRIPE_PRICE_ACADEMIC_YEAR);
}

export function stripeDashboardMode() {
  return env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? "test" : "live";
}

export function stripeDashboardUrl(kind: "customer" | "subscription" | "invoice", id: string) {
  const base = stripeDashboardMode() === "test" ? "https://dashboard.stripe.com/test" : "https://dashboard.stripe.com";
  if (kind === "customer") return `${base}/customers/${encodeURIComponent(id)}`;
  if (kind === "subscription") return `${base}/subscriptions/${encodeURIComponent(id)}`;
  return `${base}/invoices/${encodeURIComponent(id)}`;
}

export async function stripeRequest<T>(path: string, init: { method?: string; body?: URLSearchParams; query?: URLSearchParams } = {}) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  const query = init.query?.toString();
  const url = `https://api.stripe.com/v1${path}${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(env.STRIPE_API_VERSION ? { "Stripe-Version": env.STRIPE_API_VERSION } : {}),
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body: init.body?.toString()
  });
  const payload = await response.json().catch(() => null) as T & { error?: { message?: string; type?: string; code?: string } };
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `Stripe returned ${response.status}`) as Error & { statusCode?: number; stripeCode?: string };
    error.statusCode = response.status;
    error.stripeCode = payload?.error?.code;
    throw error;
  }
  return payload;
}

function timestamp(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function nullableDate(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? new Date(numeric * 1000) : null;
}

function objectId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  return null;
}

function firstSubscriptionItem(subscription: StripeRecord) {
  const data = subscription.items?.data;
  return Array.isArray(data) && data.length ? asRecord(data[0]) : {};
}

function priceFromItem(item: StripeRecord) {
  return asRecord(item.price);
}

export function asRecord(value: unknown): StripeRecord {
  return value && typeof value === "object" ? value as StripeRecord : {};
}

export function mapStripeStatus(status: string) {
  if (status === "trialing") return "TRIAL" as const;
  if (status === "active") return "ACTIVE" as const;
  if (["past_due", "unpaid", "incomplete", "paused"].includes(status)) return "PAST_DUE" as const;
  if (status === "canceled") return "CANCELED" as const;
  return "EXPIRED" as const;
}

export function termFromPriceId(priceId: string | null, metadataTerm?: unknown): BillingTerm {
  if (priceId && priceId === env.STRIPE_PRICE_ACADEMIC_YEAR) return "ACADEMIC_YEAR";
  if (priceId && priceId === env.STRIPE_PRICE_SEMESTER) return "SEMESTER";
  return metadataTerm === "ACADEMIC_YEAR" ? "ACADEMIC_YEAR" : "SEMESTER";
}

export function subscriptionSnapshot(subscription: StripeRecord): StripeSubscriptionSnapshot {
  const item = firstSubscriptionItem(subscription);
  const price = priceFromItem(item);
  const priceId = objectId(item.price) ?? objectId(item.plan);
  const now = Math.floor(Date.now() / 1000);
  const periodStart = timestamp(item.current_period_start ?? subscription.current_period_start, now);
  const periodEnd = timestamp(item.current_period_end ?? subscription.current_period_end, periodStart + 30 * 24 * 60 * 60);
  const metadata = asRecord(subscription.metadata);
  return {
    id: String(subscription.id ?? ""),
    customerId: objectId(subscription.customer),
    providerStatus: String(subscription.status ?? "unknown"),
    status: mapStripeStatus(String(subscription.status ?? "unknown")),
    term: termFromPriceId(priceId, metadata.term),
    periodStart: new Date(periodStart * 1000),
    periodEnd: new Date(periodEnd * 1000),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    canceledAt: nullableDate(subscription.canceled_at),
    trialEnd: nullableDate(subscription.trial_end),
    priceId,
    subscriptionItemId: typeof item.id === "string" ? item.id : null,
    currency: typeof price.currency === "string" ? price.currency : typeof subscription.currency === "string" ? subscription.currency : null,
    unitAmount: Number.isFinite(Number(price.unit_amount)) ? Number(price.unit_amount) : null,
    billingInterval: typeof price.recurring?.interval === "string" ? price.recurring.interval : typeof item.plan?.interval === "string" ? item.plan.interval : null,
    latestInvoiceId: objectId(subscription.latest_invoice),
    livemode: Boolean(subscription.livemode)
  };
}

export async function syncStripeSubscriptionRecord(subscription: StripeRecord, invoice?: StripeRecord | null) {
  const snapshot = subscriptionSnapshot(subscription);
  if (!snapshot.id) return null;
  const metadata = asRecord(subscription.metadata);
  let chapterId = typeof metadata.chapterId === "string" ? metadata.chapterId : null;
  if (!chapterId && snapshot.customerId) {
    chapterId = (await prisma.chapter.findFirst({ where: { billingCustomerId: snapshot.customerId }, select: { id: true } }))?.id ?? null;
  }
  if (!chapterId) return null;

  const latestInvoiceId = invoice ? objectId(invoice.id) : snapshot.latestInvoiceId;
  const latestInvoiceStatus = invoice && typeof invoice.status === "string" ? invoice.status : undefined;
  const data = {
    chapterId,
    term: snapshot.term,
    status: snapshot.status,
    periodStart: snapshot.periodStart,
    periodEnd: snapshot.periodEnd,
    provider: "stripe",
    providerCustomerId: snapshot.customerId,
    providerSubscriptionId: snapshot.id,
    providerStatus: snapshot.providerStatus,
    providerPriceId: snapshot.priceId,
    providerSubscriptionItemId: snapshot.subscriptionItemId,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    canceledAt: snapshot.canceledAt,
    trialEnd: snapshot.trialEnd,
    currency: snapshot.currency,
    unitAmount: snapshot.unitAmount,
    billingInterval: snapshot.billingInterval,
    latestInvoiceId,
    ...(latestInvoiceStatus !== undefined ? { latestInvoiceStatus } : {}),
    livemode: snapshot.livemode,
    lastSyncedAt: new Date()
  };

  const existing = await prisma.chapterSubscription.findFirst({ where: { providerSubscriptionId: snapshot.id } });
  const record = existing
    ? await prisma.chapterSubscription.update({ where: { id: existing.id }, data })
    : await prisma.chapterSubscription.create({ data });

  if (snapshot.customerId) {
    await prisma.chapter.update({ where: { id: chapterId }, data: { billingCustomerId: snapshot.customerId } });
  }
  return record;
}

export function subscriptionIdFromInvoice(invoice: StripeRecord) {
  const direct = objectId(invoice.subscription);
  if (direct) return direct;
  const parent = asRecord(invoice.parent);
  const details = asRecord(parent.subscription_details);
  return objectId(details.subscription);
}

export async function syncStripeInvoice(invoice: StripeRecord) {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return null;
  const subscription = await retrieveStripeSubscription(subscriptionId);
  return syncStripeSubscriptionRecord(subscription, invoice);
}

export async function syncChapterFromStripe(chapterId: string) {
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { id: true, billingCustomerId: true } });
  if (!chapter?.billingCustomerId) return { customerId: null, subscriptions: [] as any[] };
  const subscriptions = await listStripeSubscriptions(chapter.billingCustomerId);
  const synced = [];
  for (const subscription of subscriptions.data ?? []) {
    const record = await syncStripeSubscriptionRecord(asRecord(subscription));
    if (record) synced.push(record);
  }
  return { customerId: chapter.billingCustomerId, subscriptions: synced };
}

export async function createStripeCustomer(input: { email: string; name: string; chapterId: string }) {
  const body = new URLSearchParams();
  body.set("email", input.email);
  body.set("name", input.name);
  body.set("metadata[chapterId]", input.chapterId);
  body.set("metadata[workspace]", input.name);
  return stripeRequest<StripeRecord>("/customers", { method: "POST", body });
}

export async function updateStripeCustomer(customerId: string, input: { email?: string; name?: string; chapterId?: string }) {
  const body = new URLSearchParams();
  if (input.email) body.set("email", input.email);
  if (input.name) body.set("name", input.name);
  if (input.chapterId) body.set("metadata[chapterId]", input.chapterId);
  return stripeRequest<StripeRecord>(`/customers/${encodeURIComponent(customerId)}`, { method: "POST", body });
}

export async function retrieveStripeCustomer(customerId: string) {
  return stripeRequest<StripeRecord>(`/customers/${encodeURIComponent(customerId)}`);
}

export async function retrieveStripePrice(priceId: string) {
  return stripeRequest<StripeRecord>(`/prices/${encodeURIComponent(priceId)}`);
}

export async function getStripePlans(): Promise<StripePlan[]> {
  const plans: Array<{ term: BillingTerm; priceId?: string }> = [
    { term: "SEMESTER", priceId: env.STRIPE_PRICE_SEMESTER },
    { term: "ACADEMIC_YEAR", priceId: env.STRIPE_PRICE_ACADEMIC_YEAR }
  ];
  const results: StripePlan[] = [];
  for (const plan of plans) {
    if (!plan.priceId) continue;
    const price = await retrieveStripePrice(plan.priceId);
    results.push({
      term: plan.term,
      priceId: plan.priceId,
      active: Boolean(price.active),
      currency: typeof price.currency === "string" ? price.currency : "usd",
      unitAmount: Number.isFinite(Number(price.unit_amount)) ? Number(price.unit_amount) : null,
      interval: typeof price.recurring?.interval === "string" ? price.recurring.interval : null,
      intervalCount: Number.isFinite(Number(price.recurring?.interval_count)) ? Number(price.recurring.interval_count) : null,
      nickname: typeof price.nickname === "string" ? price.nickname : null,
      productId: objectId(price.product)
    });
  }
  return results;
}

export async function listStripeSubscriptions(customerId: string) {
  const query = new URLSearchParams();
  query.set("customer", customerId);
  query.set("status", "all");
  query.set("limit", "20");
  return stripeRequest<{ data: StripeRecord[]; has_more: boolean }>("/subscriptions", { query });
}

export async function retrieveStripeSubscription(subscriptionId: string) {
  return stripeRequest<StripeRecord>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export async function listStripeInvoices(customerId: string, limit = 12) {
  const query = new URLSearchParams();
  query.set("customer", customerId);
  query.set("limit", String(Math.max(1, Math.min(limit, 100))));
  return stripeRequest<{ data: StripeRecord[]; has_more: boolean }>("/invoices", { query });
}

export async function createStripeCheckout(input: { customerId: string; chapterId: string; term: BillingTerm }) {
  const priceId = input.term === "SEMESTER" ? env.STRIPE_PRICE_SEMESTER : env.STRIPE_PRICE_ACADEMIC_YEAR;
  if (!priceId) throw new Error("Stripe price is not configured");
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("customer", input.customerId);
  body.set("client_reference_id", input.chapterId);
  body.set("line_items[0][price]", priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("allow_promotion_codes", "true");
  body.set("billing_address_collection", "auto");
  body.set("customer_update[name]", "auto");
  body.set("customer_update[address]", "auto");
  body.set("success_url", `${env.APP_BASE_URL}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  body.set("cancel_url", `${env.APP_BASE_URL}/billing?checkout=cancelled`);
  body.set("metadata[chapterId]", input.chapterId);
  body.set("metadata[term]", input.term);
  body.set("subscription_data[metadata][chapterId]", input.chapterId);
  body.set("subscription_data[metadata][term]", input.term);
  return stripeRequest<{ id: string; url: string | null }>("/checkout/sessions", { method: "POST", body });
}

export async function createStripePortal(input: { customerId: string }) {
  const body = new URLSearchParams();
  body.set("customer", input.customerId);
  body.set("return_url", `${env.APP_BASE_URL}/billing`);
  if (env.STRIPE_PORTAL_CONFIGURATION_ID) body.set("configuration", env.STRIPE_PORTAL_CONFIGURATION_ID);
  return stripeRequest<{ id: string; url: string }>("/billing_portal/sessions", { method: "POST", body });
}

export async function updateStripeSubscription(subscriptionId: string, body: URLSearchParams) {
  return stripeRequest<StripeRecord>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "POST", body });
}

export async function scheduleStripeCancellation(subscriptionId: string) {
  const body = new URLSearchParams();
  body.set("cancel_at_period_end", "true");
  return updateStripeSubscription(subscriptionId, body);
}

export async function resumeStripeSubscription(subscriptionId: string) {
  const body = new URLSearchParams();
  body.set("cancel_at_period_end", "false");
  return updateStripeSubscription(subscriptionId, body);
}

export async function cancelStripeSubscriptionNow(subscriptionId: string) {
  return stripeRequest<StripeRecord>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
}

export async function changeStripeSubscriptionPlan(subscriptionId: string, term: BillingTerm) {
  const subscription = await retrieveStripeSubscription(subscriptionId);
  const item = firstSubscriptionItem(subscription);
  const itemId = typeof item.id === "string" ? item.id : null;
  const priceId = term === "SEMESTER" ? env.STRIPE_PRICE_SEMESTER : env.STRIPE_PRICE_ACADEMIC_YEAR;
  if (!itemId || !priceId) throw new Error("Stripe subscription price is not available");
  const currentPriceId = objectId(item.price) ?? objectId(item.plan);
  if (currentPriceId === priceId) return subscription;
  const body = new URLSearchParams();
  body.set("items[0][id]", itemId);
  body.set("items[0][price]", priceId);
  body.set("metadata[term]", term);
  body.set("proration_behavior", "none");
  body.set("payment_behavior", "allow_incomplete");
  return updateStripeSubscription(subscriptionId, body);
}

export async function retrieveCheckoutSession(sessionId: string) {
  return stripeRequest<StripeRecord>(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
}

export function verifyStripeSignature(rawBody: string, signatureHeader: string) {
  if (!env.STRIPE_WEBHOOK_SECRET) return false;
  const parts = signatureHeader.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || !signatures.length) return false;
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp) || Math.abs(Date.now() / 1000 - numericTimestamp) > 300) return false;
  const expected = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return signatures.some((signature) => {
    try {
      const received = Buffer.from(signature, "hex");
      return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
    } catch {
      return false;
    }
  });
}

export function summarizeInvoice(invoice: StripeRecord) {
  return {
    id: String(invoice.id ?? ""),
    number: typeof invoice.number === "string" ? invoice.number : null,
    status: typeof invoice.status === "string" ? invoice.status : "unknown",
    amountDue: Number.isFinite(Number(invoice.amount_due)) ? Number(invoice.amount_due) : 0,
    amountPaid: Number.isFinite(Number(invoice.amount_paid)) ? Number(invoice.amount_paid) : 0,
    amountRemaining: Number.isFinite(Number(invoice.amount_remaining)) ? Number(invoice.amount_remaining) : 0,
    currency: typeof invoice.currency === "string" ? invoice.currency : "usd",
    createdAt: new Date(timestamp(invoice.created, Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    dueAt: nullableDate(invoice.due_date)?.toISOString() ?? null,
    hostedInvoiceUrl: typeof invoice.hosted_invoice_url === "string" ? invoice.hosted_invoice_url : null,
    invoicePdf: typeof invoice.invoice_pdf === "string" ? invoice.invoice_pdf : null,
    dashboardUrl: typeof invoice.id === "string" ? stripeDashboardUrl("invoice", invoice.id) : null,
    subscriptionId: subscriptionIdFromInvoice(invoice)
  };
}
