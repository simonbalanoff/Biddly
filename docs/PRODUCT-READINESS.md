# Product readiness additions

This readiness pass connects the operational pieces Biddly needs before a real launch without changing the core recruitment privacy boundary.

## Platform administration

The workspace view now supports workspace metadata, catalog association, support notes, storage quota, workspace suspension, organization and university suspension, member role/account access, member invite resend/revoke, administrator access reissue, and manual subscription support.

The System page shows service readiness, lightweight API process health, and the global platform audit trail. Storage administration supports reference-safe orphan deletion and cleanup history.

## Storage

Workspace storage quotas are optional. When a quota is set, authenticated photo uploads and public-form photo uploads check current private-bucket usage before a new upload URL is issued.

Storage cleanup is limited to objects that are not referenced by candidate records at deletion time. Selected deletion performs a fresh reference check immediately before the R2 delete request.

## Email

Set `RESEND_API_KEY` and `EMAIL_FROM` to enable transactional delivery for password reset, chapter invitations, workspace invitations, invitation resend, and administrator access reissue.

In development only, password reset returns a debug URL when email delivery is not configured or fails. Production does not expose reset tokens in API responses.

## Billing

Set the Stripe secret, webhook secret, and both price IDs to enable checkout and the customer billing portal. Configure Stripe to deliver subscription webhooks to `/v1/billing/stripe/webhook`.

Biddly also retains manual platform subscription controls for support and migration cases. Subscription records do not silently suspend a chapter; billing enforcement should only be enabled after plan rules and grace periods are finalized.

## Monitoring

The API attaches an `X-Request-Id` header and returns the request ID with handled API errors. The System page shows in-process traffic/error counters. Set `ERROR_REPORT_WEBHOOK_URL` to send sanitized 5xx event metadata to an external collector.

## Tests

`pnpm test` runs fast API tests. Integration tests require a disposable PostgreSQL database:

```bash
TEST_DATABASE_URL=postgresql://... pnpm test:integration
```

The integration suite covers hierarchical suspension and chapter role boundaries for candidate management, rating, and commenting.
