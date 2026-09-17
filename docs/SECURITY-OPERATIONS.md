# Security operations

Biddly authorization is enforced on the API. Frontend visibility is not considered an access control boundary.

Suspension is hierarchical. A user loses operational chapter access when their user account, chapter, organization, or university is inactive. `/me/context` remains available so the app can explain the suspension state. Public recruitment submissions are also blocked for suspended workspaces.

Platform storage deletion is restricted to objects that are not referenced by candidate records at the time of deletion. The API rechecks references immediately before issuing the delete request.

Platform administrators should use separate accounts from chapter member accounts when possible. Platform actions that mutate workspace administration, subscription state, or storage are written to `PlatformAuditLog`.

Rotate the JWT secret, R2 credentials, Resend key, Stripe key, and database credentials if they are exposed. Revoke active refresh tokens when disabling a user.

Do not log candidate form responses, comment bodies, passwords, raw tokens, or photo contents to external monitoring systems.
