# Biddly Web

The Biddly web app is the administrative and recruitment web experience for chapter members, recruitment chairs, moderators, and platform administrators.

## Local setup

From the repository root:

```bash
cp apps/web/.env.example apps/web/.env.local
pnpm install
pnpm dev
```

The web app runs at `http://localhost:3000` and expects the API at `http://localhost:4000/v1` by default.

To point the frontend at another API, update:

```text
NEXT_PUBLIC_API_BASE_URL="https://your-api.example.com/v1"
```

## Main routes

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

## Product surfaces

- Overview dashboard with recruitment health and recent activity
- Searchable, filterable PNM management
- Detailed PNM profiles with scoring, status, custom fields, discussion, and history
- Recruitment-cycle, pipeline, custom-field, and public-form configuration
- Member invitations and role management
- CSV import/export
- Moderation queue
- Chapter branding and scoring settings
- Platform workspace provisioning
- Chapter-branded public PNM intake form

The visual system is documented in `../../docs/design-system.md` in the full repository.
