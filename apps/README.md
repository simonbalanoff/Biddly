# Biddly Chapter Invite Theme Fallback Fix

This fixes chapter member invite pages incorrectly falling back to Biddly blue when a chapter inherits its colors from the parent organization.

Theme resolution now matches the rest of Biddly:

1. Chapter branding override
2. Organization branding default
3. Biddly fallback

The same fallback now applies to the crest/logo.

## Apply

```bash
ditto ~/Downloads/Biddly-Chapter-Invite-Theme-Fallback-Fix/apps ~/Documents/Biddly/biddly/apps
cd ~/Documents/Biddly/biddly
pnpm dev
```

No database migration is required.
