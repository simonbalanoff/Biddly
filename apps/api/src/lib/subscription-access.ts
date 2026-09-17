import { prisma } from "@biddly/db";

export type SubscriptionAccessMode = "FULL" | "READ_ONLY" | "LOCKED";

export type SubscriptionSnapshotLike = {
  provider?: string | null;
  providerSubscriptionId?: string | null;
  status: string;
  periodEnd: Date;
};

export function subscriptionIsActive(subscription: SubscriptionSnapshotLike | null | undefined, now = new Date()) {
  return Boolean(
    subscription &&
      subscription.provider === "stripe" &&
      subscription.providerSubscriptionId &&
      (subscription.status === "ACTIVE" || subscription.status === "TRIAL") &&
      subscription.periodEnd > now
  );
}

export function subscriptionAccessMode(input: {
  active: boolean;
  chapterRole: "MEMBER" | "MODERATOR" | "CHAPTER_ADMIN" | null;
  platformRole: "USER" | "PLATFORM_ADMIN";
}): SubscriptionAccessMode {
  if (input.platformRole === "PLATFORM_ADMIN" || input.active) return "FULL";
  if (input.chapterRole === "CHAPTER_ADMIN") return "READ_ONLY";
  return "LOCKED";
}

export async function chapterHasActiveSubscription(chapterId: string, now = new Date()) {
  const subscription = await prisma.chapterSubscription.findFirst({
    where: {
      chapterId,
      provider: "stripe",
      providerSubscriptionId: { not: null },
      status: { in: ["ACTIVE", "TRIAL"] },
      periodEnd: { gt: now }
    },
    select: { id: true }
  });

  return Boolean(subscription);
}
