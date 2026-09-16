# Biddly V1 API

Base path: `/v1`

## Health

`GET /health`

## Catalog

`GET /v1/catalog/organizations`

`GET /v1/catalog/universities`

## Authentication

`POST /v1/auth/login`

`POST /v1/auth/refresh`

`POST /v1/auth/logout`

`GET /v1/auth/workspace-invites/:token`

`POST /v1/auth/workspace-invites/accept`

`GET /v1/auth/chapter-invites/:token`

`POST /v1/auth/chapter-invites/accept`

`POST /v1/auth/password-reset/request`

`POST /v1/auth/password-reset/confirm`

## Current user

`GET /v1/me/context`

## Platform administration

`POST /v1/platform/workspace-invites`

`GET /v1/platform/workspace-invites`

`DELETE /v1/platform/workspace-invites/:inviteId` — revoke and remove a pending or expired workspace invitation

`POST /v1/platform/organizations`

`POST /v1/platform/universities`

`GET /v1/platform/chapters`

## Chapter administration

`GET /v1/chapter`

`PATCH /v1/chapter`

`PATCH /v1/chapter/branding`

`PATCH /v1/chapter/settings`

`GET /v1/chapter/members`

`PATCH /v1/chapter/members/:membershipId/role`

`DELETE /v1/chapter/members/:membershipId`

`POST /v1/chapter/invites`

`GET /v1/chapter/invites`

`DELETE /v1/chapter/invites/:inviteId`

`GET /v1/chapter/audit-logs`

`GET /v1/chapter/subscription`

## Recruitment cycles

`GET /v1/recruitment-cycles`

`POST /v1/recruitment-cycles`

`GET /v1/recruitment-cycles/:cycleId`

`PATCH /v1/recruitment-cycles/:cycleId`

`POST /v1/recruitment-cycles/:cycleId/activate`

`POST /v1/recruitment-cycles/:cycleId/archive`

## Recruitment statuses

`POST /v1/recruitment-cycles/:cycleId/statuses`

`PATCH /v1/recruitment-cycles/:cycleId/statuses/:statusId`

`DELETE /v1/recruitment-cycles/:cycleId/statuses/:statusId`

`PUT /v1/recruitment-cycles/:cycleId/statuses/order`

## Candidate field configuration

`POST /v1/recruitment-cycles/:cycleId/fields`

`PATCH /v1/recruitment-cycles/:cycleId/fields/:fieldId`

`DELETE /v1/recruitment-cycles/:cycleId/fields/:fieldId`

`PUT /v1/recruitment-cycles/:cycleId/fields/order`

## Public form configuration

`GET /v1/recruitment-cycles/:cycleId/form`

`PATCH /v1/recruitment-cycles/:cycleId/form`

## Candidates

`GET /v1/candidates`

`POST /v1/candidates`

`GET /v1/candidates/:candidateId`

`PATCH /v1/candidates/:candidateId`

`POST /v1/candidates/:candidateId/archive`

`POST /v1/candidates/:candidateId/restore`

`PATCH /v1/candidates/:candidateId/status`

`POST /v1/candidates/:candidateId/evaluations`

`POST /v1/candidates/:candidateId/photo-upload`

`GET /v1/candidates/:candidateId/photo`

## Discussion

`GET /v1/candidates/:candidateId/comments`

`POST /v1/candidates/:candidateId/comments`

`PATCH /v1/comments/:commentId`

`DELETE /v1/comments/:commentId`

`PUT /v1/comments/:commentId/reactions`

`DELETE /v1/comments/:commentId/reactions`

`POST /v1/comments/:commentId/moderate`

`POST /v1/comments/:commentId/reports`

`GET /v1/chapter/moderation/reports`

`POST /v1/chapter/moderation/reports/:reportId/resolve`

## Import and export

`POST /v1/chapter/imports/candidates`

`GET /v1/chapter/exports/candidates.csv`

## Public recruitment forms

`GET /v1/public/forms/:slug`

`POST /v1/public/forms/:slug/submissions`
