# Biddly

Biddly is a multi-tenant Greek-life recruitment platform. This repository contains the web app, API, shared contracts, and PostgreSQL/Prisma database package.

## Repository layout

```text
biddly/
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   ├── contracts/
│   └── db/
├── docs/
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

## Core backend guarantees

- A normal user belongs to at most one chapter.
- Chapter data is always scoped server-side by `chapterId`.
- A chapter has at most one active recruitment cycle pointer.
- Every candidate belongs to one chapter and one recruitment cycle.
- Scoring is always available and cannot be disabled.
- Comments, replies, and reactions can be enabled independently within the allowed hierarchy.
- Candidates are archived instead of hard-deleted.
- Candidate photos are stored by private object key and served through short-lived signed URLs.
- Administrative mutations are recorded in the audit log.
- Public PNM forms only write into the chapter and cycle that own the form.

## Local setup

1. Install Node.js 22+ and enable pnpm with Corepack.
2. Copy `.env.example` to `.env` and replace the development secrets.
3. Start PostgreSQL.
4. Install dependencies.
5. Generate Prisma Client.
6. Create the initial migration.
7. Seed reference data and a platform administrator.
8. Start the API and web app.

```bash
corepack enable
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm --filter @biddly/db exec prisma migrate dev --name init
pnpm db:seed
pnpm local
```

The API runs on `http://localhost:4000` by default. The web app runs on `http://localhost:3000`. The API loads the repository root `.env` automatically in development.

After the one-time install/migration/seed, normal local startup is simply:

```bash
pnpm local
```

This starts PostgreSQL through Docker and then starts the API and web app. Stop the application with `Control-C`; stop PostgreSQL with `pnpm local:stop`.

## First pilot setup

Set these values in `.env` before seeding:

```text
SEED_ADMIN_EMAIL="your-email@example.com"
SEED_ADMIN_PASSWORD="a-long-development-password"
SEED_ADMIN_FIRST_NAME="Your"
SEED_ADMIN_LAST_NAME="Name"
```

After seeding:

1. Log in as the platform administrator.
2. Create a workspace invite for the Colorado State SigEp recruitment chair.
3. Accept the workspace invite and create the Colorado Gamma workspace.
4. Create a recruitment cycle such as `Fall 2026`.
5. Activate the cycle.
6. Configure candidate fields and the public recruitment form.
7. Open the form.
8. Invite members.

## API versioning

Application routes are under `/v1`. Health is available at `/health`.

See `docs/backend-api.md` for the V1 route inventory.

## CSV imports

Candidate CSV imports accept a mapping from CSV column names to Biddly fields.

Example:

```json
{
  "csv": "Name,Phone,GPA\\nJohn Smith,9705551234,3.6",
  "mapping": {
    "Name": "fullName",
    "Phone": "phone",
    "GPA": "custom:gpa"
  }
}
```

Supported core targets are:

```text
fullName
firstName
lastName
email
phone
status
```

Custom fields use `custom:<field-key>`.

Imports validate the entire file before writing any candidates. If any row fails validation, nothing is imported.

## Candidate photos

Biddly is designed to use a private Cloudflare R2 bucket for PNM photos. Configure:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
```

Clients should resize and compress images before requesting an upload URL. The current API caps candidate-photo uploads at 2 MB and accepts JPEG, PNG, and WebP.

Branding assets currently accept hosted URLs. They should eventually use a separate public asset bucket or image pipeline rather than the private candidate-photo bucket.

## Email delivery

Workspace and chapter invite endpoints return secure invitation URLs. This allows the first pilot to run without committing to an email provider.

Password reset tokens are fully modeled and validated. In development, the API returns a debug reset URL. Before public launch, connect the reset/invite URLs to a transactional email provider such as SES, Resend, Postmark, or another provider chosen for the production environment.

## Database deployment

Development:

```bash
pnpm --filter @biddly/db exec prisma migrate dev --name descriptive-name
```

Production migrations should be committed and deployed with Prisma Migrate after the first migration is generated on a machine with dependencies installed.

## Web frontend

The Biddly web app now includes the complete V1 chapter experience:

```text
/login
/setup?token=...
/join?token=...
/dashboard
/candidates
/candidates/:candidateId
/recruitment
/recruitment/form
/members
/data
/moderation
/settings
/platform
/r/:public-form-slug
```

Before running the web app, create its local environment file:

```bash
cp apps/web/.env.example apps/web/.env.local
```

The default value points the frontend at the local API:

```text
NEXT_PUBLIC_API_BASE_URL="http://localhost:4000/v1"
```

The administrative UI intentionally stays neutral and uses the chapter color as an accent. Public recruitment forms use more chapter branding. See `docs/design-system.md` for the design rules.

### Recommended first end-to-end run

1. Seed the platform administrator.
2. Sign in at `/login` and open `/platform`.
3. Create a workspace invitation for Colorado Gamma.
4. Open the generated `/setup?token=...` link in a private browser window.
5. Create the chapter workspace.
6. Create and activate `Fall 2026` from Recruitment.
7. Add chapter-specific PNM fields.
8. Configure and open the public recruitment form.
9. Submit one test PNM through `/r/:slug`.
10. Invite a chapter member.
11. Score and discuss the test PNM.
12. Export the cycle from Data.
