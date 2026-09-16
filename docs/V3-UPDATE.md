# Biddly Dashboard V3 Patch

Copy the contents of this patch into the root of your existing `biddly` project and allow the files to replace the matching paths.

This update changes the Prisma schema, so run this once after applying the patch:

```bash
pnpm --filter @biddly/db exec prisma migrate dev --name reusable-invite-links
```

Then start Biddly normally:

```bash
pnpm dev
```

## What changed

- Cleaner, more conventional dashboard hierarchy and spacing
- Primary navigation simplified to Overview, PNMs, Recruitment, and Members
- Moderation, Import & export, and Settings grouped as administration tools
- Platform administration reorganized around workspaces and setup invitations
- Member administration reorganized around chapter members and reusable invite links
- Chapter invite links can be named, reusable, usage-limited or unlimited, email-restricted, expiring, or non-expiring
- Invite links can be copied again later from the Members page
- Invite usage is tracked in the database
- Invite links can be revoked at any time
- Workspace setup invitations remain one-time by design and now support configurable expiration
- Recruitment configuration is presented as a simpler vertical workflow
- Import/export is de-emphasized as an administrative utility instead of a primary product area
- Dashboard typography, tables, forms, spacing, panels, and mobile behavior were made easier to scan

## Invite behavior

A chapter admin can create a link with:

- Member, Moderator, or Chapter Admin access
- Optional descriptive name
- 1, 7, 30, 90 days, or no expiration
- A maximum number of uses or unlimited uses
- Optional restriction to a single email address

If an email restriction is used, the link automatically becomes single-use.

Workspace-creation invitations are intentionally still one-time links because one redemption creates one chapter workspace.
