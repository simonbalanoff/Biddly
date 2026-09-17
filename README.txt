Biddly Cohesive UX Polish Patch

Built on top of the current member-experience/status-reorder version.

Apply from ~/Documents/Biddly with:

ditto Biddly-Cohesive-UX-Polish-Patch biddly
cd biddly
rm -rf apps/web/.next
pnpm typecheck
pnpm dev

No database migration is required.
