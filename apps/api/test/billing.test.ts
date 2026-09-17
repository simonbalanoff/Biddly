import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET ||= "biddly-test-jwt-secret-at-least-thirty-two-characters";
process.env.APP_ORIGIN ||= "http://localhost:3000";
process.env.APP_BASE_URL ||= "http://localhost:3000";

const billing = await import("../src/lib/billing.js");

test("Stripe statuses map to Biddly subscription states", () => {
  assert.equal(billing.mapStripeStatus("active"), "ACTIVE");
  assert.equal(billing.mapStripeStatus("trialing"), "TRIAL");
  assert.equal(billing.mapStripeStatus("past_due"), "PAST_DUE");
  assert.equal(billing.mapStripeStatus("unpaid"), "PAST_DUE");
  assert.equal(billing.mapStripeStatus("canceled"), "CANCELED");
});

test("Stripe subscription snapshots read period data from subscription items", () => {
  const snapshot = billing.subscriptionSnapshot({
    id: "sub_test",
    customer: "cus_test",
    status: "active",
    cancel_at_period_end: true,
    livemode: false,
    metadata: { term: "SEMESTER" },
    items: {
      data: [{
        id: "si_test",
        current_period_start: 1780000000,
        current_period_end: 1790000000,
        price: {
          id: "price_test",
          currency: "usd",
          unit_amount: 12000,
          recurring: { interval: "month" }
        }
      }]
    }
  });

  assert.equal(snapshot.id, "sub_test");
  assert.equal(snapshot.customerId, "cus_test");
  assert.equal(snapshot.status, "ACTIVE");
  assert.equal(snapshot.cancelAtPeriodEnd, true);
  assert.equal(snapshot.subscriptionItemId, "si_test");
  assert.equal(snapshot.unitAmount, 12000);
  assert.equal(snapshot.currency, "usd");
});
