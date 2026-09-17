ALTER TABLE "ChapterSubscription"
ADD COLUMN "providerStatus" TEXT,
ADD COLUMN "providerPriceId" TEXT,
ADD COLUMN "providerSubscriptionItemId" TEXT,
ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canceledAt" TIMESTAMP(3),
ADD COLUMN "trialEnd" TIMESTAMP(3),
ADD COLUMN "currency" TEXT,
ADD COLUMN "unitAmount" INTEGER,
ADD COLUMN "billingInterval" TEXT,
ADD COLUMN "latestInvoiceId" TEXT,
ADD COLUMN "latestInvoiceStatus" TEXT,
ADD COLUMN "livemode" BOOLEAN,
ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ChapterSubscription_providerSubscriptionId_key" ON "ChapterSubscription"("providerSubscriptionId");
CREATE INDEX "ChapterSubscription_providerCustomerId_idx" ON "ChapterSubscription"("providerCustomerId");
CREATE INDEX "ChapterSubscription_lastSyncedAt_idx" ON "ChapterSubscription"("lastSyncedAt");

CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "stripeCreatedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeWebhookEvent_stripeEventId_key" ON "StripeWebhookEvent"("stripeEventId");
CREATE INDEX "StripeWebhookEvent_type_createdAt_idx" ON "StripeWebhookEvent"("type", "createdAt");
CREATE INDEX "StripeWebhookEvent_processedAt_createdAt_idx" ON "StripeWebhookEvent"("processedAt", "createdAt");
