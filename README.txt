Biddly Member Experience + Status Reorder Patch

Apply from ~/Documents/Biddly:

ditto Biddly-Member-Experience-Status-Reorder-Patch biddly
cd biddly
rm -rf apps/web/.next
pnpm typecheck
pnpm dev

No database migration is required.

Changes:
- Chapter members use a dedicated top navigation instead of the admin sidebar.
- Chapter members land directly on PNMs after login or invite acceptance.
- Member PNM experience is photo-first with grid/list views, search, status filtering, sorting, pagination, and inline personal ratings.
- Member PNM list does not expose chapter aggregate scores or contact fields.
- Member direct candidate-detail navigation redirects back to the PNM list.
- PNM list signed photo URLs are generated for chapter members.
- Recruitment statuses can be reordered by drag-and-drop or move up/down controls.
- Reordering updates candidate status positions through the existing status-order API.
