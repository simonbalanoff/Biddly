# Biddly production checklist

## Before every production deploy

1. Run `pnpm install --frozen-lockfile`.
2. Run `pnpm db:generate`.
3. Run `pnpm db:deploy`.
4. Run `pnpm typecheck`.
5. Run `pnpm test`.
6. Run integration tests against a disposable database with `TEST_DATABASE_URL=... pnpm test:integration`.
7. Run `pnpm build`.
8. Run `pnpm prod:check` with the production environment loaded.

## Required infrastructure

- PostgreSQL with automated backups and point-in-time recovery if the provider supports it.
- Cloudflare R2 private bucket for candidate photos.
- Resend credentials for password resets and invitations.
- Stripe products/prices for semester and academic-year plans.
- Stripe webhook pointed at `/v1/billing/stripe/webhook`.
- External error webhook or monitoring collector.
- HTTPS for the web app and API.

## Deployment sequence

Deploy database migrations before starting API code that depends on them. Keep migrations forward-only. Take a database backup before destructive or high-risk migrations. Deploy the API before the web app when the web build depends on new endpoints.

## Recovery

Keep database backups separate from application hosting. R2 object storage and PostgreSQL should have independent recovery procedures. Test restoration before launch and after major infrastructure changes.
