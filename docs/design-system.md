# Biddly design system

## Product direction

Biddly should look like dependable chapter operations software, not a futuristic SaaS template. The interface is intentionally quiet: white surfaces, light gray structure, ordinary system typography, compact tables, and clear blue actions.

The product has two visual layers:

- **Biddly platform UI** uses Biddly blue (`#2563EB`) as its accent.
- **Chapter workspaces** use the chapter's resolved primary color as the accent while keeping the same neutral dashboard structure.

A chapter theme should personalize the product without changing the product's usability. Backgrounds, tables, body copy, destructive actions, success states, and layout remain consistent across every workspace.

## Core principles

1. **Dashboard first.** Screens should read like operational dashboards: page title, a small number of useful summary metrics, then tables/forms that support the real task.
2. **White is the default surface.** Do not create dark navigation, decorative grids, glowing cards, gradient borders, or oversized marketing typography inside the app.
3. **Color is functional.** The chapter primary color is used for primary buttons, active navigation, focus states, links, and selected controls. It should not flood entire screens.
4. **Dense without feeling cramped.** Recruitment involves many PNMs. Tables and lists should favor scanability over oversized cards.
5. **Use normal typography.** The product uses the native/system UI font stack. No display or novelty fonts are required for the dashboard.
6. **One visual language.** Platform admin, chapter admin, moderator, and member views use the same components and spacing system.
7. **Public forms can be more branded.** The PNM-facing form may use the chapter crest and colors more prominently because it is an external chapter touchpoint.

## Color system

### Platform

- Primary: `#2563EB`
- Primary dark: `#1D4ED8`
- Primary soft: `#EFF6FF`
- Page background: `#F7F8FA`
- Surface: `#FFFFFF`
- Main text: `#172033`
- Secondary text: `#667085`
- Border: `#E4E7EC`

### Chapter workspace

Resolve the accent in this order:

1. Chapter primary color
2. Organization primary color
3. Biddly blue

The workspace's background and neutral surfaces do not change with the chapter theme.

## Typography

Use:

`-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`

Typical hierarchy:

- Page title: 25–32px / semibold
- Section title: 15–16px / semibold
- Body: 13–14px
- Table: 12–13px
- Supporting metadata: 10–12px

## Navigation

Desktop navigation uses a white left sidebar with a subtle right border.

Active navigation uses a very light tint of the current workspace accent plus accent-colored text/iconography. The sidebar itself should never become the chapter color.

The current workspace card shows the chapter crest/initials, chapter name, and university.

## Panels and tables

Panels use a 1px neutral border and little to no shadow. Tables are preferred for administrative collections such as PNMs, members, chapters, invitations, imports, and moderation.

Table headers use normal title case rather than all-caps labels. Hover states should be subtle.

## Chapter theming

The following may use the resolved chapter primary color:

- Primary actions
- Active navigation
- Focus rings
- Links
- Score/evaluation emphasis
- Selected filters and statuses where appropriate
- Public form accenting

The following should remain semantic rather than chapter-themed:

- Destructive actions: red
- Success: green
- Warning/pending: amber
- Neutral content: gray

## Public PNM form

The public form is the most branded Biddly surface. It can show the crest, chapter/organization identity, and chapter primary color prominently, but should still remain a simple professional form rather than a marketing page.
