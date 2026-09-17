# Stripe billing setup

Biddly treats Stripe as the billing source of truth. `ChapterSubscription` rows are synchronized snapshots used for fast application reads, support visibility, and audit context. Subscription changes should be made through the Billing pages or directly in Stripe, then synchronized back through webhooks or the Sync Stripe action.

## Required Stripe objects

Create one Stripe product for Biddly and two recurring Prices:

- Semester
- Academic year

Put their Price IDs into:

```text
STRIPE_PRICE_SEMESTER=price_...
STRIPE_PRICE_ACADEMIC_YEAR=price_...
```

The price recurrence in Stripe controls the real billing interval. Biddly does not calculate charge dates itself.

## Environment

```text
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_SEMESTER=price_...
STRIPE_PRICE_ACADEMIC_YEAR=price_...
STRIPE_PORTAL_CONFIGURATION_ID=bpc_...
STRIPE_API_VERSION=
```

`STRIPE_PORTAL_CONFIGURATION_ID` is optional. If omitted, Stripe uses the account's default customer portal configuration.

`STRIPE_API_VERSION` is optional. Leave it blank to use the Stripe account's configured API version. If you pin a version, test subscription checkout, plan changes, cancellation, invoices, and webhooks before deploying it.

## Customer portal

Configure the Stripe customer portal to allow the billing operations you want Stripe to own directly, especially:

- payment-method updates
- billing-address updates
- invoice and receipt access
- tax information when applicable

Biddly exposes subscription plan changes, cancel-at-period-end, resume, invoice links, and checkout in its own UI. Payment methods remain in Stripe so Biddly never handles raw card details.

## Webhook endpoint

Production endpoint:

```text
https://YOUR_API_HOST/v1/billing/stripe/webhook
```

Subscribe it to at least:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.finalized
invoice.paid
invoice.payment_failed
invoice.payment_action_required
invoice.voided
invoice.marked_uncollectible
```

Biddly verifies the Stripe signature against the unmodified raw request body and stores Stripe event IDs so repeated delivery is idempotent.

## Local webhook testing

Use the Stripe CLI against the local API:

```bash
stripe listen --forward-to localhost:4000/v1/billing/stripe/webhook
```

Copy the `whsec_...` secret printed by the CLI into the local `.env` as `STRIPE_WEBHOOK_SECRET`.

## Chapter administrator workflow

Chapter administrators use `/billing` to:

- choose a plan and enter Stripe Checkout
- see current Stripe status and renewal date
- change between configured Biddly prices
- cancel automatic renewal at the current period end
- restore renewal before cancellation takes effect
- update payment and billing details in Stripe's customer portal
- view Stripe invoices and PDF receipts
- force a Stripe synchronization

## Biddly administrator workflow

Platform administrators use `/platform/billing` to:

- search and filter every workspace's billing state
- open a Stripe-backed workspace billing detail page
- reconcile a workspace from Stripe
- create a Stripe Checkout link for an unsubscribed workspace
- update Stripe customer name and billing email
- change a subscription plan
- cancel at period end
- restore automatic renewal
- immediately cancel a subscription with an explicit confirmation phrase
- view invoices
- open the Stripe customer or subscription directly in the Stripe Dashboard
- see recent webhook processing failures

## Plan changes

Biddly sends `proration_behavior=none` when changing prices. Stripe still controls billing-cycle behavior. Moving between different recurring intervals can reset the billing cycle and trigger an immediate charge. The chapter and platform interfaces show a warning before the change.

## Existing manual subscription records

Old manual `ChapterSubscription` records are preserved for historical database integrity but are ignored by the new billing UI. The old platform endpoints for manually creating or editing subscription records now return a conflict response directing administrators to Stripe billing.
