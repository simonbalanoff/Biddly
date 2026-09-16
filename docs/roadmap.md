# Biddly Roadmap

## Backend foundation

- Complete PostgreSQL/Prisma domain model
- Invitation-only chapter provisioning
- Email/password authentication with rotating refresh tokens
- One-user/one-chapter membership invariant
- Chapter roles and permissions
- Recruitment cycles and active-cycle pointer
- Candidate pipeline configuration
- Configurable PNM fields
- Branded public PNM forms
- Mandatory candidate scoring
- Optional comments, replies, and reactions
- Moderation reports and comment moderation
- Candidate archive/restore
- Candidate status history
- Private candidate-photo storage integration
- CSV import/export
- Audit log
- Semester/academic-year subscription data model

## Next development milestone

Build the administration web application against the finalized V1 API.

## After admin web

Build the SwiftUI member application using `/v1/me/context`, active-cycle candidate APIs, scoring, discussion, and moderator actions.

## Before public launch

- Transactional email provider
- Production object-storage credentials
- Billing provider
- Automated integration tests against a disposable PostgreSQL database
- Monitoring and alerting
- Backups and retention jobs
- Privacy policy and terms
- App Store production configuration
