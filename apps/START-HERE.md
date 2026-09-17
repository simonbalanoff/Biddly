# Biddly V3 — Start Here

This is the complete Biddly full-stack project with the V3 dashboard and reusable chapter invite system already merged.

## First-time local setup

1. Copy `.env.example` to `.env` and fill in your local values.
2. Start PostgreSQL with `docker compose up -d`.
3. Install dependencies with `pnpm install`.
4. Generate Prisma with `pnpm db:generate`.
5. Apply database migrations with `pnpm --filter @biddly/db exec prisma migrate dev`.
6. Seed only if you are creating a fresh local database: `pnpm db:seed`.
7. Start the project with `pnpm dev`.

## Existing Biddly database

If you are replacing an older local checkout but keeping your existing database, run:

`pnpm --filter @biddly/db exec prisma migrate dev --name reusable-invite-links`

Do not reseed unless you intentionally want seed data applied.

## Local URLs

- Web: http://localhost:3000
- API: http://localhost:4000
- API health: http://localhost:4000/health

See `README.md` for the main project documentation and `docs/V3-UPDATE.md` for the V3 invite/dashboard changes.
