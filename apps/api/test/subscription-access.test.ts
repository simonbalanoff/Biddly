import assert from "node:assert/strict";
import test from "node:test";
import { subscriptionAccessMode, subscriptionIsActive } from "../src/lib/subscription-access.js";

const now = new Date("2026-09-17T12:00:00.000Z");

test("active Stripe subscriptions grant full workspace access", () => {
  assert.equal(subscriptionIsActive({ provider: "stripe", providerSubscriptionId: "sub_test", status: "ACTIVE", periodEnd: new Date("2026-10-17T12:00:00.000Z") }, now), true);
  assert.equal(subscriptionAccessMode({ active: true, chapterRole: "MEMBER", platformRole: "USER" }), "FULL");
});

test("trialing Stripe subscriptions grant full workspace access", () => {
  assert.equal(subscriptionIsActive({ provider: "stripe", providerSubscriptionId: "sub_test", status: "TRIAL", periodEnd: new Date("2026-10-17T12:00:00.000Z") }, now), true);
});

test("past due, canceled, expired, stale, and non-Stripe subscriptions do not grant paid access", () => {
  assert.equal(subscriptionIsActive({ provider: "stripe", providerSubscriptionId: "sub_test", status: "PAST_DUE", periodEnd: new Date("2026-10-17T12:00:00.000Z") }, now), false);
  assert.equal(subscriptionIsActive({ provider: "stripe", providerSubscriptionId: "sub_test", status: "CANCELED", periodEnd: new Date("2026-10-17T12:00:00.000Z") }, now), false);
  assert.equal(subscriptionIsActive({ provider: "stripe", providerSubscriptionId: "sub_test", status: "ACTIVE", periodEnd: new Date("2026-09-16T12:00:00.000Z") }, now), false);
  assert.equal(subscriptionIsActive({ provider: "manual", providerSubscriptionId: "sub_test", status: "ACTIVE", periodEnd: new Date("2026-10-17T12:00:00.000Z") }, now), false);
});

test("unpaid chapter admins receive read-only access while other chapter roles are locked", () => {
  assert.equal(subscriptionAccessMode({ active: false, chapterRole: "CHAPTER_ADMIN", platformRole: "USER" }), "READ_ONLY");
  assert.equal(subscriptionAccessMode({ active: false, chapterRole: "MODERATOR", platformRole: "USER" }), "LOCKED");
  assert.equal(subscriptionAccessMode({ active: false, chapterRole: "MEMBER", platformRole: "USER" }), "LOCKED");
});

test("platform administrators bypass subscription gating", () => {
  assert.equal(subscriptionAccessMode({ active: false, chapterRole: "MEMBER", platformRole: "PLATFORM_ADMIN" }), "FULL");
});
