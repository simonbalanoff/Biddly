# Biddly V1 Architecture

## Domain hierarchy

```text
Platform
└── Organization
    └── Chapter
        ├── Chapter Memberships
        ├── Chapter Settings
        ├── Branding
        └── Recruitment Cycles
            ├── Candidate Statuses
            ├── Candidate Field Definitions
            ├── Public Recruitment Form
            └── Candidates
                ├── Custom Field Values
                ├── Evaluations
                ├── Status History
                └── Comments
                    ├── Replies
                    ├── Reactions
                    └── Moderation Reports
```

## Tenant boundary

`Chapter` is the permanent tenant boundary.

Chapter-owned records carry `chapterId` directly whenever they are accessed frequently or security-sensitive. Recruitment data additionally carries `recruitmentCycleId`.

Authorization never trusts a chapter ID supplied by the client when the authenticated user's chapter is authoritative.

## Authentication

Users authenticate with email and password.

The API issues short-lived JWT access tokens and opaque refresh tokens. Only refresh-token hashes are stored in PostgreSQL. Refresh tokens rotate on use and can be revoked when a user is removed from a chapter or resets a password.

All normal account creation is invitation-based.

## Workspace onboarding

A platform administrator creates a `WorkspaceInvite`. The recruitment chair accepts it and selects the preloaded organization and university if those were not locked by the invite.

Acceptance atomically creates:

```text
User
Chapter
ChapterSettings
ChapterBranding
ChapterMembership(CHAPTER_ADMIN)
AuditLog
```

The database enforces one chapter per organization/university pair and one chapter membership per user.

## Recruitment cycles

Recruitment cycles are `DRAFT`, `ACTIVE`, or `ARCHIVED`.

The authoritative current cycle is `Chapter.activeRecruitmentCycleId`. Activation archives any previously active cycle and moves the chapter pointer atomically.

## Public forms

Each cycle gets one public form with a random component in its slug.

The form independently configures email, phone, and photo as hidden, optional, or required. Custom fields can be exposed on the public form and marked required.

Public submissions are only accepted while both the form is open and the owning cycle is active.

## Scoring

Every chapter has a score range and step. The default is 1–10 in increments of 1.

Each member can have one evaluation per candidate. Re-submission updates that evaluation. Candidate aggregates are recalculated transactionally after each score update.

## Discussion

Comments can be disabled without affecting scoring. Replies require comments. Reactions require comments.

Comments use moderation states rather than destructive deletion. Moderators can hide, restore, or remove comments. Members can report comments, and reports have a review lifecycle.

## Candidate lifecycle

Candidates are soft-archived. Status changes create immutable status-history records. PNM fields can be configured per recruitment cycle.

## Object storage

Candidate photos are private objects stored outside PostgreSQL. The database stores only an object key. Authenticated clients receive short-lived signed download URLs.

Public form submissions can receive a short-lived signed upload URL after the candidate record is created.

## Billing groundwork

`ChapterSubscription` supports semester and academic-year periods. Payment-provider integration is deliberately separate from the recruitment domain so Stripe or another provider can be introduced without changing chapter/candidate data.
