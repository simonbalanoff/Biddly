import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import {
  cancelStripeSubscriptionNow,
  changeStripeSubscriptionPlan,
  createStripeCheckout,
  createStripeCustomer,
  getStripePlans,
  listStripeInvoices,
  retrieveStripeCustomer,
  resumeStripeSubscription,
  scheduleStripeCancellation,
  stripeConfigured,
  stripeDashboardMode,
  stripeDashboardUrl,
  summarizeInvoice,
  syncChapterFromStripe,
  syncStripeSubscriptionRecord,
  updateStripeCustomer,
  type BillingTerm
} from "../lib/billing.js";
import { writePlatformAudit } from "../lib/platform-audit.js";
import { requirePlatformAdmin } from "../lib/permissions.js";

function billingTerm(value: unknown): BillingTerm | null {
  return value === "SEMESTER" || value === "ACADEMIC_YEAR" ? value : null;
}

function currentSubscription<T extends { status: string; provider: string | null }>(subscriptions: T[]) {
  const stripe = subscriptions.filter((item) => item.provider === "stripe");
  return stripe.find((item) => ["ACTIVE", "TRIAL", "PAST_DUE"].includes(item.status)) ?? stripe[0] ?? null;
}

async function stripeSubscriptionId(chapterId: string) {
  const subscription = await prisma.chapterSubscription.findFirst({
    where: { chapterId, provider: "stripe", providerSubscriptionId: { not: null }, status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } },
    orderBy: [{ lastSyncedAt: "desc" }, { periodEnd: "desc" }]
  });
  return subscription?.providerSubscriptionId ?? null;
}

async function platformBillingDetail(chapterId: string, sync = true) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      billingCustomerId: true,
      organization: { select: { id: true, name: true, shortName: true, isActive: true } },
      university: { select: { id: true, name: true, shortName: true, isActive: true } },
      memberships: {
        where: { role: "CHAPTER_ADMIN" },
        select: { user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } } },
        orderBy: { createdAt: "asc" }
      },
      subscriptions: { where: { provider: "stripe" }, orderBy: [{ lastSyncedAt: "desc" }, { periodEnd: "desc" }], take: 20 }
    }
  });
  if (!chapter) return null;

  let stripeError: string | null = null;
  if (sync && stripeConfigured() && chapter.billingCustomerId) {
    try {
      await syncChapterFromStripe(chapter.id);
    } catch (caught) {
      stripeError = caught instanceof Error ? caught.message : "Unable to sync Stripe";
    }
  }

  const subscriptions = await prisma.chapterSubscription.findMany({
    where: { chapterId, provider: "stripe" },
    orderBy: [{ lastSyncedAt: "desc" }, { periodEnd: "desc" }],
    take: 20
  });
  const active = currentSubscription(subscriptions);
  let customer: Record<string, any> | null = null;
  let invoices: ReturnType<typeof summarizeInvoice>[] = [];
  let plans: Awaited<ReturnType<typeof getStripePlans>> = [];

  if (stripeConfigured()) {
    try {
      plans = await getStripePlans();
      if (chapter.billingCustomerId) {
        const [stripeCustomer, stripeInvoices] = await Promise.all([
          retrieveStripeCustomer(chapter.billingCustomerId),
          listStripeInvoices(chapter.billingCustomerId, 25)
        ]);
        customer = stripeCustomer;
        invoices = (stripeInvoices.data ?? []).map(summarizeInvoice);
      }
    } catch (caught) {
      stripeError ??= caught instanceof Error ? caught.message : "Unable to load Stripe billing";
    }
  }

  const customerId = chapter.billingCustomerId;
  return {
    configured: stripeConfigured(),
    testMode: stripeDashboardMode() === "test",
    stripeError,
    chapter: {
      id: chapter.id,
      name: chapter.name,
      slug: chapter.slug,
      isActive: chapter.isActive,
      organization: chapter.organization,
      university: chapter.university,
      admins: chapter.memberships.map((membership) => membership.user)
    },
    customer: customer ? {
      id: String(customer.id ?? ""),
      email: typeof customer.email === "string" ? customer.email : null,
      name: typeof customer.name === "string" ? customer.name : null,
      delinquent: Boolean(customer.delinquent),
      balance: Number.isFinite(Number(customer.balance)) ? Number(customer.balance) : 0,
      currency: typeof customer.currency === "string" ? customer.currency : null
    } : null,
    currentSubscription: active,
    subscriptions,
    plans,
    invoices,
    dashboard: {
      customer: customerId ? stripeDashboardUrl("customer", customerId) : null,
      subscription: active?.providerSubscriptionId ? stripeDashboardUrl("subscription", active.providerSubscriptionId) : null
    }
  };
}

export async function platformBillingRoutes(app: FastifyInstance) {
  app.get(
    "/platform/billing",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async () => {
      const chapters = await prisma.chapter.findMany({
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          isActive: true,
          billingCustomerId: true,
          organization: { select: { name: true, shortName: true, isActive: true } },
          university: { select: { name: true, shortName: true, isActive: true } },
          subscriptions: { where: { provider: "stripe" }, orderBy: [{ lastSyncedAt: "desc" }, { periodEnd: "desc" }], take: 3 }
        }
      });
      const webhookEvents = await prisma.stripeWebhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 25 });
      return {
        configured: stripeConfigured(),
        testMode: stripeDashboardMode() === "test",
        webhookHealth: {
          failed: webhookEvents.filter((event) => !event.processedAt && Boolean(event.error)).length,
          pending: webhookEvents.filter((event) => !event.processedAt && !event.error).length,
          recent: webhookEvents.slice(0, 10)
        },
        workspaces: chapters.map((chapter) => ({
          id: chapter.id,
          name: chapter.name,
          isActive: chapter.isActive,
          billingCustomerId: chapter.billingCustomerId,
          organization: chapter.organization,
          university: chapter.university,
          subscription: currentSubscription(chapter.subscriptions)
        }))
      };
    }
  );

  app.get(
    "/platform/billing/:chapterId",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (request, reply) => {
      const { chapterId } = request.params as { chapterId: string };
      const detail = await platformBillingDetail(chapterId, true);
      if (!detail) return reply.code(404).send({ error: "Chapter workspace not found" });
      return detail;
    }
  );

  app.post(
    "/platform/billing/:chapterId/sync",
    { preHandler: [app.requireAuth, requirePlatformAdmin], config: { rateLimit: { max: 20, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      const user = request.authUser;
      const { chapterId } = request.params as { chapterId: string };
      if (!user) return reply.code(401).send({ error: "Authentication required" });
      if (!stripeConfigured()) return reply.code(503).send({ error: "Stripe billing is not configured" });
      const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { id: true } });
      if (!chapter) return reply.code(404).send({ error: "Chapter workspace not found" });
      await syncChapterFromStripe(chapterId);
      await writePlatformAudit(prisma, { actorId: user.id, action: "STRIPE_SYNCED", targetType: "Chapter", targetId: chapterId });
      return platformBillingDetail(chapterId, false);
    }
  );

  app.post(
    "/platform/billing/:chapterId/checkout",
    { preHandler: [app.requireAuth, requirePlatformAdmin], config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const user = request.authUser;
      const { chapterId } = request.params as { chapterId: string };
      const term = billingTerm((request.body as { term?: unknown } | null)?.term);
      if (!user || !term) return reply.code(400).send({ error: "A billing term is required" });
      if (!stripeConfigured()) return reply.code(503).send({ error: "Stripe billing is not configured" });

      const chapter = await prisma.chapter.findUnique({
        where: { id: chapterId },
        select: {
          id: true,
          name: true,
          billingCustomerId: true,
          organization: { select: { name: true } },
          memberships: { where: { role: "CHAPTER_ADMIN", user: { isActive: true } }, select: { user: { select: { email: true } } }, take: 1 }
        }
      });
      if (!chapter) return reply.code(404).send({ error: "Chapter workspace not found" });

      await syncChapterFromStripe(chapterId);
      const existing = await prisma.chapterSubscription.findFirst({ where: { chapterId, provider: "stripe", status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } } });
      if (existing?.providerSubscriptionId) return reply.code(409).send({ error: "This workspace already has a Stripe subscription" });

      let customerId = chapter.billingCustomerId;
      if (!customerId) {
        const email = chapter.memberships[0]?.user.email;
        if (!email) return reply.code(409).send({ error: "The workspace needs an active chapter administrator before creating a Stripe customer" });
        const customer = await createStripeCustomer({ email, name: `${chapter.organization.name} · ${chapter.name}`, chapterId });
        customerId = String(customer.id ?? "");
        if (!customerId) throw new Error("Stripe did not return a customer ID");
        await prisma.chapter.update({ where: { id: chapterId }, data: { billingCustomerId: customerId } });
      }

      const session = await createStripeCheckout({ customerId, chapterId, term });
      await writePlatformAudit(prisma, { actorId: user.id, action: "STRIPE_CHECKOUT_CREATED", targetType: "Chapter", targetId: chapterId, metadata: { term } });
      return { url: session.url };
    }
  );

  app.patch(
    "/platform/billing/:chapterId/customer",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (request, reply) => {
      const user = request.authUser;
      const { chapterId } = request.params as { chapterId: string };
      const body = request.body as { email?: unknown; name?: unknown };
      if (!user) return reply.code(401).send({ error: "Authentication required" });
      const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { billingCustomerId: true } });
      if (!chapter?.billingCustomerId) return reply.code(409).send({ error: "No Stripe customer is attached to this workspace" });
      const email = typeof body?.email === "string" && body.email.includes("@") ? body.email.trim().toLowerCase() : undefined;
      const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : undefined;
      if (!email && !name) return reply.code(400).send({ error: "A customer name or email is required" });
      await updateStripeCustomer(chapter.billingCustomerId, { email, name, chapterId });
      await writePlatformAudit(prisma, { actorId: user.id, action: "STRIPE_CUSTOMER_UPDATED", targetType: "Chapter", targetId: chapterId, metadata: { email: email ?? null, name: name ?? null } });
      return platformBillingDetail(chapterId, false);
    }
  );

  app.post(
    "/platform/billing/:chapterId/plan",
    { preHandler: [app.requireAuth, requirePlatformAdmin], config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const user = request.authUser;
      const { chapterId } = request.params as { chapterId: string };
      const term = billingTerm((request.body as { term?: unknown } | null)?.term);
      if (!user || !term) return reply.code(400).send({ error: "A billing term is required" });
      const subscriptionId = await stripeSubscriptionId(chapterId);
      if (!subscriptionId) return reply.code(409).send({ error: "No Stripe subscription is attached to this workspace" });
      const updated = await changeStripeSubscriptionPlan(subscriptionId, term);
      await syncStripeSubscriptionRecord(updated);
      await writePlatformAudit(prisma, { actorId: user.id, action: "STRIPE_PLAN_CHANGED", targetType: "Chapter", targetId: chapterId, metadata: { subscriptionId, term } });
      return platformBillingDetail(chapterId, false);
    }
  );

  app.post(
    "/platform/billing/:chapterId/cancel",
    { preHandler: [app.requireAuth, requirePlatformAdmin], config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const user = request.authUser;
      const { chapterId } = request.params as { chapterId: string };
      if (!user) return reply.code(401).send({ error: "Authentication required" });
      const subscriptionId = await stripeSubscriptionId(chapterId);
      if (!subscriptionId) return reply.code(409).send({ error: "No Stripe subscription is attached to this workspace" });
      const updated = await scheduleStripeCancellation(subscriptionId);
      await syncStripeSubscriptionRecord(updated);
      await writePlatformAudit(prisma, { actorId: user.id, action: "STRIPE_CANCELLATION_SCHEDULED", targetType: "Chapter", targetId: chapterId, metadata: { subscriptionId } });
      return platformBillingDetail(chapterId, false);
    }
  );

  app.post(
    "/platform/billing/:chapterId/resume",
    { preHandler: [app.requireAuth, requirePlatformAdmin], config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const user = request.authUser;
      const { chapterId } = request.params as { chapterId: string };
      if (!user) return reply.code(401).send({ error: "Authentication required" });
      const subscriptionId = await stripeSubscriptionId(chapterId);
      if (!subscriptionId) return reply.code(409).send({ error: "No Stripe subscription is attached to this workspace" });
      const updated = await resumeStripeSubscription(subscriptionId);
      await syncStripeSubscriptionRecord(updated);
      await writePlatformAudit(prisma, { actorId: user.id, action: "STRIPE_CANCELLATION_REVERSED", targetType: "Chapter", targetId: chapterId, metadata: { subscriptionId } });
      return platformBillingDetail(chapterId, false);
    }
  );

  app.delete(
    "/platform/billing/:chapterId/subscription",
    { preHandler: [app.requireAuth, requirePlatformAdmin], config: { rateLimit: { max: 3, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const user = request.authUser;
      const { chapterId } = request.params as { chapterId: string };
      const confirm = (request.body as { confirm?: unknown } | null)?.confirm;
      if (!user || confirm !== "CANCEL NOW") return reply.code(400).send({ error: "Type CANCEL NOW to confirm immediate cancellation" });
      const subscriptionId = await stripeSubscriptionId(chapterId);
      if (!subscriptionId) return reply.code(409).send({ error: "No Stripe subscription is attached to this workspace" });
      const canceled = await cancelStripeSubscriptionNow(subscriptionId);
      await syncStripeSubscriptionRecord(canceled);
      await writePlatformAudit(prisma, { actorId: user.id, action: "STRIPE_SUBSCRIPTION_CANCELED_NOW", targetType: "Chapter", targetId: chapterId, metadata: { subscriptionId } });
      return platformBillingDetail(chapterId, false);
    }
  );
}
