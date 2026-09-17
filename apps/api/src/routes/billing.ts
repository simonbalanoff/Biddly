import { Readable } from "node:stream";
import { prisma } from "@biddly/db";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  asRecord,
  cancelStripeSubscriptionNow,
  changeStripeSubscriptionPlan,
  createStripeCheckout,
  createStripeCustomer,
  createStripePortal,
  getStripePlans,
  listStripeInvoices,
  retrieveCheckoutSession,
  retrieveStripeCustomer,
  retrieveStripeSubscription,
  resumeStripeSubscription,
  scheduleStripeCancellation,
  stripeConfigured,
  stripeDashboardMode,
  summarizeInvoice,
  syncChapterFromStripe,
  syncStripeInvoice,
  syncStripeSubscriptionRecord,
  verifyStripeSignature,
  type BillingTerm
} from "../lib/billing.js";
import { requireChapterRole } from "../lib/permissions.js";

async function captureRawBody(request: FastifyRequest, _reply: FastifyReply, payload: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of payload) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);
  (request as FastifyRequest & { rawBody?: string }).rawBody = buffer.toString("utf8");
  return Readable.from(buffer);
}

function billingTerm(value: unknown): BillingTerm | null {
  return value === "SEMESTER" || value === "ACADEMIC_YEAR" ? value : null;
}

function customerSummary(customer: Record<string, any> | null) {
  if (!customer) return null;
  return {
    id: String(customer.id ?? ""),
    email: typeof customer.email === "string" ? customer.email : null,
    name: typeof customer.name === "string" ? customer.name : null,
    delinquent: Boolean(customer.delinquent),
    balance: Number.isFinite(Number(customer.balance)) ? Number(customer.balance) : 0,
    currency: typeof customer.currency === "string" ? customer.currency : null
  };
}

function currentSubscription<T extends { status: string; periodEnd: Date; provider: string | null }>(subscriptions: T[]) {
  const stripe = subscriptions.filter((item) => item.provider === "stripe");
  const preferred = stripe.find((item) => ["ACTIVE", "TRIAL", "PAST_DUE"].includes(item.status));
  return preferred ?? stripe[0] ?? null;
}

async function chapterBillingState(chapterId: string, sync = true) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      name: true,
      billingCustomerId: true,
      organization: { select: { name: true } },
      subscriptions: { where: { provider: "stripe" }, orderBy: [{ lastSyncedAt: "desc" }, { periodEnd: "desc" }], take: 20 }
    }
  });
  if (!chapter) return null;

  let stripeError: string | null = null;
  if (sync && stripeConfigured() && chapter.billingCustomerId) {
    try {
      await syncChapterFromStripe(chapterId);
    } catch (caught) {
      stripeError = caught instanceof Error ? caught.message : "Unable to sync Stripe";
    }
  }

  const refreshed = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      name: true,
      billingCustomerId: true,
      subscriptions: { where: { provider: "stripe" }, orderBy: [{ lastSyncedAt: "desc" }, { periodEnd: "desc" }], take: 20 }
    }
  });

  const subscriptions = refreshed?.subscriptions ?? chapter.subscriptions;
  const active = currentSubscription(subscriptions);
  let customer: Record<string, any> | null = null;
  let invoices: ReturnType<typeof summarizeInvoice>[] = [];
  let plans: Awaited<ReturnType<typeof getStripePlans>> = [];

  if (stripeConfigured()) {
    try {
      plans = await getStripePlans();
      if (refreshed?.billingCustomerId) {
        const [stripeCustomer, invoiceList] = await Promise.all([
          retrieveStripeCustomer(refreshed.billingCustomerId),
          listStripeInvoices(refreshed.billingCustomerId, 12)
        ]);
        customer = stripeCustomer;
        invoices = (invoiceList.data ?? []).map((invoice) => summarizeInvoice(asRecord(invoice)));
      }
    } catch (caught) {
      stripeError ??= caught instanceof Error ? caught.message : "Unable to load Stripe billing";
    }
  }

  return {
    configured: stripeConfigured(),
    testMode: stripeDashboardMode() === "test",
    stripeError,
    customerAttached: Boolean(refreshed?.billingCustomerId),
    customer: customerSummary(customer),
    currentSubscription: active,
    subscriptions,
    plans,
    invoices
  };
}

async function ensureCustomer(chapterId: string, email: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, name: true, billingCustomerId: true, organization: { select: { name: true } } }
  });
  if (!chapter) return null;
  if (chapter.billingCustomerId) return { chapter, customerId: chapter.billingCustomerId };
  const customer = await createStripeCustomer({ email, name: `${chapter.organization.name} · ${chapter.name}`, chapterId: chapter.id });
  const customerId = String(customer.id ?? "");
  if (!customerId) throw new Error("Stripe did not return a customer ID");
  await prisma.chapter.update({ where: { id: chapter.id }, data: { billingCustomerId: customerId } });
  return { chapter, customerId };
}

async function ownedSubscription(chapterId: string) {
  const record = await prisma.chapterSubscription.findFirst({
    where: { chapterId, provider: "stripe", providerSubscriptionId: { not: null }, status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } },
    orderBy: [{ lastSyncedAt: "desc" }, { periodEnd: "desc" }]
  });
  return record?.providerSubscriptionId ?? null;
}

export async function billingRoutes(app: FastifyInstance) {
  app.get(
    "/chapter/billing",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const user = request.authUser;
      if (!user?.chapterId) return reply.code(403).send({ error: "Chapter access required" });
      const state = await chapterBillingState(user.chapterId, true);
      if (!state) return reply.code(404).send({ error: "Chapter not found" });
      return state;
    }
  );

  app.post(
    "/chapter/billing/sync",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")], config: { rateLimit: { max: 12, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user?.chapterId) return reply.code(403).send({ error: "Chapter access required" });
      if (!stripeConfigured()) return reply.code(503).send({ error: "Stripe billing is not configured" });
      await syncChapterFromStripe(user.chapterId);
      return chapterBillingState(user.chapterId, false);
    }
  );

  app.post(
    "/chapter/billing/checkout",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")], config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const user = request.authUser;
      const term = billingTerm((request.body as { term?: unknown } | null)?.term);
      if (!user?.chapterId || !term) return reply.code(400).send({ error: "A billing term is required" });
      if (!stripeConfigured()) return reply.code(503).send({ error: "Stripe billing is not configured" });

      await syncChapterFromStripe(user.chapterId).catch(() => null);
      const existing = await prisma.chapterSubscription.findFirst({
        where: { chapterId: user.chapterId, provider: "stripe", status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } },
        orderBy: { lastSyncedAt: "desc" }
      });
      if (existing?.providerSubscriptionId) return reply.code(409).send({ error: "This workspace already has a Stripe subscription. Manage the existing subscription instead." });

      const customer = await ensureCustomer(user.chapterId, user.email);
      if (!customer) return reply.code(404).send({ error: "Chapter not found" });
      const session = await createStripeCheckout({ customerId: customer.customerId, chapterId: user.chapterId, term });
      return { url: session.url };
    }
  );

  app.post(
    "/chapter/billing/checkout/complete",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")], config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const user = request.authUser;
      const sessionId = (request.body as { sessionId?: unknown } | null)?.sessionId;
      if (!user?.chapterId || typeof sessionId !== "string" || !sessionId.startsWith("cs_")) return reply.code(400).send({ error: "A valid checkout session is required" });
      const session = await retrieveCheckoutSession(sessionId);
      const metadata = asRecord(session.metadata);
      if (metadata.chapterId !== user.chapterId && session.client_reference_id !== user.chapterId) return reply.code(403).send({ error: "Checkout session does not belong to this workspace" });
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (customerId) await prisma.chapter.update({ where: { id: user.chapterId }, data: { billingCustomerId: customerId } });
      if (subscriptionId) await syncStripeSubscriptionRecord(await retrieveStripeSubscription(subscriptionId));
      return chapterBillingState(user.chapterId, false);
    }
  );

  app.post(
    "/chapter/billing/portal",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")], config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user?.chapterId) return reply.code(403).send({ error: "Chapter access required" });
      if (!stripeConfigured()) return reply.code(503).send({ error: "Stripe billing is not configured" });
      const chapter = await prisma.chapter.findUnique({ where: { id: user.chapterId }, select: { billingCustomerId: true } });
      if (!chapter?.billingCustomerId) return reply.code(409).send({ error: "No Stripe customer is attached to this workspace yet" });
      const session = await createStripePortal({ customerId: chapter.billingCustomerId });
      return { url: session.url };
    }
  );

  app.post(
    "/chapter/billing/plan",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")], config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const user = request.authUser;
      const term = billingTerm((request.body as { term?: unknown } | null)?.term);
      if (!user?.chapterId || !term) return reply.code(400).send({ error: "A billing term is required" });
      const subscriptionId = await ownedSubscription(user.chapterId);
      if (!subscriptionId) return reply.code(409).send({ error: "No Stripe subscription is attached to this workspace" });
      const updated = await changeStripeSubscriptionPlan(subscriptionId, term);
      await syncStripeSubscriptionRecord(updated);
      return chapterBillingState(user.chapterId, false);
    }
  );

  app.post(
    "/chapter/billing/cancel",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")], config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user?.chapterId) return reply.code(403).send({ error: "Chapter access required" });
      const subscriptionId = await ownedSubscription(user.chapterId);
      if (!subscriptionId) return reply.code(409).send({ error: "No Stripe subscription is attached to this workspace" });
      const updated = await scheduleStripeCancellation(subscriptionId);
      await syncStripeSubscriptionRecord(updated);
      return chapterBillingState(user.chapterId, false);
    }
  );

  app.post(
    "/chapter/billing/resume",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")], config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const user = request.authUser;
      if (!user?.chapterId) return reply.code(403).send({ error: "Chapter access required" });
      const subscriptionId = await ownedSubscription(user.chapterId);
      if (!subscriptionId) return reply.code(409).send({ error: "No Stripe subscription is attached to this workspace" });
      const updated = await resumeStripeSubscription(subscriptionId);
      await syncStripeSubscriptionRecord(updated);
      return chapterBillingState(user.chapterId, false);
    }
  );

  app.post(
    "/billing/stripe/webhook",
    { preParsing: captureRawBody, config: { rateLimit: { max: 240, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody ?? "";
      const signature = request.headers["stripe-signature"];
      if (!rawBody || typeof signature !== "string" || !verifyStripeSignature(rawBody, signature)) return reply.code(400).send({ error: "Invalid Stripe signature" });

      const event = asRecord(request.body);
      const eventId = typeof event.id === "string" ? event.id : null;
      const type = String(event.type ?? "");
      if (!eventId || !type) return reply.code(400).send({ error: "Invalid Stripe event" });

      const webhookRecord = await prisma.stripeWebhookEvent.upsert({
        where: { stripeEventId: eventId },
        update: {},
        create: {
          stripeEventId: eventId,
          type,
          livemode: Boolean(event.livemode),
          stripeCreatedAt: Number.isFinite(Number(event.created)) ? new Date(Number(event.created) * 1000) : null
        }
      });
      if (webhookRecord.processedAt) return { received: true, duplicate: true };

      try {
        const object = asRecord(asRecord(event.data).object);
        if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"].includes(type)) {
          await syncStripeSubscriptionRecord(object);
        } else if (["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required", "invoice.finalized", "invoice.voided", "invoice.marked_uncollectible"].includes(type)) {
          await syncStripeInvoice(object);
        } else if (type === "checkout.session.completed") {
          const metadata = asRecord(object.metadata);
          const chapterId = typeof metadata.chapterId === "string" ? metadata.chapterId : typeof object.client_reference_id === "string" ? object.client_reference_id : null;
          const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
          const subscriptionId = typeof object.subscription === "string" ? object.subscription : object.subscription?.id;
          if (chapterId && customerId) await prisma.chapter.update({ where: { id: chapterId }, data: { billingCustomerId: customerId } }).catch(() => null);
          if (subscriptionId) await syncStripeSubscriptionRecord(await retrieveStripeSubscription(subscriptionId));
        }

        await prisma.stripeWebhookEvent.update({ where: { stripeEventId: eventId }, data: { processedAt: new Date(), error: null } });
        return { received: true };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message.slice(0, 1000) : "Webhook processing failed";
        await prisma.stripeWebhookEvent.update({ where: { stripeEventId: eventId }, data: { error: message } }).catch(() => null);
        throw caught;
      }
    }
  );
}
